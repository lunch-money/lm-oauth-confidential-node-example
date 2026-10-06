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
  type AccountId,
  type LunchMoneyConnection,
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
import { browserSession } from '../session/session-cookie.js'

// Replace this fixed teaching identity with the application user ID read from
// your authenticated server session on every request. Never accept the OAuth
// credential owner from a form field, query parameter, or callback value.
const DEMO_APPLICATION_USER_ID = 'local-demo-user' as ApplicationUserId

function sortedConnections(
  connections: LunchMoneyConnection[],
): LunchMoneyConnection[] {
  return [...connections].sort(
    (left, right) => left.accountId - right.accountId,
  )
}

function requireActiveAccountId(activeAccountId?: AccountId): AccountId {
  if (activeAccountId === undefined) {
    throw new Error('No active Lunch Money budget is selected.')
  }
  return activeAccountId
}

export interface AppDependencies {
  readonly attempts?: InMemoryAuthorizationAttemptStore
  readonly browserSessions?: InMemoryBrowserSessionStore
  readonly credentials?: InMemoryCredentialStore
  readonly fetcher?: typeof fetch
  readonly refreshCoordinator?: InMemoryRefreshCoordinator
}

/**
 * Call during server startup to connect HTTP requests to the framework-neutral
 * OAuth teaching functions. Routes use a fixed demo identity so the sample can
 * run without an application login. A real application must replace it with the
 * user ID from its authenticated server session before storing, reading,
 * refreshing, revoking, or deleting that user's credentials.
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
    const allConnections = sortedConnections(
      await credentials.list(DEMO_APPLICATION_USER_ID),
    )
    const activeConnection = allConnections.find(
      (connection) => connection.accountId === session.value.activeAccountId,
    )
    if (session.value.activeLunchMoneyUserId === undefined) {
      const fallback = activeConnection ?? allConnections[0]
      if (fallback) {
        session.value.activeLunchMoneyUserId = fallback.lunchMoneyUserId
        session.value.activeAccountId = fallback.accountId
      }
    }
    const connections = allConnections.filter(
      (connection) =>
        connection.lunchMoneyUserId === session.value.activeLunchMoneyUserId,
    )
    if (
      session.value.activeAccountId === undefined ||
      !connections.some(
        (connection) => connection.accountId === session.value.activeAccountId,
      )
    ) {
      const fallback = connections[0]
      if (fallback) session.value.activeAccountId = fallback.accountId
      else delete session.value.activeAccountId
    }
    const stored = connections.find(
      (connection) => connection.accountId === session.value.activeAccountId,
    )
    return context.html(
      page({
        ...session.value,
        canRefresh: Boolean(stored?.credentials.refreshToken),
        connections: connections.map(({ accountId, budgetName }) => ({
          accountId,
          budgetName,
        })),
      }),
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
      // The Connect form starts OAuth for the user and browser session established by the server above.
      const url = await startAuthorization(protocol, attempts, {
        applicationUserId: DEMO_APPLICATION_USER_ID,
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
      // Lunch Money returns here; completeAuthorization checks the saved attempt before storing credentials for its owner.
      const connected = await completeAuthorization(
        protocol,
        attempts,
        credentials,
        new URL(context.req.url),
        DEMO_APPLICATION_USER_ID,
        session.id,
        configuration.oauth.meEndpoint,
        fetcher,
      )
      const connectedRecord = await credentials.get(
        DEMO_APPLICATION_USER_ID,
        connected.accountId,
      )
      if (!connectedRecord) throw new Error('Connected budget was not stored.')
      session.value.activeAccountId = connected.accountId
      session.value.activeLunchMoneyUserId = connectedRecord.lunchMoneyUserId
      delete session.value.profile
      refreshCoordinator.clearReauthorizationRequired({
        applicationUserId: DEMO_APPLICATION_USER_ID,
        accountId: connected.accountId,
      })
      const authorizedBudgetCount = (
        await credentials.list(DEMO_APPLICATION_USER_ID)
      ).filter(
        (connection) =>
          connection.lunchMoneyUserId === connectedRecord.lunchMoneyUserId,
      ).length
      session.value.message = `${connectedRecord.lunchMoneyUserName ?? 'Lunch Money user'} is connected. ${authorizedBudgetCount} authorized ${authorizedBudgetCount === 1 ? 'budget' : 'budgets'}.`
    } catch (error) {
      session.value.message = publicErrorMessage(error)
      console.error(JSON.stringify({ event: 'oauth.callback.failed' }))
    }
    return context.redirect('/')
  })

  app.post('/connections/active', async (context) => {
    const session = await browserSession(
      context,
      configuration,
      browserSessions,
    )
    if (!(await verifyCsrfToken(context, session.value))) {
      return context.text('Invalid CSRF token.', 403)
    }
    const body = await context.req.parseBody()
    const submitted = body.account_id
    const parsed =
      typeof submitted === 'string' && /^\d+$/.test(submitted)
        ? Number(submitted)
        : Number.NaN
    if (!Number.isSafeInteger(parsed)) {
      return context.text('Invalid budgeting account.', 400)
    }
    const accountId = parsed as AccountId
    const connection = await credentials.get(
      DEMO_APPLICATION_USER_ID,
      accountId,
    )
    if (
      !connection ||
      connection.lunchMoneyUserId !== session.value.activeLunchMoneyUserId
    ) {
      return context.text('Budgeting account not found.', 404)
    }
    session.value.activeAccountId = accountId
    delete session.value.profile
    delete session.value.refresh
    delete session.value.revocation
    session.value.message = `Active budget changed to ${connection.budgetName}.`
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
      // The profile button makes a server-side API call with credentials stored for this application user.
      session.value.profile = await readLunchMoneyProfile(
        credentials,
        {
          applicationUserId: DEMO_APPLICATION_USER_ID,
          accountId: requireActiveAccountId(session.value.activeAccountId),
        },
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
      // The refresh button asks the teaching workflow to replace this connection's credential set safely.
      session.value.refresh = await refreshConnection(
        protocol,
        credentials,
        refreshCoordinator,
        {
          applicationUserId: DEMO_APPLICATION_USER_ID,
          accountId: requireActiveAccountId(session.value.activeAccountId),
        },
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
      // The disconnect button revokes server-held credentials, verifies the old access token, and removes the local set.
      session.value.revocation = await revokeAndVerify(
        protocol,
        credentials,
        {
          applicationUserId: DEMO_APPLICATION_USER_ID,
          accountId: requireActiveAccountId(session.value.activeAccountId),
        },
        configuration.oauth.meEndpoint,
        fetcher,
      )
      delete session.value.profile
      const remaining = sortedConnections(
        await credentials.list(DEMO_APPLICATION_USER_ID),
      ).filter(
        (connection) =>
          connection.lunchMoneyUserId === session.value.activeLunchMoneyUserId,
      )
      const fallback = remaining[0]
      if (fallback) session.value.activeAccountId = fallback.accountId
      else delete session.value.activeAccountId
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
    // Reset clears only this sample's local state; it is not a substitute for revoking access at Lunch Money.
    const accountId = requireActiveAccountId(session.value.activeAccountId)
    await deleteCredentials(credentials, DEMO_APPLICATION_USER_ID, accountId)
    refreshCoordinator.clearReauthorizationRequired({
      applicationUserId: DEMO_APPLICATION_USER_ID,
      accountId,
    })
    const remaining = sortedConnections(
      await credentials.list(DEMO_APPLICATION_USER_ID),
    ).filter(
      (connection) =>
        connection.lunchMoneyUserId === session.value.activeLunchMoneyUserId,
    )
    const fallback = remaining[0]
    if (fallback) session.value.activeAccountId = fallback.accountId
    else delete session.value.activeAccountId
    delete session.value.profile
    delete session.value.refresh
    delete session.value.revocation
    session.value.message = 'The active budget was removed from this sample.'
    return context.redirect('/')
  })

  return app
}
