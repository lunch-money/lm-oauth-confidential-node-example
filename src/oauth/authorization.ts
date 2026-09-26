import type {
  ApplicationSessionId,
  ApplicationUserId,
  AuthorizationAttempt,
  ConnectionId,
  OAuthProtocolClient,
} from './types.js'

/** Illustrative five-minute attempt lifetime; this is application policy, not a Lunch Money token guarantee. */
export const AUTHORIZATION_ATTEMPT_TTL_MS = 5 * 60 * 1000

/**
 * Saves the server-only details needed after Lunch Money redirects the browser
 * back. A production implementation replaces this store with short-lived,
 * shared storage so any server instance handling the callback can find the
 * attempt that the signed-in user started.
 */
export interface AuthorizationAttemptStore {
  /**
   * Call this before redirecting the browser to Lunch Money. The application
   * has already attached its authenticated user and current browser session,
   * so neither identity needs to be accepted from the returning URL.
   */
  save(attempt: AuthorizationAttempt): Promise<void>
  /**
   * Call this when the browser returns, using the unpredictable `state` value
   * from the callback. Return and delete a matching, unexpired attempt as one
   * operation; also delete an expired match. Deleting on first use prevents a
   * copied callback from reusing the saved PKCE verifier or connection context,
   * even if a later callback check or token exchange fails.
   */
  consume(state: string): Promise<AuthorizationAttempt | undefined>
}

/**
 * Called when the signed-in application user chooses **Connect Lunch Money**.
 * Creates the Lunch Money authorization URL and saves the short-lived values
 * needed to verify the callback. The returned URL contains state and a PKCE
 * challenge, but the verifier, client secret, code, and tokens remain on the
 * server. The saved attempt also records the user and browser session that
 * started the connection.
 */
export async function startAuthorization(
  protocol: OAuthProtocolClient,
  attempts: AuthorizationAttemptStore,
  input: {
    applicationSessionId: ApplicationSessionId
    applicationUserId: ApplicationUserId
    connectionId: ConnectionId
    redirectUri: string
  },
  now: () => number = Date.now,
): Promise<URL> {
  const created = await protocol.createAuthorizationUrl(input.redirectUri)
  // Security invariant: ownership and browser-session binding come from authenticated server state, never form or callback values.
  await attempts.save({
    applicationSessionId: input.applicationSessionId,
    applicationUserId: input.applicationUserId,
    connectionId: input.connectionId,
    codeVerifier: created.codeVerifier,
    expiresAt: now() + AUTHORIZATION_ATTEMPT_TTL_MS,
    state: created.state,
  })
  return created.url
}
