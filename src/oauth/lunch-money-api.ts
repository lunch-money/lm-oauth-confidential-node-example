import { z } from 'zod'
import { OAuthError } from './errors.js'
import type { CredentialStore } from './tokens.js'
import type { ApplicationUserId, ConnectionId } from './types.js'

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

/**
 * Calls Lunch Money `GET /v2/me` with a server-held access token and returns a
 * validated user profile. Throws safe errors for missing grants, insufficient
 * scope, malformed JSON, network failures, and other non-success responses.
 */
export async function readLunchMoneyProfile(
  store: CredentialStore,
  owner: { applicationUserId: ApplicationUserId; connectionId: ConnectionId },
  meEndpoint: URL,
  fetcher: typeof fetch = fetch,
): Promise<LunchMoneyProfile> {
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
  const profile = lunchMoneyProfileSchema.safeParse(body)
  if (!profile.success) {
    throw new OAuthError(
      'resource_failure',
      'Lunch Money /v2/me returned an invalid response.',
    )
  }
  return profile.data
}
