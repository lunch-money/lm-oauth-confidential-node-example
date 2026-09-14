import type {
  ApplicationSessionId,
  ApplicationUserId,
  AuthorizationAttempt,
  ConnectionId,
  OAuthProtocolClient,
} from './types.js'

/** Illustrative five-minute attempt lifetime; this is application policy, not a Lunch Money token guarantee. */
export const AUTHORIZATION_ATTEMPT_TTL_MS = 5 * 60 * 1000

/** Server-side boundary for finite, one-time authorization attempts. */
export interface AuthorizationAttemptStore {
  /** Saves an attempt already bound to an authenticated application user. */
  save(attempt: AuthorizationAttempt): Promise<void>
  /** Atomically consumes a non-expired attempt by state, removing expired attempts and preventing replay. */
  consume(state: string): Promise<AuthorizationAttempt | undefined>
}

/**
 * Starts authorization for the authenticated application user and stores PKCE
 * material on the server. The returned URL contains state and a challenge, but
 * never the verifier, client secret, code, or tokens. The attempt is also bound
 * to the initiating application browser session and receives a short lifetime.
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
