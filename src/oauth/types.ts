/**
 * Supply the application-specific ID for the user who is already signed in to
 * your server. Read it from your authenticated server session; do not use an
 * email address or accept the owner ID from the browser or OAuth callback.
 */
export type ApplicationUserId = string & {
  readonly __brand: 'ApplicationUserId'
}

/**
 * Supply the server-generated ID for the browser session that started OAuth.
 * It lets the callback reject a valid authorization attempt returned in a
 * different browser session. The browser may carry a signed random locator,
 * but it must not choose this identity.
 */
export type ApplicationSessionId = string & {
  readonly __brand: 'ApplicationSessionId'
}

/**
 * Supply an application-assigned ID when one user can have distinct Lunch
 * Money connections. Use the same value for later reads, refreshes, revocation,
 * and deletion of that connection.
 */
export type ConnectionId = string & { readonly __brand: 'ConnectionId' }

/**
 * Your server must save this short-lived record before redirecting to Lunch
 * Money, then load and delete it when the callback arrives. `state` links the
 * callback to the request your application started. The PKCE verifier is the
 * private random value used to prove that the server exchanging the code is
 * the same party that began authorization. `state` also travels in the
 * authorization URL, but the saved record—especially its verifier and owner
 * information—must not be exposed to application UI code.
 */
export interface AuthorizationAttempt {
  readonly applicationSessionId: ApplicationSessionId
  readonly applicationUserId: ApplicationUserId
  readonly connectionId: ConnectionId
  readonly codeVerifier: string
  readonly expiresAt: number
  readonly state: string
}

/**
 * Save this result under the authenticated application user and connection
 * that began authorization. Every field is server-confidential. When a client
 * is registered for `offline_access`, a refresh response replaces both tokens:
 * persist the entire returned set before making another authenticated request,
 * because the refresh token just used can no longer be used again.
 */
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

/** Tells Lunch Money whether the server is revoking an access or refresh token. */
export type RevocableTokenKind = 'access_token' | 'refresh_token'

/**
 * The OAuth operations the application needs from `openid-client`. The
 * application supplies redirect and callback URLs plus server-held credentials;
 * the adapter returns a browser destination or a credential set to store. It
 * also creates and checks state and PKCE values, exchanges authorization codes,
 * refreshes credentials, and requests revocation without exposing sensitive
 * values to the browser.
 */
export interface OAuthProtocolClient {
  /**
   * Call when the signed-in user chooses to connect Lunch Money. Returns the
   * URL for the browser plus random state and a private PKCE verifier that your
   * server must save until the callback. The URL deliberately omits `scope`.
   */
  createAuthorizationUrl(redirectUri: string): Promise<{
    state: string
    codeVerifier: string
    url: URL
  }>

  /**
   * Call after loading the saved authorization attempt for the callback.
   * Checks that callback state matches, proves possession of the saved PKCE
   * verifier, and exchanges the one-time code. Returns credentials that must
   * remain on the server.
   */
  exchangeCallback(
    callbackUrl: URL,
    expected: { state: string; codeVerifier: string },
  ): Promise<CredentialSet>

  /**
   * Call when a connection needs fresh credentials. Sends its server-held
   * refresh token and returns the complete replacement set. Lunch Money rotates
   * refresh tokens, meaning the returned refresh token replaces the one just
   * used; the caller must store the new set atomically.
   */
  refresh(credentials: CredentialSet): Promise<CredentialSet>

  /**
   * Call when a user disconnects Lunch Money. Sends the selected server-held
   * token to Lunch Money for revocation; local credential deletion remains the
   * application's responsibility.
   */
  revoke(token: string, tokenKind: RevocableTokenKind): Promise<void>
}
