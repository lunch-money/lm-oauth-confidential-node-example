import type {
  ApplicationUserId,
  ConnectionIdentity,
  LunchMoneyConnection,
} from './types.js'

/**
 * Application-provided storage for Lunch Money credentials.
 *
 * Every operation identifies both the signed-in application user and one Lunch
 * Money connection so credentials cannot be read or changed for another user.
 * A production implementation must encrypt credentials, keep them after a
 * server restart, prevent one user from reading another user's values, replace
 * all rotated token values together, and remove them when access ends. Use an
 * internal application user ID, never an email address or browser-provided ID.
 */
export interface CredentialStore {
  get(
    applicationUserId: ApplicationUserId,
    identity: ConnectionIdentity,
  ): Promise<LunchMoneyConnection | undefined>
  list(applicationUserId: ApplicationUserId): Promise<LunchMoneyConnection[]>
  upsert(
    applicationUserId: ApplicationUserId,
    connection: LunchMoneyConnection,
  ): Promise<void>
  delete(
    applicationUserId: ApplicationUserId,
    identity: ConnectionIdentity,
  ): Promise<boolean>
}

/** Reads only the credential owned by the authenticated application user. */
export async function readCredentials(
  store: CredentialStore,
  applicationUserId: ApplicationUserId,
  identity: ConnectionIdentity,
): Promise<LunchMoneyConnection | undefined> {
  return store.get(applicationUserId, identity)
}

/** Deletes only local credentials; this does not revoke them at Lunch Money. */
export async function deleteCredentials(
  store: CredentialStore,
  applicationUserId: ApplicationUserId,
  identity: ConnectionIdentity,
): Promise<boolean> {
  return store.delete(applicationUserId, identity)
}
