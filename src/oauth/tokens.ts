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
 * Production implementations must encrypt and durably store credentials, keep
 * users' data separate, replace a complete credential set in one operation, and
 * remove it when the connection or application account ends. Use an internal
 * application user ID, never an email address or browser-provided ID.
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
