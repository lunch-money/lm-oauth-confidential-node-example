import { z } from 'zod'
import { OAuthError } from './errors.js'
import type { CredentialStore } from './tokens.js'
import type {
  ApplicationUserId,
  ConnectionIdentity,
  CredentialSet,
} from './types.js'

const lunchMoneyProfileSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    id: z.number().int(),
    account_id: z.number().int(),
    budget_name: z.string(),
    primary_currency: z.string(),
    api_key_label: z.string().nullable(),
  })
  .strict()

/** Documented successful response from Lunch Money `GET /v2/me`. */
export type LunchMoneyProfile = z.infer<typeof lunchMoneyProfileSchema>

/** Calls and validates `GET /v2/me` with a credential already held by the server. */
export async function identifyLunchMoneyConnection(
  credentials: CredentialSet,
  meEndpoint: URL,
  fetcher: typeof fetch = fetch,
): Promise<LunchMoneyProfile> {
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
      { failureReason: 'network_error' },
    )
  }
  if (response.status === 403) {
    throw new OAuthError(
      'insufficient_scope',
      'The registered client needs the me:read scope.',
      undefined,
      { failureReason: 'http_error', httpStatus: response.status },
    )
  }
  if (!response.ok)
    throw new OAuthError(
      'resource_failure',
      'Lunch Money rejected the /v2/me request.',
      undefined,
      { failureReason: 'http_error', httpStatus: response.status },
    )

  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    throw new OAuthError(
      'resource_failure',
      'Lunch Money /v2/me returned an invalid response.',
      cause,
      { failureReason: 'invalid_json', httpStatus: response.status },
    )
  }
  const profile = lunchMoneyProfileSchema.safeParse(body)
  if (!profile.success) {
    throw new OAuthError(
      'resource_failure',
      'Lunch Money /v2/me returned an invalid response.',
      undefined,
      { failureReason: 'schema_mismatch', httpStatus: response.status },
    )
  }
  return profile.data
}

/**
 * Called when the connected application user chooses **Call /v2/me**. Loads
 * that user's server-held access token, calls Lunch Money, and returns a
 * validated profile without exposing the token. Throws safe errors when no
 * connection exists, `me:read` is missing, the response is malformed, or the
 * request fails.
 */
export async function readLunchMoneyProfile(
  store: CredentialStore,
  owner: { applicationUserId: ApplicationUserId } & ConnectionIdentity,
  meEndpoint: URL,
  fetcher: typeof fetch = fetch,
): Promise<LunchMoneyProfile> {
  const credentials = await store.get(owner.applicationUserId, owner)
  if (!credentials)
    throw new OAuthError(
      'credential_not_found',
      'Connect Lunch Money before calling /v2/me.',
    )

  return identifyLunchMoneyConnection(
    credentials.credentials,
    meEndpoint,
    fetcher,
  )
}
