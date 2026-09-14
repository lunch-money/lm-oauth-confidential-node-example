import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import {
  completeAuthorization,
  deleteCredentials,
  publicErrorMessage,
  readLunchMoneyProfile,
  refreshConnection,
  revokeAndVerify,
  startAuthorization,
  type ApplicationUserId,
  type ConnectionId,
  type OAuthProtocolClient,
} from '../../oauth/index.js'
import type { ApplicationConfiguration } from '../configuration.js'
import { page } from '../presentation/pages.js'
import {
  InMemoryAuthorizationAttemptStore,
  InMemoryBrowserSessionStore,
  InMemoryCredentialStore,
  InMemoryRefreshCoordinator,
} from '../session/in-memory-stores.js'
import { verifyCsrfToken } from '../session/csrf.js'
import {
  browserSession,
  clearBrowserCookie,
} from '../session/session-cookie.js'

// Demonstration identity only. Production must obtain this from its own authenticated server session.
const DEMO_APPLICATION_USER_ID = 'local-demo-user' as ApplicationUserId
const DEMO_CONNECTION_ID = 'default' as ConnectionId

export interface AppDependencies {
  readonly attempts?: InMemoryAuthorizationAttemptStore
  readonly browserSessions?: InMemoryBrowserSessionStore
  readonly credentials?: InMemoryCredentialStore
  readonly fetcher?: typeof fetch
  readonly refreshCoordinator?: InMemoryRefreshCoordinator
}

/**
 * Creates the thin Hono adapter. Routes use a fixed demo identity so the sample
 * can run without an application login; this is not multi-user authentication
 * or isolation and must be replaced in production.
 */
export function createApp(
  configuration: ApplicationConfiguration,
  protocol: OAuthProtocolClient,
  dependencies: AppDependencies = {},
): Hono {
  const app = new Hono()
  const attempts =
    dependencies.attempts ?? new InMemoryAuthorizationAttemptStore()
  const browserSessions =
    dependencies.browserSessions ?? new InMemoryBrowserSessionStore()
  const credentials = dependencies.credentials ?? new InMemoryCredentialStore()
  const refreshCoordinator =
    dependencies.refreshCoordinator ?? new InMemoryRefreshCoordinator()
  const fetcher = dependencies.fetcher ?? fetch
  const owner = {
    applicationUserId: DEMO_APPLICATION_USER_ID,
    connectionId: DEMO_CONNECTION_ID,
  }

  app.use('*', async (context, next) => {
    context.header('Cache-Control', 'no-store')
    context.header('Referrer-Policy', 'no-referrer')
    context.header('X-Content-Type-Options', 'nosniff')
    await next()
  })

  app.get('/', async (context) => {
    const session = await browserSession(
      context,
      configuration,
      browserSessions,
    )
    const stored = await credentials.get(
      owner.applicationUserId,
      owner.connectionId,
    )
    return context.html(
      page({ ...session.value, canRefresh: Boolean(stored?.refreshToken) }),
    )
  })

  app.get('/styles.css', async (context) => {
    context.header('Content-Type', 'text/css; charset=UTF-8')
    return context.body(
      await readFile(
        new URL('../presentation/styles.css', import.meta.url),
        'utf8',
      ),
    )
  })

  app.post('/oauth/start', async (context) => {
    const session = await browserSession(
      context,
      configuration,
      browserSessions,
    )
    if (!(await verifyCsrfToken(context, session.value))) {
      return context.text('Invalid CSRF token.', 403)
    }
    try {
      const url = await startAuthorization(protocol, attempts, {
        ...owner,
        applicationSessionId: session.id,
        redirectUri: configuration.oauth.redirectUri,
      })
      return context.redirect(url.toString())
    } catch {
      // Security invariant: default logs contain event names only, never exceptions or OAuth values.
      console.error(JSON.stringify({ event: 'oauth.authorization.failed' }))
      return context.text('OAuth authorization could not start.', 502)
    }
  })

  app.get('/oauth/callback', async (context) => {
    const session = await browserSession(
      context,
      configuration,
      browserSessions,
    )
    try {
      await completeAuthorization(
        protocol,
        attempts,
        credentials,
        new URL(context.req.url),
        owner.applicationUserId,
        session.id,
      )
      refreshCoordinator.clearReauthorizationRequired(owner)
      session.value.message =
        'Lunch Money is connected. The credential is stored only on the server.'
    } catch (error) {
      session.value.message = publicErrorMessage(error)
      console.error(JSON.stringify({ event: 'oauth.callback.failed' }))
    }
    return context.redirect('/')
  })

  app.post('/me', async (context) => {
    const session = await browserSession(
      context,
      configuration,
      browserSessions,
    )
    if (!(await verifyCsrfToken(context, session.value))) {
      return context.text('Invalid CSRF token.', 403)
    }
    try {
      session.value.profile = await readLunchMoneyProfile(
        credentials,
        owner,
        configuration.oauth.meEndpoint,
        fetcher,
      )
      session.value.message = 'Lunch Money returned /v2/me successfully.'
    } catch (error) {
      session.value.message = publicErrorMessage(error)
    }
    return context.redirect('/')
  })

  app.post('/refresh', async (context) => {
    const session = await browserSession(
      context,
      configuration,
      browserSessions,
    )
    if (!(await verifyCsrfToken(context, session.value))) {
      return context.text('Invalid CSRF token.', 403)
    }
    try {
      session.value.refresh = await refreshConnection(
        protocol,
        credentials,
        refreshCoordinator,
        owner,
      )
      session.value.message =
        session.value.refresh.status === 'refreshed'
          ? 'Lunch Money rotated the access and refresh credentials. The replacement set was stored atomically.'
          : session.value.refresh.status === 'refresh_not_available'
            ? 'Refresh is unavailable. Register a replacement client with offline_access and authorize it.'
            : session.value.refresh.status === 'refresh_in_progress'
              ? 'A refresh is already in progress for this connection.'
              : 'This connection must be authorized again.'
    } catch (error) {
      session.value.message = publicErrorMessage(error)
    }
    return context.redirect('/')
  })

  app.post('/revoke', async (context) => {
    const session = await browserSession(
      context,
      configuration,
      browserSessions,
    )
    if (!(await verifyCsrfToken(context, session.value))) {
      return context.text('Invalid CSRF token.', 403)
    }
    try {
      session.value.revocation = await revokeAndVerify(
        protocol,
        credentials,
        owner,
        configuration.oauth.meEndpoint,
        fetcher,
      )
      delete session.value.profile
      session.value.message =
        'Lunch Money access was revoked and the old access token was rejected.'
    } catch (error) {
      session.value.message = publicErrorMessage(error)
    }
    return context.redirect('/')
  })

  app.post('/reset', async (context) => {
    const session = await browserSession(
      context,
      configuration,
      browserSessions,
    )
    if (!(await verifyCsrfToken(context, session.value))) {
      return context.text('Invalid CSRF token.', 403)
    }
    await deleteCredentials(
      credentials,
      owner.applicationUserId,
      owner.connectionId,
    )
    refreshCoordinator.clearReauthorizationRequired(owner)
    browserSessions.delete(session.id)
    clearBrowserCookie(context)
    return context.redirect('/')
  })

  return app
}
