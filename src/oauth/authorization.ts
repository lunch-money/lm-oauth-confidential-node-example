import type {
  ApplicationSessionId,
  ApplicationUserId,
  AuthorizationAttempt,
  ConnectionId,
  OAuthProtocolClient,
} from './types.js'

/** Illustrative five-minute attempt lifetime; this is application policy, not a Lunch Money token guarantee. */
export const AUTHORIZATION_ATTEMPT_TTL_MS = 5 * 60 * 1000

/** Stores each pending connection request until Lunch Money redirects the browser back. */
export interface AuthorizationAttemptStore {
  /** Saves an attempt already bound to an authenticated application user. */
  save(attempt: AuthorizationAttempt): Promise<void>
  /** Atomically consumes a non-expired attempt by state, removing expired attempts and preventing replay. */
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
