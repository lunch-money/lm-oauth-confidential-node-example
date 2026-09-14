import type { ApplicationUserId, ConnectionId, CredentialSet } from './types.js'

/**
 * Credential ownership boundary for a confidential integration.
 *
 * Every operation requires a stable, authenticated application-user identity;
 * optional connection IDs allow multiple grants without weakening ownership.
 * Implementations must enforce tenant isolation. Production implementations
 * also need durable encrypted storage, key management, atomic replacement, and
 * lifecycle cleanup. Never key credentials by email or a browser-provided ID.
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
 * Atomically replaces the entire credential set.
 *
 * Refresh-token rotation consumes the old token before this call. A production
 * implementation must commit the new access token, refresh token, expiration,
 * and scope metadata as one transaction; field-by-field updates are unsafe.
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
