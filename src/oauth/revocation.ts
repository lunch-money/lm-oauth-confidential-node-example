import { OAuthError } from './errors.js'
import type { CredentialStore } from './tokens.js'
import type {
  AccountId,
  ApplicationUserId,
  ConnectionId,
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
  owner:
    | { applicationUserId: ApplicationUserId; accountId: AccountId }
    | { applicationUserId: ApplicationUserId; connectionId: ConnectionId },
  meEndpoint: URL,
  fetcher: typeof fetch = fetch,
): Promise<RevocationResult> {
  const connectionKey =
    'accountId' in owner ? owner.accountId : owner.connectionId
  const credentials = await store.get(owner.applicationUserId, connectionKey)
  if (!credentials)
    throw new OAuthError(
      'credential_not_found',
      'No Lunch Money connection exists for this user.',
    )

  try {
    // Security invariant: revoking a refresh token revokes the Lunch Money grant;
    // access-only connections retain the narrower access-token behavior.
    await protocol.revoke(
      credentials.credentials.refreshToken ??
        credentials.credentials.accessToken,
      credentials.credentials.refreshToken ? 'refresh_token' : 'access_token',
    )
    // Security invariant: verification uses the just-revoked server-held value and never exposes it to the browser.
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
    // Security invariant: remove only the authenticated owner's local credential after verified revocation.
    await store.delete(owner.applicationUserId, connectionKey)
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
