import { OAuthError } from './errors.js'
import { redactSensitiveValue } from './redaction.js'
import type { CredentialStore } from './tokens.js'
import type { ApplicationUserId, ConnectionId, SafeJson } from './types.js'

/**
 * Calls Lunch Money `GET /v2/me` with a server-held access token and returns a
 * sanitized JSON object. Throws safe errors for missing grants, insufficient
 * scope, malformed JSON, network failures, and other non-success responses.
 */
export async function readLunchMoneyProfile(
  store: CredentialStore,
  owner: { applicationUserId: ApplicationUserId; connectionId: ConnectionId },
  meEndpoint: URL,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, SafeJson>> {
  const credentials = await store.get(
    owner.applicationUserId,
    owner.connectionId,
  )
  if (!credentials)
    throw new OAuthError(
      'credential_not_found',
      'Connect Lunch Money before calling /v2/me.',
    )

  let response: Response
  try {
    response = await fetcher(meEndpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    })
  } catch (cause) {
    throw new OAuthError(
      'resource_failure',
      'Lunch Money /v2/me could not be reached.',
      cause,
    )
  }
  if (response.status === 403) {
    throw new OAuthError(
      'insufficient_scope',
      'The registered client needs the me:read scope.',
    )
  }
  if (!response.ok)
    throw new OAuthError(
      'resource_failure',
      'Lunch Money rejected the /v2/me request.',
    )

  const body: unknown = await response.json().catch(() => undefined)
  const safe = redactSensitiveValue(body, [
    credentials.accessToken,
    credentials.refreshToken ?? '',
  ])
  if (!safe || Array.isArray(safe) || typeof safe !== 'object') {
    throw new OAuthError(
      'resource_failure',
      'Lunch Money /v2/me returned an invalid response.',
    )
  }
  return safe
}
