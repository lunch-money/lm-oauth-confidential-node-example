import { OAuthError } from './errors.js'
import type { CredentialStore } from './tokens.js'
import type {
  ApplicationUserId,
  ConnectionIdentity,
  OAuthProtocolClient,
  RevocationResult,
} from './types.js'

/**
 * Called when the connected user chooses **Disconnect active budget**. Revokes the
 * refresh token when one exists, ending continuing access; otherwise it revokes
 * the access token. It then confirms that `/v2/me` rejects the old access token
 * before deleting that user's locally stored credentials.
 */
export async function revokeAndVerify(
  protocol: OAuthProtocolClient,
  store: CredentialStore,
  owner: { applicationUserId: ApplicationUserId } & ConnectionIdentity,
  meEndpoint: URL,
  fetcher: typeof fetch = fetch,
): Promise<RevocationResult> {
  const credentials = await store.get(owner.applicationUserId, owner)
  if (!credentials)
    throw new OAuthError(
      'credential_not_found',
      'No Lunch Money connection exists for this user.',
    )

  try {
    // When a refresh token exists, revoke it to end the whole Lunch Money grant.
    // Revoke the access token only for a connection that has no refresh token,
    // or the broader grant could remain usable.
    await protocol.revoke(
      credentials.credentials.refreshToken ??
        credentials.credentials.accessToken,
      credentials.credentials.refreshToken ? 'refresh_token' : 'access_token',
    )
    // After revocation, call /v2/me with the old server-held access token to
    // confirm rejection without exposing that token to the browser.
    const verification = await fetcher(meEndpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.credentials.accessToken}`,
      },
    })
    const rejected = verification.status === 401
    if (!rejected) {
      throw new OAuthError(
        'provider_failure',
        'Revocation was requested, but the old credential was not rejected.',
      )
    }
    // Delete only this authenticated user's matching connection after Lunch
    // Money rejects the old token so another user's credentials remain intact.
    await store.delete(owner.applicationUserId, owner)
    return { revoked: true, oldCredentialRejected: true }
  } catch (cause) {
    if (cause instanceof OAuthError) throw cause
    throw new OAuthError(
      'provider_failure',
      'Lunch Money access could not be revoked.',
      cause,
    )
  }
}
