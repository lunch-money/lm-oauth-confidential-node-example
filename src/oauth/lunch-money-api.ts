import {
  LunchMoneyClient,
  LunchMoneyError,
  type User,
} from '@lunch-money/lunch-money-js-v2'
import { OAuthError } from './errors.js'
import type { CredentialStore } from './tokens.js'
import type {
  ApplicationUserId,
  ConnectionIdentity,
  CredentialSet,
} from './types.js'

const profileFields = [
  'name',
  'email',
  'id',
  'account_id',
  'budget_name',
  'primary_currency',
  'api_key_label',
] as const satisfies readonly (keyof User)[]

/** User and budgeting-account details returned by the official SDK for `GET /v2/me`. */
export type LunchMoneyProfile = User

function hasRequiredProfileFields(body: User): boolean {
  return !(
    typeof body !== 'object' ||
    body === null ||
    profileFields.some((field) => body[field] === undefined)
  )
}

function sdkBaseUrl(meEndpoint: URL): string {
  const baseUrl = new URL(meEndpoint)
  if (!baseUrl.pathname.endsWith('/me')) {
    throw new OAuthError(
      'resource_failure',
      'Lunch Money /v2/me is not configured correctly.',
    )
  }
  baseUrl.pathname = baseUrl.pathname.slice(0, -'/me'.length)
  baseUrl.search = ''
  baseUrl.hash = ''
  return baseUrl.href.replace(/\/$/, '')
}

/** Calls `GET /v2/me` with a server-held token and rejects a response missing a required profile property. */
export async function identifyLunchMoneyConnection(
  credentials: CredentialSet,
  meEndpoint: URL,
  fetcher: typeof fetch = fetch,
): Promise<LunchMoneyProfile> {
  let response: Response | undefined
  const client = new LunchMoneyClient({
    apiKey: credentials.accessToken,
    baseUrl: sdkBaseUrl(meEndpoint),
    fetch: async (request) => {
      response = await fetcher(request)
      return response
    },
  })
  let body: User
  try {
    body = await client.user.getMe()
  } catch (cause) {
    if (cause instanceof LunchMoneyError) {
      if (cause.status === 403) {
        throw new OAuthError(
          'insufficient_scope',
          'The registered client needs the me:read scope.',
          cause,
          { failureReason: 'http_error', httpStatus: cause.status },
        )
      }
      throw new OAuthError(
        'resource_failure',
        'Lunch Money rejected the /v2/me request.',
        cause,
        {
          failureReason: 'http_error',
          ...(cause.status === undefined ? {} : { httpStatus: cause.status }),
        },
      )
    }
    if (response) {
      throw new OAuthError(
        'resource_failure',
        'Lunch Money /v2/me returned an invalid response.',
        cause,
        { failureReason: 'invalid_json', httpStatus: response.status },
      )
    }
    throw new OAuthError(
      'resource_failure',
      'Lunch Money /v2/me could not be reached.',
      cause,
      { failureReason: 'network_error' },
    )
  }
  if (!hasRequiredProfileFields(body)) {
    throw new OAuthError(
      'resource_failure',
      'Lunch Money rejected the /v2/me request.',
      undefined,
      {
        failureReason: 'invalid_response',
        ...(response === undefined ? {} : { httpStatus: response.status }),
      },
    )
  }
  return body
}

/**
 * Called when the connected application user chooses **Call /v2/me**. Loads
 * that user's server-held access token, calls Lunch Money through the official
 * SDK, and returns its profile without exposing the token. It reports a safe
 * error when no connection exists, `me:read` is missing, the response is
 * incomplete, or the request fails.
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
