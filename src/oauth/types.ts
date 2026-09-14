/** Opaque identifier assigned by the integrating application after authentication. */
export type ApplicationUserId = string & {
  readonly __brand: 'ApplicationUserId'
}

/** Opaque identifier for the initiating application browser session, derived only by the server. */
export type ApplicationSessionId = string & {
  readonly __brand: 'ApplicationSessionId'
}

/** Optional stable identifier for one Lunch Money connection owned by an application user. */
export type ConnectionId = string & { readonly __brand: 'ConnectionId' }

/** Server-only values retained between authorization start and callback. */
export interface AuthorizationAttempt {
  readonly applicationSessionId: ApplicationSessionId
  readonly applicationUserId: ApplicationUserId
  readonly connectionId: ConnectionId
  readonly codeVerifier: string
  readonly expiresAt: number
  readonly state: string
}

/** Lunch Money credentials. Every field in this value is server-confidential. */
export interface CredentialSet {
  readonly accessToken: string
  readonly expiresAt?: string
  /** Present only when the client's immutable registered scopes include `offline_access`. */
  readonly refreshToken?: string
  readonly scope: string
}

/** Result of revoking a credential and checking that the old token no longer works. */
export interface RevocationResult {
  readonly revoked: boolean
  readonly oldCredentialRejected: boolean
}

/** Token kind supplied as an RFC 7009 revocation hint. */
export type RevocableTokenKind = 'access_token' | 'refresh_token'

/** Minimal OAuth-library surface used by the teaching workflow and replaceable in tests. */
export interface OAuthProtocolClient {
  /** Creates fresh state and S256 PKCE material and returns an authorization URL without scope. */
  createAuthorizationUrl(redirectUri: string): Promise<{
    state: string
    codeVerifier: string
    url: URL
  }>

  /** Validates the callback and exchanges its one-time code without exposing it to the browser. */
  exchangeCallback(
    callbackUrl: URL,
    expected: { state: string; codeVerifier: string },
  ): Promise<CredentialSet>

  /** Exchanges a server-held refresh token and returns its complete rotated replacement set. */
  refresh(credentials: CredentialSet): Promise<CredentialSet>

  /** Sends a server-held credential to the authorization server's revocation endpoint. */
  revoke(token: string, tokenKind: RevocableTokenKind): Promise<void>
}
