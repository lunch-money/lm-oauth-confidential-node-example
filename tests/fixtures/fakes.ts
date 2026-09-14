import type {
  CredentialSet,
  OAuthProtocolClient,
} from '../../src/oauth/index.js'

export class FakeProtocolClient implements OAuthProtocolClient {
  readonly revoked: Array<{
    token: string
    tokenKind: 'access_token' | 'refresh_token'
  }> = []
  readonly refreshed: CredentialSet[] = []
  exchanged?: { callbackUrl: URL; state: string; codeVerifier: string }
  credentials: CredentialSet = {
    accessToken: 'server-access-token',
    scope: 'me:read',
  }

  async createAuthorizationUrl(): Promise<{
    state: string
    codeVerifier: string
    url: URL
  }> {
    return {
      state: 'generated-state',
      codeVerifier: 'server-only-verifier',
      url: new URL(
        'https://issuer.example/oauth/authorize?state=generated-state&code_challenge=challenge&code_challenge_method=S256',
      ),
    }
  }

  async exchangeCallback(
    callbackUrl: URL,
    expected: { state: string; codeVerifier: string },
  ): Promise<CredentialSet> {
    this.exchanged = { callbackUrl, ...expected }
    return this.credentials
  }

  async refresh(credentials: CredentialSet): Promise<CredentialSet> {
    this.refreshed.push(credentials)
    return {
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
      scope: credentials.scope,
    }
  }

  async revoke(
    token: string,
    tokenKind: 'access_token' | 'refresh_token',
  ): Promise<void> {
    this.revoked.push({ token, tokenKind })
  }
}
