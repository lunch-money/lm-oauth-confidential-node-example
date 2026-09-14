import { describe, expect, it, vi } from 'vitest'
import {
  readLunchMoneyProfile,
  revokeAndVerify,
  type ApplicationUserId,
  type ConnectionId,
} from '../../src/oauth/index.js'
import { InMemoryCredentialStore } from '../../src/scaffolding/session/in-memory-stores.js'
import { FakeProtocolClient } from '../fixtures/fakes.js'

const owner = {
  applicationUserId: 'user' as ApplicationUserId,
  connectionId: 'primary' as ConnectionId,
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

describe('/v2/me and revocation', () => {
  it('returns the documented user profile and keeps the access token server-side', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(owner.applicationUserId, owner.connectionId, {
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
    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://issuer.example/v2/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer private-token',
        }),
      }),
    )
  })

  it('reports missing me:read without returning the upstream body', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(owner.applicationUserId, owner.connectionId, {
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
    ).rejects.toMatchObject({ code: 'insufficient_scope' })
  })

  it('rejects malformed successful responses', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(owner.applicationUserId, owner.connectionId, {
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
    ).rejects.toMatchObject({ code: 'resource_failure' })
  })

  it('rejects successful responses with fields outside the documented user schema', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(owner.applicationUserId, owner.connectionId, {
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
    ).rejects.toMatchObject({ code: 'resource_failure' })
  })

  it('revokes, verifies the old token fails, and then deletes local credentials', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(owner.applicationUserId, owner.connectionId, {
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
    expect(
      await store.get(owner.applicationUserId, owner.connectionId),
    ).toBeUndefined()
  })

  it('revokes the refresh token to revoke an offline grant, then verifies the old access token', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(owner.applicationUserId, owner.connectionId, {
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
    await store.replace(owner.applicationUserId, owner.connectionId, {
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
    expect(
      await store.get(owner.applicationUserId, owner.connectionId),
    ).toBeDefined()
  })
})
