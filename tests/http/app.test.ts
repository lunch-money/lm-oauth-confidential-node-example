import { describe, expect, it, vi } from 'vitest'
import type { ApplicationConfiguration } from '../../src/scaffolding/configuration.js'
import { createApp } from '../../src/scaffolding/http/app.js'
import { FakeProtocolClient } from '../fixtures/fakes.js'
import { InMemoryCredentialStore } from '../../src/scaffolding/session/in-memory-stores.js'
import type { AccountId, ApplicationUserId } from '../../src/oauth/index.js'

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

function formRequest(
  cookie: string,
  csrfToken?: string,
  fields: Record<string, string> = {},
): RequestInit {
  return {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body:
      csrfToken === undefined
        ? ''
        : new URLSearchParams({ csrf_token: csrfToken, ...fields }),
  }
}

function profile(accountId: number, budgetName: string) {
  return {
    name: 'Demo User',
    email: 'demo@example.com',
    id: 42,
    account_id: accountId,
    budget_name: budgetName,
    primary_currency: 'usd',
    api_key_label: null,
  }
}

describe('Hono scaffolding', () => {
  it('sets a signed HTTP-only SameSite cookie and redirects a CSRF-protected authorization start', async () => {
    const protocol = new FakeProtocolClient()
    const app = createApp(configuration, protocol)
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

  it.each([
    '/oauth/start',
    '/connections/active',
    '/me',
    '/refresh',
    '/revoke',
    '/reset',
  ])('rejects missing and incorrect CSRF tokens on POST %s', async (route) => {
    const app = createApp(configuration, new FakeProtocolClient())
    const session = await openSession(app)
    expect((await app.request(route, formRequest(session.cookie))).status).toBe(
      403,
    )
    expect(
      (await app.request(route, formRequest(session.cookie, 'incorrect-token')))
        .status,
    ).toBe(403)
  })

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
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        name: 'Demo User',
        email: 'demo@example.com',
        id: 42,
        account_id: 84,
        budget_name: 'Demo budget',
        primary_currency: 'usd',
        api_key_label: null,
      }),
    )
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
    expect(html).toContain('How this authorization was processed')
    expect(html).toContain('Inspect the credential response locally')
    expect(html).toContain('exchangeCallback()')
    expect(html).toContain('accessToken: string')
    expect(html).not.toMatch(/github\.com[^"']+#L\d+/)
    expect(
      html.match(/target="_blank" rel="noopener noreferrer"/g),
    ).toHaveLength(4)
  })

  it.each(['/revoke', '/reset'])(
    'clears the authorization explanation after POST %s',
    async (route) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(profile(84, 'Demo budget')))
        .mockResolvedValue(new Response(null, { status: 401 }))
      const app = createApp(configuration, new FakeProtocolClient(), {
        fetcher,
      })
      const session = await openSession(app)
      await app.request(
        '/oauth/start',
        formRequest(session.cookie, session.csrfToken),
      )
      await app.request('/oauth/callback?code=code&state=generated-state', {
        headers: { cookie: session.cookie },
      })
      expect(
        await (
          await app.request('/', { headers: { cookie: session.cookie } })
        ).text(),
      ).toContain('How this authorization was processed')

      await app.request(route, formRequest(session.cookie, session.csrfToken))
      expect(
        await (
          await app.request('/', { headers: { cookie: session.cookie } })
        ).text(),
      ).not.toContain('How this authorization was processed')
    },
  )

  it('shows and CSRF-protects refresh only when the stored connection has a refresh token', async () => {
    const credentials = new InMemoryCredentialStore()
    const protocol = new FakeProtocolClient()
    const app = createApp(configuration, protocol, { credentials })
    const session = await openSession(app)
    let html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).not.toContain('action="/refresh"')

    await credentials.upsert('local-demo-user' as ApplicationUserId, {
      accountId: 84 as AccountId,
      budgetName: 'Demo budget',
      lunchMoneyUserId: 42,
      credentials: {
        accessToken: 'private-access',
        refreshToken: 'private-refresh',
        scope: 'me:read offline_access',
      },
    })
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

  it('keeps two authorized budgets, activates the newest, and switches locally without OAuth', async () => {
    const protocol = new FakeProtocolClient()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(profile(84, 'Household')))
      .mockResolvedValueOnce(Response.json(profile(91, 'API testing')))
      .mockResolvedValueOnce(Response.json(profile(84, 'Household')))
    const app = createApp(configuration, protocol, { fetcher })
    const session = await openSession(app)

    protocol.credentials = { accessToken: 'budget-a-token', scope: 'me:read' }
    await app.request(
      '/oauth/start',
      formRequest(session.cookie, session.csrfToken),
    )
    await app.request('/oauth/callback?code=a&state=generated-state', {
      headers: { cookie: session.cookie },
    })

    protocol.credentials = { accessToken: 'budget-b-token', scope: 'me:read' }
    await app.request(
      '/oauth/start',
      formRequest(session.cookie, session.csrfToken),
    )
    await app.request('/oauth/callback?code=b&state=generated-state', {
      headers: { cookie: session.cookie },
    })

    let html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('Household')
    expect(html).toContain('API testing')
    expect(html).toContain('<h2>Active budget</h2>')
    expect(html).toContain('<form class="success"')
    expect(html).toContain('value="91" selected')
    expect(html).toContain('onchange="this.form.submit()"')
    expect(html).not.toContain('Switch budget')
    expect(html).toContain('Authorize another budget')
    expect(html).toContain('Demo User is connected. 2 authorized budgets.')
    expect(html).toContain(
      'Added API testing to Demo User&#39;s budget selector.',
    )
    expect(html).toContain('The active user now has 2 authorized budgets.')
    expect(html).toContain('Disconnect active budget')
    expect(html).toContain('Forget local credential only')
    expect(html).toContain(
      "confirm('Forget this local credential without revoking access at Lunch Money?')",
    )

    const exchangedBeforeSwitch = protocol.exchanged
    const switched = await app.request(
      '/connections/active',
      formRequest(session.cookie, session.csrfToken, { account_id: '84' }),
    )
    expect(switched.status).toBe(302)
    expect(protocol.exchanged).toBe(exchangedBeforeSwitch)
    html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('No profile has been loaded')
    expect(html).not.toContain('How this authorization was processed')

    await app.request('/me', formRequest(session.cookie, session.csrfToken))
    html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('value="84" selected')
    expect(fetcher).toHaveBeenLastCalledWith(
      configuration.oauth.meEndpoint,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer budget-a-token',
        }),
      }),
    )
  })

  it('rejects selection of a budget not owned by the application user', async () => {
    const credentials = new InMemoryCredentialStore()
    await credentials.upsert('another-user' as ApplicationUserId, {
      accountId: 500 as AccountId,
      budgetName: 'Not mine',
      credentials: { accessToken: 'other-token', scope: 'me:read' },
      lunchMoneyUserId: 99,
    })
    const app = createApp(configuration, new FakeProtocolClient(), {
      credentials,
    })
    const session = await openSession(app)
    const response = await app.request(
      '/connections/active',
      formRequest(session.cookie, session.csrfToken, { account_id: '500' }),
    )
    expect(response.status).toBe(404)
  })

  it('reauthorizes an existing account in place and keeps duplicate names distinct', async () => {
    const credentials = new InMemoryCredentialStore()
    await credentials.upsert('local-demo-user' as ApplicationUserId, {
      accountId: 84 as AccountId,
      budgetName: 'Shared name',
      credentials: { accessToken: 'old-token', scope: 'me:read' },
      lunchMoneyUserId: 42,
    })
    await credentials.upsert('local-demo-user' as ApplicationUserId, {
      accountId: 91 as AccountId,
      budgetName: 'Shared name',
      credentials: { accessToken: 'other-token', scope: 'me:read' },
      lunchMoneyUserId: 42,
    })
    const protocol = new FakeProtocolClient()
    protocol.credentials = {
      accessToken: 'replacement-token',
      scope: 'me:read',
    }
    const app = createApp(configuration, protocol, {
      credentials,
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(profile(84, 'Shared name'))),
    })
    const session = await openSession(app)
    await app.request(
      '/oauth/start',
      formRequest(session.cookie, session.csrfToken),
    )
    await app.request('/oauth/callback?code=new&state=generated-state', {
      headers: { cookie: session.cookie },
    })

    expect(
      await credentials.list('local-demo-user' as ApplicationUserId),
    ).toHaveLength(2)
    expect(
      (
        await credentials.get('local-demo-user' as ApplicationUserId, {
          accountId: 84 as AccountId,
          lunchMoneyUserId: 42,
        })
      )?.credentials.accessToken,
    ).toBe('replacement-token')
    const html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('Shared name · account 84')
    expect(html).toContain('Shared name · account 91')
    expect(html).toContain('Replaced the stored authorization for Shared name.')
  })

  it('shows only the newly authorized user’s budgets after identity changes', async () => {
    const credentials = new InMemoryCredentialStore()
    await credentials.upsert('local-demo-user' as ApplicationUserId, {
      accountId: 84 as AccountId,
      budgetName: 'Household',
      credentials: { accessToken: 'first-user-token', scope: 'me:read' },
      lunchMoneyUserId: 42,
    })
    await credentials.upsert('local-demo-user' as ApplicationUserId, {
      accountId: 85 as AccountId,
      budgetName: 'Savings',
      credentials: {
        accessToken: 'first-user-savings-token',
        scope: 'me:read',
      },
      lunchMoneyUserId: 42,
    })
    const protocol = new FakeProtocolClient()
    protocol.credentials = {
      accessToken: 'second-user-token',
      scope: 'me:read',
    }
    const app = createApp(configuration, protocol, {
      credentials,
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({
            ...profile(91, 'Personal'),
            id: 77,
            email: 'another@example.com',
          }),
        )
        .mockResolvedValueOnce(Response.json(profile(84, 'Household'))),
    })
    const session = await openSession(app)
    await app.request(
      '/oauth/start',
      formRequest(session.cookie, session.csrfToken),
    )
    await app.request('/oauth/callback?code=second&state=generated-state', {
      headers: { cookie: session.cookie },
    })

    const html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('Demo User is connected. 1 authorized budget.')
    expect(html).toContain('Personal')
    expect(html).not.toContain('Household')
    expect(html).not.toContain('Savings')
    expect(html).not.toContain('another@example.com')
    expect(html).toContain(
      'Switched to Demo User and hid the previous user&#39;s budgets. Their credentials remain in this sample&#39;s server-side memory until they are disconnected, forgotten, or the sample is restarted.',
    )
    expect(
      await credentials.get('local-demo-user' as ApplicationUserId, {
        accountId: 84 as AccountId,
        lunchMoneyUserId: 42,
      }),
    ).toBeDefined()
    const hiddenSelection = await app.request(
      '/connections/active',
      formRequest(session.cookie, session.csrfToken, { account_id: '84' }),
    )
    expect(hiddenSelection.status).toBe(404)

    await app.request(
      '/oauth/start',
      formRequest(session.cookie, session.csrfToken),
    )
    await app.request('/oauth/callback?code=return&state=generated-state', {
      headers: { cookie: session.cookie },
    })
    const returnedHtml = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(returnedHtml).toContain(
      'Demo User is connected. 2 authorized budgets.',
    )
    expect(returnedHtml).toContain('Household')
    expect(returnedHtml).toContain('Savings')
    expect(returnedHtml).not.toContain('Personal')
    expect(returnedHtml).toContain(
      'Returned to Demo User and restored that user&#39;s previously authorized budgets from this sample&#39;s server-side memory.',
    )
  })

  it('keeps the same account ID separate when two Lunch Money users authorize it', async () => {
    const applicationUserId = 'local-demo-user' as ApplicationUserId
    const accountId = 84 as AccountId
    const credentials = new InMemoryCredentialStore()
    await credentials.upsert(applicationUserId, {
      accountId,
      budgetName: 'First user budget',
      credentials: { accessToken: 'first-user-token', scope: 'me:read' },
      lunchMoneyUserId: 42,
    })
    const protocol = new FakeProtocolClient()
    protocol.credentials = {
      accessToken: 'second-user-token',
      scope: 'me:read',
    }
    const app = createApp(configuration, protocol, {
      credentials,
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({
            ...profile(84, 'Second user budget'),
            id: 77,
          }),
        )
        .mockResolvedValueOnce(Response.json(profile(84, 'First user budget'))),
    })
    const session = await openSession(app)

    await app.request(
      '/oauth/start',
      formRequest(session.cookie, session.csrfToken),
    )
    await app.request('/oauth/callback?code=second&state=generated-state', {
      headers: { cookie: session.cookie },
    })

    expect(await credentials.list(applicationUserId)).toHaveLength(2)
    expect(
      (
        await credentials.get(applicationUserId, {
          accountId,
          lunchMoneyUserId: 42,
        })
      )?.credentials.accessToken,
    ).toBe('first-user-token')
    expect(
      (
        await credentials.get(applicationUserId, {
          accountId,
          lunchMoneyUserId: 77,
        })
      )?.credentials.accessToken,
    ).toBe('second-user-token')
    let html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('Second user budget')
    expect(html).not.toContain('First user budget')

    protocol.credentials = {
      accessToken: 'first-user-reauthorized',
      scope: 'me:read',
    }
    await app.request(
      '/oauth/start',
      formRequest(session.cookie, session.csrfToken),
    )
    await app.request('/oauth/callback?code=return&state=generated-state', {
      headers: { cookie: session.cookie },
    })

    expect(await credentials.list(applicationUserId)).toHaveLength(2)
    expect(
      (
        await credentials.get(applicationUserId, {
          accountId,
          lunchMoneyUserId: 42,
        })
      )?.credentials.accessToken,
    ).toBe('first-user-reauthorized')
    expect(
      (
        await credentials.get(applicationUserId, {
          accountId,
          lunchMoneyUserId: 77,
        })
      )?.credentials.accessToken,
    ).toBe('second-user-token')
    html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('First user budget')
    expect(html).not.toContain('Second user budget')

    await app.request('/reset', formRequest(session.cookie, session.csrfToken))
    expect(
      await credentials.get(applicationUserId, {
        accountId,
        lunchMoneyUserId: 42,
      }),
    ).toBeUndefined()
    expect(
      await credentials.get(applicationUserId, {
        accountId,
        lunchMoneyUserId: 77,
      }),
    ).toBeDefined()
  })

  it('removes only the active budget and falls back to the remaining connection', async () => {
    const credentials = new InMemoryCredentialStore()
    for (const [accountId, budgetName] of [
      [84, 'Household'],
      [91, 'API testing'],
    ] as const) {
      await credentials.upsert('local-demo-user' as ApplicationUserId, {
        accountId: accountId as AccountId,
        budgetName,
        credentials: {
          accessToken: `${accountId}-token`,
          scope: 'me:read',
        },
        lunchMoneyUserId: 42,
      })
    }
    const app = createApp(configuration, new FakeProtocolClient(), {
      credentials,
    })
    const session = await openSession(app)
    await app.request(
      '/connections/active',
      formRequest(session.cookie, session.csrfToken, { account_id: '91' }),
    )
    await app.request('/reset', formRequest(session.cookie, session.csrfToken))

    expect(
      await credentials.get('local-demo-user' as ApplicationUserId, {
        accountId: 91 as AccountId,
        lunchMoneyUserId: 42,
      }),
    ).toBeUndefined()
    expect(
      await credentials.get('local-demo-user' as ApplicationUserId, {
        accountId: 84 as AccountId,
        lunchMoneyUserId: 42,
      }),
    ).toBeDefined()
    const html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('Household')
    expect(html).not.toContain('API testing')
  })

  it('refreshes only the active budget connection', async () => {
    const credentials = new InMemoryCredentialStore()
    for (const [accountId, refreshToken] of [
      [84, 'refresh-a'],
      [91, 'refresh-b'],
    ] as const) {
      await credentials.upsert('local-demo-user' as ApplicationUserId, {
        accountId: accountId as AccountId,
        budgetName: `Budget ${accountId}`,
        credentials: {
          accessToken: `access-${accountId}`,
          refreshToken,
          scope: 'me:read offline_access',
        },
        lunchMoneyUserId: 42,
      })
    }
    const protocol = new FakeProtocolClient()
    const app = createApp(configuration, protocol, { credentials })
    const session = await openSession(app)
    await app.request(
      '/connections/active',
      formRequest(session.cookie, session.csrfToken, { account_id: '91' }),
    )
    await app.request(
      '/refresh',
      formRequest(session.cookie, session.csrfToken),
    )

    expect(protocol.refreshed).toEqual([
      expect.objectContaining({ refreshToken: 'refresh-b' }),
    ])
    expect(
      (
        await credentials.get('local-demo-user' as ApplicationUserId, {
          accountId: 84 as AccountId,
          lunchMoneyUserId: 42,
        })
      )?.credentials.refreshToken,
    ).toBe('refresh-a')
  })

  it('revokes only the active budget and falls back to another authorized budget', async () => {
    const credentials = new InMemoryCredentialStore()
    for (const [accountId, accessToken] of [
      [84, 'access-a'],
      [91, 'access-b'],
    ] as const) {
      await credentials.upsert('local-demo-user' as ApplicationUserId, {
        accountId: accountId as AccountId,
        budgetName: `Budget ${accountId}`,
        credentials: { accessToken, scope: 'me:read' },
        lunchMoneyUserId: 42,
      })
    }
    const protocol = new FakeProtocolClient()
    const app = createApp(configuration, protocol, {
      credentials,
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 401 })),
    })
    const session = await openSession(app)
    await app.request(
      '/connections/active',
      formRequest(session.cookie, session.csrfToken, { account_id: '91' }),
    )
    await app.request('/revoke', formRequest(session.cookie, session.csrfToken))

    expect(protocol.revoked).toEqual([
      { token: 'access-b', tokenKind: 'access_token' },
    ])
    expect(
      await credentials.get('local-demo-user' as ApplicationUserId, {
        accountId: 84 as AccountId,
        lunchMoneyUserId: 42,
      }),
    ).toBeDefined()
    expect(
      await credentials.get('local-demo-user' as ApplicationUserId, {
        accountId: 91 as AccountId,
        lunchMoneyUserId: 42,
      }),
    ).toBeUndefined()
    const html = await (
      await app.request('/', { headers: { cookie: session.cookie } })
    ).text()
    expect(html).toContain('Budget 84')
  })
})
