import { describe, expect, it } from 'vitest'
import {
  completeAuthorization,
  OAuthError,
  type ApplicationSessionId,
  type ApplicationUserId,
  type AuthorizationAttempt,
  type ConnectionId,
} from '../../src/oauth/index.js'
import {
  InMemoryAuthorizationAttemptStore,
  InMemoryCredentialStore,
} from '../../src/scaffolding/session/in-memory-stores.js'
import { FakeProtocolClient } from '../fixtures/fakes.js'

const user = 'app-user-a' as ApplicationUserId
const session = 'browser-session-a' as ApplicationSessionId
const connection = 'primary' as ConnectionId
const attempt: AuthorizationAttempt = {
  applicationSessionId: session,
  applicationUserId: user,
  connectionId: connection,
  state: 'expected',
  codeVerifier: 'verifier',
  expiresAt: Number.MAX_SAFE_INTEGER,
}

describe('OAuth callback', () => {
  it('stores exchanged credentials under the application user bound before redirect', async () => {
    const attempts = new InMemoryAuthorizationAttemptStore()
    const credentials = new InMemoryCredentialStore()
    const protocol = new FakeProtocolClient()
    await attempts.save(attempt)

    const owner = await completeAuthorization(
      protocol,
      attempts,
      credentials,
      new URL(
        'http://localhost/oauth/callback?code=one-time-code&state=expected&applicationUserId=attacker',
      ),
      user,
      session,
    )

    expect(owner).toEqual({ applicationUserId: user, connectionId: connection })
    expect(await credentials.get(user, connection)).toEqual(
      protocol.credentials,
    )
    expect(protocol.exchanged).toMatchObject({
      state: 'expected',
      codeVerifier: 'verifier',
    })
  })

  it('stores an optional refresh token without making callback handling own refresh lifecycle', async () => {
    const attempts = new InMemoryAuthorizationAttemptStore()
    const credentials = new InMemoryCredentialStore()
    const protocol = new FakeProtocolClient()
    protocol.credentials = {
      accessToken: 'access',
      refreshToken: 'refresh',
      scope: 'me:read offline_access',
    }
    await attempts.save(attempt)
    await completeAuthorization(
      protocol,
      attempts,
      credentials,
      new URL('http://localhost/oauth/callback?code=code&state=expected'),
      user,
      session,
    )
    expect(await credentials.get(user, connection)).toEqual(
      protocol.credentials,
    )
    expect(protocol.refreshed).toHaveLength(0)
  })

  it.each([
    ['missing state', 'http://localhost/oauth/callback?code=code'],
    [
      'unknown or mismatched state',
      'http://localhost/oauth/callback?code=code&state=wrong',
    ],
  ])('rejects %s before token exchange', async (_name, url) => {
    const protocol = new FakeProtocolClient()
    await expect(
      completeAuthorization(
        protocol,
        new InMemoryAuthorizationAttemptStore(),
        new InMemoryCredentialStore(),
        new URL(url),
        user,
        session,
      ),
    ).rejects.toMatchObject({ code: 'callback_invalid' })
    expect(protocol.exchanged).toBeUndefined()
  })

  it('rejects a missing authorization code after consuming state', async () => {
    const attempts = new InMemoryAuthorizationAttemptStore()
    await attempts.save(attempt)
    await expect(
      completeAuthorization(
        new FakeProtocolClient(),
        attempts,
        new InMemoryCredentialStore(),
        new URL('http://localhost/oauth/callback?state=expected'),
        user,
        session,
      ),
    ).rejects.toBeInstanceOf(OAuthError)
  })

  it('handles denied consent without exposing the provider description', async () => {
    const attempts = new InMemoryAuthorizationAttemptStore()
    await attempts.save(attempt)
    await expect(
      completeAuthorization(
        new FakeProtocolClient(),
        attempts,
        new InMemoryCredentialStore(),
        new URL(
          'http://localhost/oauth/callback?error=access_denied&error_description=sensitive&state=expected',
        ),
        user,
        session,
      ),
    ).rejects.toMatchObject({
      code: 'authorization_denied',
      message: 'Lunch Money authorization was denied or cancelled.',
    })
  })

  it('wraps token and PKCE failures in a redacted domain error', async () => {
    const attempts = new InMemoryAuthorizationAttemptStore()
    await attempts.save(attempt)
    const protocol = new FakeProtocolClient()
    protocol.exchangeCallback = async () => {
      throw new Error('invalid_grant contained secret-code')
    }
    await expect(
      completeAuthorization(
        protocol,
        attempts,
        new InMemoryCredentialStore(),
        new URL(
          'http://localhost/oauth/callback?code=secret-code&state=expected',
        ),
        user,
        session,
      ),
    ).rejects.toMatchObject({
      code: 'provider_failure',
      message: 'Lunch Money could not complete the token exchange.',
    })
  })

  it('rejects a callback completed in another authenticated application user session', async () => {
    const attempts = new InMemoryAuthorizationAttemptStore()
    await attempts.save(attempt)
    const protocol = new FakeProtocolClient()
    await expect(
      completeAuthorization(
        protocol,
        attempts,
        new InMemoryCredentialStore(),
        new URL('http://localhost/oauth/callback?code=code&state=expected'),
        'app-user-b' as ApplicationUserId,
        session,
      ),
    ).rejects.toMatchObject({ code: 'callback_invalid' })
    expect(protocol.exchanged).toBeUndefined()
  })

  it('rejects a callback in another application browser session even for the same user', async () => {
    const attempts = new InMemoryAuthorizationAttemptStore()
    await attempts.save(attempt)
    const protocol = new FakeProtocolClient()
    await expect(
      completeAuthorization(
        protocol,
        attempts,
        new InMemoryCredentialStore(),
        new URL('http://localhost/oauth/callback?code=code&state=expected'),
        user,
        'browser-session-b' as ApplicationSessionId,
      ),
    ).rejects.toMatchObject({ code: 'callback_invalid' })
    expect(protocol.exchanged).toBeUndefined()
  })

  it('rejects and removes an expired callback attempt before token exchange', async () => {
    const attempts = new InMemoryAuthorizationAttemptStore(() => 100)
    await attempts.save({ ...attempt, expiresAt: 99 })
    const protocol = new FakeProtocolClient()
    await expect(
      completeAuthorization(
        protocol,
        attempts,
        new InMemoryCredentialStore(),
        new URL('http://localhost/oauth/callback?code=code&state=expected'),
        user,
        session,
      ),
    ).rejects.toMatchObject({ code: 'callback_invalid' })
    expect(protocol.exchanged).toBeUndefined()
    expect(await attempts.consume('expected')).toBeUndefined()
  })
})
