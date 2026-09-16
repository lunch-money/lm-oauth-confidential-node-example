import type { ApplicationUserId, ConnectionId, CredentialSet } from './types.js'

/**
 * Application-provided storage for Lunch Money credentials.
 *
 * Every operation identifies both the signed-in application user and one Lunch
 * Money connection so credentials cannot be read or changed for another user.
 * Production implementations must encrypt and durably store credentials, keep
 * users' data separate, replace a complete credential set in one operation, and
 * remove it when the connection or application account ends. Use an internal
 * application user ID, never an email address or browser-provided ID.
 */
export interface CredentialStore {
  get(
    applicationUserId: ApplicationUserId,
    connectionId: ConnectionId,
  ): Promise<CredentialSet | undefined>
  replace(
    applicationUserId: ApplicationUserId,
    connectionId: ConnectionId,
    credentials: CredentialSet,
  ): Promise<void>
  delete(
    applicationUserId: ApplicationUserId,
    connectionId: ConnectionId,
  ): Promise<boolean>
}

/** Reads only the credential owned by the authenticated application user. */
export async function readCredentials(
  store: CredentialStore,
  applicationUserId: ApplicationUserId,
  connectionId: ConnectionId,
): Promise<CredentialSet | undefined> {
  return store.get(applicationUserId, connectionId)
}

/**
 * Saves all replacement credential values together after authorization or
 * refresh.
 *
 * Lunch Money stops accepting a refresh token after it is used. A production
 * implementation must therefore save the new access token, refresh token,
 * expiration, and scopes in one operation rather than updating fields one at a
 * time.
 */
export async function replaceCredentials(
  store: CredentialStore,
  applicationUserId: ApplicationUserId,
  connectionId: ConnectionId,
  credentials: CredentialSet,
): Promise<void> {
  // Security invariant: replacement is scoped to the authenticated owner and connection.
  await store.replace(applicationUserId, connectionId, credentials)
}

/** Deletes only local credentials; this does not revoke them at Lunch Money. */
export async function deleteCredentials(
  store: CredentialStore,
  applicationUserId: ApplicationUserId,
  connectionId: ConnectionId,
): Promise<boolean> {
  return store.delete(applicationUserId, connectionId)
}
