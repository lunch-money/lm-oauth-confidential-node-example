import { describe, expect, it, vi } from 'vitest'
import {
  identifyLunchMoneyConnection,
  readLunchMoneyProfile,
  revokeAndVerify,
  type AccountId,
  type ApplicationUserId,
  type CredentialSet,
} from '../../src/oauth/index.js'
import { InMemoryCredentialStore } from '../../src/scaffolding/session/in-memory-stores.js'
import { FakeProtocolClient } from '../fixtures/fakes.js'

const owner = {
  applicationUserId: 'user' as ApplicationUserId,
  accountId: 84 as AccountId,
  lunchMoneyUserId: 42,
}
const userProfile = {
  name: 'Demo User',
  email: 'demo@example.com',
  id: 42,
  account_id: 84,
  budget_name: 'Demo budget',
  primary_currency: 'usd',
  api_key_label: null,
}

async function seed(
  store: InMemoryCredentialStore,
  credentials: CredentialSet,
): Promise<void> {
  await store.upsert(owner.applicationUserId, {
    accountId: owner.accountId,
    budgetName: 'Demo budget',
    credentials,
    lunchMoneyUserId: owner.lunchMoneyUserId,
  })
}

describe('/v2/me and revocation', () => {
  it('returns the documented user profile and keeps the access token server-side', async () => {
    const store = new InMemoryCredentialStore()
    await seed(store, {
      accessToken: 'private-token',
      scope: 'me:read',
    })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(userProfile))
    const profile = await readLunchMoneyProfile(
      store,
      owner,
      new URL('https://issuer.example/v2/me'),
      fetcher,
    )
    expect(profile).toEqual(userProfile)
    expect(JSON.stringify(profile)).not.toContain('private-token')
    const request = fetcher.mock.lastCall?.[0]
    expect(request).toBeInstanceOf(Request)
    if (!(request instanceof Request)) throw new Error('Expected SDK request.')
    expect(request.url).toBe('https://issuer.example/v2/me')
    expect(request.headers.get('authorization')).toBe('Bearer private-token')
  })

  it('reports missing me:read without returning the upstream body', async () => {
    const store = new InMemoryCredentialStore()
    await seed(store, {
      accessToken: 'token',
      scope: '',
    })
    await expect(
      readLunchMoneyProfile(
        store,
        owner,
        new URL('https://issuer.example/v2/me'),
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            Response.json({ secret: 'details' }, { status: 403 }),
          ),
      ),
    ).rejects.toMatchObject({
      code: 'insufficient_scope',
      diagnostic: { failureReason: 'http_error', httpStatus: 403 },
    })
  })

  it('records a safe HTTP status diagnostic without reading the response body', async () => {
    const response = new Response('private upstream details', { status: 401 })
    const json = vi.spyOn(response, 'json')
    await expect(
      identifyLunchMoneyConnection(
        { accessToken: 'private-token', scope: 'me:read' },
        new URL('https://issuer.example/v2/me'),
        vi.fn<typeof fetch>().mockResolvedValue(response),
      ),
    ).rejects.toMatchObject({
      code: 'resource_failure',
      diagnostic: { failureReason: 'http_error', httpStatus: 401 },
    })
    expect(json).not.toHaveBeenCalled()
  })

  it('rejects malformed successful responses', async () => {
    const store = new InMemoryCredentialStore()
    await seed(store, {
      accessToken: 'token',
      scope: 'me:read',
    })
    await expect(
      readLunchMoneyProfile(
        store,
        owner,
        new URL('https://issuer.example/v2/me'),
        vi.fn<typeof fetch>().mockResolvedValue(new Response('not-json')),
      ),
    ).rejects.toMatchObject({
      code: 'resource_failure',
      diagnostic: { failureReason: 'invalid_json', httpStatus: 200 },
    })
  })

  it('returns the SDK profile without rejecting additive response properties', async () => {
    const store = new InMemoryCredentialStore()
    await seed(store, {
      accessToken: 'token',
      scope: 'me:read',
    })
    await expect(
      readLunchMoneyProfile(
        store,
        owner,
        new URL('https://issuer.example/v2/me'),
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            Response.json({ ...userProfile, unexpected: 'not in userObject' }),
          ),
      ),
    ).resolves.toEqual({
      ...userProfile,
      unexpected: 'not in userObject',
    })
  })

  it.each([
    'name',
    'email',
    'id',
    'account_id',
    'budget_name',
    'primary_currency',
    'api_key_label',
  ] as const)(
    'treats a successful response missing %s like a rejected API request',
    async (missingField) => {
      const incompleteProfile = Object.fromEntries(
        Object.entries(userProfile).filter(([field]) => field !== missingField),
      )
      await expect(
        identifyLunchMoneyConnection(
          { accessToken: 'private-token', scope: 'me:read' },
          new URL('https://issuer.example/v2/me'),
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json(incompleteProfile)),
        ),
      ).rejects.toMatchObject({
        code: 'resource_failure',
        message: 'Lunch Money rejected the /v2/me request.',
        diagnostic: {
          failureReason: 'invalid_response',
          httpStatus: 200,
        },
      })
    },
  )

  it('revokes, verifies the old token fails, and then deletes local credentials', async () => {
    const store = new InMemoryCredentialStore()
    await seed(store, {
      accessToken: 'private-token',
      scope: 'me:read',
    })
    const protocol = new FakeProtocolClient()
    const result = await revokeAndVerify(
      protocol,
      store,
      owner,
      new URL('https://issuer.example/v2/me'),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 401 })),
    )
    expect(result).toEqual({ revoked: true, oldCredentialRejected: true })
    expect(protocol.revoked).toEqual([
      { token: 'private-token', tokenKind: 'access_token' },
    ])
    expect(await store.get(owner.applicationUserId, owner)).toBeUndefined()
  })

  it('revokes the refresh token to revoke an offline grant, then verifies the old access token', async () => {
    const store = new InMemoryCredentialStore()
    await seed(store, {
      accessToken: 'old-access',
      refreshToken: 'grant-refresh',
      scope: 'me:read offline_access',
    })
    const protocol = new FakeProtocolClient()
    await revokeAndVerify(
      protocol,
      store,
      owner,
      new URL('https://issuer.example/v2/me'),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 401 })),
    )
    expect(protocol.revoked).toEqual([
      { token: 'grant-refresh', tokenKind: 'refresh_token' },
    ])
  })

  it('retains local credentials when post-revocation verification unexpectedly succeeds', async () => {
    const store = new InMemoryCredentialStore()
    await seed(store, {
      accessToken: 'private-token',
      scope: 'me:read',
    })
    await expect(
      revokeAndVerify(
        new FakeProtocolClient(),
        store,
        owner,
        new URL('https://issuer.example/v2/me'),
        vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 42 })),
      ),
    ).rejects.toMatchObject({ code: 'provider_failure' })
    expect(await store.get(owner.applicationUserId, owner)).toBeDefined()
  })
})
