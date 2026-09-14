import { describe, expect, it, vi } from 'vitest'
import type { ApplicationConfiguration } from '../../src/scaffolding/configuration.js'
import { createApp } from '../../src/scaffolding/http/app.js'
import { FakeProtocolClient } from '../fixtures/fakes.js'
import { InMemoryCredentialStore } from '../../src/scaffolding/session/in-memory-stores.js'
import type { ApplicationUserId, ConnectionId } from '../../src/oauth/index.js'

const configuration: ApplicationConfiguration = {
  nodeEnv: 'test',
  port: 4002,
  sessionSecret: 'test-session-secret-with-more-than-32-characters',
  oauth: {
    issuer: new URL('https://issuer.example'),
    clientId: 'client',
    clientSecret: 'secret',
    redirectUri: 'http://localhost:4002/oauth/callback',
    meEndpoint: new URL('https://issuer.example/v2/me'),
  },
}

async function openSession(app: ReturnType<typeof createApp>): Promise<{
  cookie: string
  csrfToken: string
}> {
  const response = await app.request('/')
  const html = await response.text()
  const csrfToken = html.match(/name="csrf_token" value="([^"]+)"/)?.[1]
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  if (!csrfToken || !cookie)
    throw new Error('Expected session cookie and CSRF token.')
  return { cookie, csrfToken }
}

function formRequest(cookie: string, csrfToken?: string): RequestInit {
  return {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body:
      csrfToken === undefined
        ? ''
        : new URLSearchParams({ csrf_token: csrfToken }),
  }
}

describe('Hono scaffolding', () => {
  it('sets a signed HTTP-only SameSite cookie and redirects a CSRF-protected authorization start', async () => {
    const app = createApp(configuration, new FakeProtocolClient())
    const session = await openSession(app)
    const response = await app.request(
      '/oauth/start',
      formRequest(session.cookie, session.csrfToken),
    )
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('state=generated-state')
    const initialCookie = (await app.request('/')).headers.get('set-cookie')
    expect(initialCookie).toContain('HttpOnly')
    expect(initialCookie).toContain('SameSite=Lax')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each(['/oauth/start', '/me', '/refresh', '/revoke', '/reset'])(
    'rejects missing and incorrect CSRF tokens on POST %s',
    async (route) => {
      const app = createApp(configuration, new FakeProtocolClient())
      const session = await openSession(app)
      expect(
        (await app.request(route, formRequest(session.cookie))).status,
      ).toBe(403)
      expect(
        (
          await app.request(
            route,
            formRequest(session.cookie, 'incorrect-token'),
          )
        ).status,
      ).toBe(403)
    },
  )

  it('does not require a form CSRF token on the OAuth callback GET', async () => {
    const protocol = new FakeProtocolClient()
    const app = createApp(configuration, protocol)
    const session = await openSession(app)
    await app.request(
      '/oauth/start',
      formRequest(session.cookie, session.csrfToken),
    )
    const callback = await app.request(
      '/oauth/callback?code=code&state=generated-state',
      { headers: { cookie: session.cookie } },
    )
    expect(callback.status).toBe(302)
    expect(protocol.exchanged).toBeDefined()
  })

  it('rejects a callback in a different browser session even for the fixed demo user', async () => {
    const protocol = new FakeProtocolClient()
    const app = createApp(configuration, protocol)
    const initiating = await openSession(app)
    await app.request(
      '/oauth/start',
      formRequest(initiating.cookie, initiating.csrfToken),
    )
    const other = await openSession(app)
    const callback = await app.request(
      '/oauth/callback?code=code&state=generated-state',
      { headers: { cookie: other.cookie } },
    )
    expect(callback.status).toBe(302)
    expect(protocol.exchanged).toBeUndefined()
  })

  it('never returns credentials in browser HTML after callback and /v2/me', async () => {
    const protocol = new FakeProtocolClient()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: 42 }))
    const app = createApp(configuration, protocol, { fetcher })
    const session = await openSession(app)
    await app.request(
      '/oauth/start',
      formRequest(session.cookie, session.csrfToken),
    )
    await app.request(
      '/oauth/callback?code=private-code&state=generated-state',
      { headers: { cookie: session.cookie } },
    )
    await app.request('/me', formRequest(session.cookie, session.csrfToken))
    const html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('&quot;id&quot;: 42')
    expect(html).not.toContain('server-access-token')
    expect(html).not.toContain('private-code')
    expect(html).not.toContain('server-only-verifier')
    expect(html).not.toContain(configuration.oauth.clientSecret)
  })

  it('shows and CSRF-protects refresh only when the stored connection has a refresh token', async () => {
    const credentials = new InMemoryCredentialStore()
    const protocol = new FakeProtocolClient()
    const app = createApp(configuration, protocol, { credentials })
    const session = await openSession(app)
    let html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).not.toContain('action="/refresh"')

    await credentials.replace(
      'local-demo-user' as ApplicationUserId,
      'default' as ConnectionId,
      {
        accessToken: 'private-access',
        refreshToken: 'private-refresh',
        scope: 'me:read offline_access',
      },
    )
    html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('action="/refresh"')
    expect(html).not.toContain('private-refresh')

    const response = await app.request(
      '/refresh',
      formRequest(session.cookie, session.csrfToken),
    )
    expect(response.status).toBe(302)
    expect(protocol.refreshed).toHaveLength(1)
  })
})
