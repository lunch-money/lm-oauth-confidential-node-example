import { describe, expect, it } from 'vitest'
import {
  deleteCredentials,
  readCredentials,
  replaceCredentials,
  revokeAndVerify,
  type ApplicationUserId,
  type ConnectionId,
  type CredentialSet,
} from '../../src/oauth/index.js'
import { InMemoryCredentialStore } from '../../src/scaffolding/session/in-memory-stores.js'
import { FakeProtocolClient } from '../fixtures/fakes.js'

const alice = 'application-user-alice' as ApplicationUserId
const bob = 'application-user-bob' as ApplicationUserId
const connection = 'primary' as ConnectionId
const aliceCredentials: CredentialSet = {
  accessToken: 'alice-private-token',
  refreshToken: 'alice-private-refresh',
  scope: 'me:read offline_access',
}

describe('credential ownership boundary', () => {
  it('prevents one application user from reading another user’s credentials', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(alice, connection, aliceCredentials)
    expect(await readCredentials(store, bob, connection)).toBeUndefined()
  })

  it('prevents one application user from replacing another user’s credentials', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(alice, connection, aliceCredentials)
    await replaceCredentials(store, bob, connection, {
      accessToken: 'bob-token',
      scope: 'me:read',
    })
    expect(await store.get(alice, connection)).toEqual(aliceCredentials)
  })

  it('prevents another user’s refresh persistence from replacing the owner’s credential', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(alice, connection, aliceCredentials)
    await replaceCredentials(store, bob, connection, {
      accessToken: 'bob-rotated',
      refreshToken: 'bob-refresh',
      scope: 'me:read offline_access',
    })
    expect(await store.get(alice, connection)).toEqual(aliceCredentials)
  })

  it('prevents one application user from revoking another user’s credentials', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(alice, connection, aliceCredentials)
    const protocol = new FakeProtocolClient()
    await expect(
      revokeAndVerify(
        protocol,
        store,
        { applicationUserId: bob, connectionId: connection },
        new URL('https://issuer.example/v2/me'),
      ),
    ).rejects.toMatchObject({ code: 'credential_not_found' })
    expect(protocol.revoked).toEqual([])
    expect(await store.get(alice, connection)).toEqual(aliceCredentials)
  })

  it('prevents one application user from deleting another user’s credentials', async () => {
    const store = new InMemoryCredentialStore()
    await store.replace(alice, connection, aliceCredentials)
    expect(await deleteCredentials(store, bob, connection)).toBe(false)
    expect(await store.get(alice, connection)).toEqual(aliceCredentials)
  })
})
