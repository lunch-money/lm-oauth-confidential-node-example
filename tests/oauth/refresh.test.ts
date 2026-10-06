import { describe, expect, it, vi } from 'vitest'
import {
  OAuthError,
  RefreshProtocolError,
  refreshConnection,
  type AccountId,
  type ApplicationUserId,
  type CredentialSet,
  type CredentialStore,
} from '../../src/oauth/index.js'
import {
  InMemoryCredentialStore,
  InMemoryRefreshCoordinator,
} from '../../src/scaffolding/session/in-memory-stores.js'
import { FakeProtocolClient } from '../fixtures/fakes.js'

const owner = {
  applicationUserId: 'user-a' as ApplicationUserId,
  accountId: 11 as AccountId,
}
const otherOwner = {
  applicationUserId: 'user-b' as ApplicationUserId,
  accountId: 11 as AccountId,
}
const offlineCredentials: CredentialSet = {
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  expiresAt: '2029-01-01T00:00:00.000Z',
  scope: 'me:read offline_access',
}

async function seedConnection(
  store: InMemoryCredentialStore,
  applicationUserId: ApplicationUserId,
  credentials: CredentialSet,
  accountId: AccountId = 11 as AccountId,
): Promise<void> {
  await store.upsert(applicationUserId, {
    accountId,
    budgetName: `Budget ${accountId}`,
    credentials,
    lunchMoneyUserId: 42,
  })
}

describe('refresh orchestration', () => {
  it('atomically replaces the complete rotated credential set', async () => {
    const store = new InMemoryCredentialStore()
    const protocol = new FakeProtocolClient()
    await seedConnection(store, owner.applicationUserId, offlineCredentials)

    await expect(
      refreshConnection(
        protocol,
        store,
        new InMemoryRefreshCoordinator(),
        owner,
      ),
    ).resolves.toEqual({ status: 'refreshed' })
    expect(protocol.refreshed).toEqual([offlineCredentials])
    await expect(
      store.get(owner.applicationUserId, owner.accountId),
    ).resolves.toMatchObject({
      credentials: {
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
        scope: 'me:read offline_access',
      },
    })
  })

  it('reports that refresh is unavailable for an access-only grant', async () => {
    const store = new InMemoryCredentialStore()
    const protocol = new FakeProtocolClient()
    await seedConnection(store, owner.applicationUserId, {
      accessToken: 'access-only',
      scope: 'me:read',
    })
    await expect(
      refreshConnection(
        protocol,
        store,
        new InMemoryRefreshCoordinator(),
        owner,
      ),
    ).resolves.toEqual({ status: 'refresh_not_available' })
    expect(protocol.refreshed).toHaveLength(0)
  })

  it.each(['expired', 'revoked', 'replayed'])(
    'requires reauthorization for indistinguishable %s-token invalid_grant without retrying',
    async () => {
      const store = new InMemoryCredentialStore()
      const coordinator = new InMemoryRefreshCoordinator()
      const protocol = new FakeProtocolClient()
      protocol.refresh = vi
        .fn()
        .mockRejectedValue(new RefreshProtocolError('invalid_grant'))
      await seedConnection(store, owner.applicationUserId, offlineCredentials)

      await expect(
        refreshConnection(protocol, store, coordinator, owner),
      ).resolves.toEqual({
        status: 'reauthorization_required',
        reason: 'invalid_grant',
      })
      expect(protocol.refresh).toHaveBeenCalledOnce()
      await expect(
        store.get(owner.applicationUserId, owner.accountId),
      ).resolves.toBeUndefined()
      await refreshConnection(protocol, store, coordinator, owner)
      expect(protocol.refresh).toHaveBeenCalledOnce()
    },
  )

  it('preserves the current credential set for transient provider or network failure', async () => {
    const store = new InMemoryCredentialStore()
    const protocol = new FakeProtocolClient()
    protocol.refresh = vi
      .fn()
      .mockRejectedValue(new RefreshProtocolError('transient'))
    await seedConnection(store, owner.applicationUserId, offlineCredentials)

    await expect(
      refreshConnection(
        protocol,
        store,
        new InMemoryRefreshCoordinator(),
        owner,
      ),
    ).rejects.toBeInstanceOf(OAuthError)
    await expect(
      store.get(owner.applicationUserId, owner.accountId),
    ).resolves.toMatchObject({ credentials: offlineCredentials })
  })

  it('requires reauthorization and never retries the old token after provider rotation but persistence failure', async () => {
    class FailingReplacementStore extends InMemoryCredentialStore {
      override async upsert(
        applicationUserId: ApplicationUserId,
        connection: import('../../src/oauth/index.js').LunchMoneyConnection,
      ): Promise<void> {
        if (connection.credentials.refreshToken === 'rotated-refresh-token')
          throw new Error('simulated persistence failure')
        return super.upsert(applicationUserId, connection)
      }
    }
    const store = new FailingReplacementStore()
    const coordinator = new InMemoryRefreshCoordinator()
    const protocol = new FakeProtocolClient()
    await seedConnection(store, owner.applicationUserId, offlineCredentials)

    await expect(
      refreshConnection(protocol, store, coordinator, owner),
    ).resolves.toEqual({
      status: 'reauthorization_required',
      reason: 'replacement_not_saved',
    })
    await expect(
      store.get(owner.applicationUserId, owner.accountId),
    ).resolves.toBeUndefined()
    await refreshConnection(protocol, store, coordinator, owner)
    expect(protocol.refreshed).toHaveLength(1)
  })

  it('rejects concurrent refresh for one connection but permits independent connections', async () => {
    const store = new InMemoryCredentialStore()
    const coordinator = new InMemoryRefreshCoordinator()
    const protocol = new FakeProtocolClient()
    await seedConnection(store, owner.applicationUserId, offlineCredentials)
    await seedConnection(store, otherOwner.applicationUserId, {
      ...offlineCredentials,
      refreshToken: 'other-refresh',
    })
    let release!: () => void
    const blocked = new Promise<void>((resolve) => (release = resolve))
    protocol.refresh = vi.fn(async (credentials) => {
      if (credentials.refreshToken === 'old-refresh') await blocked
      return {
        ...credentials,
        accessToken: `new-${credentials.accessToken}`,
        refreshToken: `new-${credentials.refreshToken}`,
      }
    })

    const first = refreshConnection(protocol, store, coordinator, owner)
    await vi.waitFor(() => expect(protocol.refresh).toHaveBeenCalledOnce())
    await expect(
      refreshConnection(protocol, store, coordinator, owner),
    ).resolves.toEqual({
      status: 'refresh_in_progress',
    })
    await expect(
      refreshConnection(protocol, store, coordinator, otherOwner),
    ).resolves.toEqual({ status: 'refreshed' })
    release()
    await expect(first).resolves.toEqual({ status: 'refreshed' })
  })

  it('cannot refresh or replace another application user credential', async () => {
    const store = new InMemoryCredentialStore()
    const protocol = new FakeProtocolClient()
    await seedConnection(store, owner.applicationUserId, offlineCredentials)

    await expect(
      refreshConnection(
        protocol,
        store,
        new InMemoryRefreshCoordinator(),
        otherOwner,
      ),
    ).resolves.toEqual({ status: 'refresh_not_available' })
    expect(protocol.refreshed).toHaveLength(0)
    await expect(
      store.get(owner.applicationUserId, owner.accountId),
    ).resolves.toMatchObject({ credentials: offlineCredentials })
  })

  it('keeps the storage boundary as one complete replacement operation', async () => {
    const values = new Map<
      string,
      import('../../src/oauth/index.js').LunchMoneyConnection
    >([
      [
        'owner',
        {
          accountId: 1 as import('../../src/oauth/index.js').AccountId,
          budgetName: 'Primary',
          credentials: offlineCredentials,
          lunchMoneyUserId: 2,
        },
      ],
    ])
    const store: CredentialStore = {
      get: vi.fn(async () => values.get('owner')),
      list: vi.fn(async () => [...values.values()]),
      upsert: vi.fn(async (_user, value) => {
        values.set('owner', value)
      }),
      replace: vi.fn(async (_user, _connection, value) => {
        values.set('owner', {
          accountId: 1 as import('../../src/oauth/index.js').AccountId,
          budgetName: 'Primary',
          credentials: value,
          lunchMoneyUserId: 2,
        })
      }),
      delete: vi.fn(async () => values.delete('owner')),
    }
    await refreshConnection(
      new FakeProtocolClient(),
      store,
      new InMemoryRefreshCoordinator(),
      owner,
    )
    expect(store.upsert).toHaveBeenCalledOnce()
    expect(store.upsert).toHaveBeenCalledWith(
      owner.applicationUserId,
      expect.objectContaining({
        credentials: expect.objectContaining({
          accessToken: 'rotated-access-token',
          refreshToken: 'rotated-refresh-token',
          expiresAt: '2030-01-01T00:00:00.000Z',
          scope: 'me:read offline_access',
        }),
      }),
    )
  })
})
