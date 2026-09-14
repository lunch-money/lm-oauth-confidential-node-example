import { describe, expect, it } from 'vitest'
import {
  startAuthorization,
  AUTHORIZATION_ATTEMPT_TTL_MS,
  type ApplicationSessionId,
  type ApplicationUserId,
  type ConnectionId,
} from '../../src/oauth/index.js'
import { InMemoryAuthorizationAttemptStore } from '../../src/scaffolding/session/in-memory-stores.js'
import { FakeProtocolClient } from '../fixtures/fakes.js'

describe('authorization start', () => {
  it('stores state, PKCE verifier, and the authenticated application user only on the server', async () => {
    const protocol = new FakeProtocolClient()
    const now = 1_000
    const attempts = new InMemoryAuthorizationAttemptStore(() => now)
    const user = 'app-user-a' as ApplicationUserId
    const session = 'browser-session-a' as ApplicationSessionId
    const connection = 'primary' as ConnectionId
    const url = await startAuthorization(
      protocol,
      attempts,
      {
        applicationUserId: user,
        applicationSessionId: session,
        connectionId: connection,
        redirectUri: 'http://localhost:4002/oauth/callback',
      },
      () => now,
    )

    expect(url.searchParams.get('state')).toBe('generated-state')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.has('scope')).toBe(false)
    expect(url.toString()).not.toContain('server-only-verifier')
    expect(await attempts.consume('generated-state')).toEqual({
      applicationUserId: user,
      applicationSessionId: session,
      connectionId: connection,
      codeVerifier: 'server-only-verifier',
      expiresAt: now + AUTHORIZATION_ATTEMPT_TTL_MS,
      state: 'generated-state',
    })
  })

  it('rejects and removes an expired attempt using an injected clock', async () => {
    let now = 5_000
    const attempts = new InMemoryAuthorizationAttemptStore(() => now)
    await startAuthorization(
      new FakeProtocolClient(),
      attempts,
      {
        applicationUserId: 'user' as ApplicationUserId,
        applicationSessionId: 'session' as ApplicationSessionId,
        connectionId: 'primary' as ConnectionId,
        redirectUri: 'http://localhost:4002/oauth/callback',
      },
      () => now,
    )
    now += AUTHORIZATION_ATTEMPT_TTL_MS
    expect(await attempts.consume('generated-state')).toBeUndefined()
    expect(await attempts.consume('generated-state')).toBeUndefined()
  })

  it('consumes every valid attempt at most once', async () => {
    const attempts = new InMemoryAuthorizationAttemptStore(() => 1)
    await attempts.save({
      applicationUserId: 'user' as ApplicationUserId,
      applicationSessionId: 'session' as ApplicationSessionId,
      connectionId: 'primary' as ConnectionId,
      codeVerifier: 'verifier',
      expiresAt: 2,
      state: 'one-use',
    })
    expect(await attempts.consume('one-use')).toBeDefined()
    expect(await attempts.consume('one-use')).toBeUndefined()
  })
})
