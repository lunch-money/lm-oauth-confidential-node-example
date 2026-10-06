import { describe, expect, it } from 'vitest'
import {
  deleteCredentials,
  readCredentials,
  revokeAndVerify,
  type AccountId,
  type ApplicationUserId,
  type ConnectionIdentity,
  type CredentialSet,
  type LunchMoneyConnection,
} from '../../src/oauth/index.js'
import { InMemoryCredentialStore } from '../../src/scaffolding/session/in-memory-stores.js'
import { FakeProtocolClient } from '../fixtures/fakes.js'

const alice = 'application-user-alice' as ApplicationUserId
const bob = 'application-user-bob' as ApplicationUserId
const identity: ConnectionIdentity = {
  accountId: 84 as AccountId,
  lunchMoneyUserId: 42,
}
const aliceCredentials: CredentialSet = {
  accessToken: 'alice-private-token',
  refreshToken: 'alice-private-refresh',
  scope: 'me:read offline_access',
}

function connection(
  connectionIdentity: ConnectionIdentity = identity,
  credentials: CredentialSet = aliceCredentials,
): LunchMoneyConnection {
  return {
    ...connectionIdentity,
    budgetName: 'Demo budget',
    credentials,
    lunchMoneyUserName: 'Demo User',
  }
}

describe('credential ownership boundary', () => {
  it('prevents one application user from reading another user’s credentials', async () => {
    const store = new InMemoryCredentialStore()
    await store.upsert(alice, connection())
    expect(await readCredentials(store, bob, identity)).toBeUndefined()
  })

  it('stores the same account ID separately for different Lunch Money users', async () => {
    const store = new InMemoryCredentialStore()
    const otherIdentity = { ...identity, lunchMoneyUserId: 7 }
    await store.upsert(alice, connection())
    await store.upsert(
      alice,
      connection(otherIdentity, {
        accessToken: 'other-user',
        scope: 'me:read',
      }),
    )
    expect((await store.get(alice, identity))?.credentials.accessToken).toBe(
      'alice-private-token',
    )
    expect(
      (await store.get(alice, otherIdentity))?.credentials.accessToken,
    ).toBe('other-user')
    expect(await store.list(alice)).toHaveLength(2)
  })

  it('prevents one application user from revoking another user’s credentials', async () => {
    const store = new InMemoryCredentialStore()
    await store.upsert(alice, connection())
    const protocol = new FakeProtocolClient()
    await expect(
      revokeAndVerify(
        protocol,
        store,
        { applicationUserId: bob, ...identity },
        new URL('https://issuer.example/v2/me'),
      ),
    ).rejects.toMatchObject({ code: 'credential_not_found' })
    expect(protocol.revoked).toEqual([])
    expect((await store.get(alice, identity))?.credentials).toEqual(
      aliceCredentials,
    )
  })

  it('prevents one application user from deleting another user’s credentials', async () => {
    const store = new InMemoryCredentialStore()
    await store.upsert(alice, connection())
    expect(await deleteCredentials(store, bob, identity)).toBe(false)
    expect((await store.get(alice, identity))?.credentials).toEqual(
      aliceCredentials,
    )
  })
})
