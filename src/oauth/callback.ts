import { OAuthError } from './errors.js'
import type { AuthorizationAttemptStore } from './authorization.js'
import type { CredentialStore } from './tokens.js'
import { identifyLunchMoneyConnection } from './lunch-money-api.js'
import type {
  AccountId,
  ApplicationSessionId,
  ApplicationUserId,
  OAuthProtocolClient,
} from './types.js'

/**
 * Called when Lunch Money redirects the browser to the application's callback.
 * Uses the saved one-time attempt to require the same signed-in user and browser
 * session, exchanges the code on the server, and saves the credentials for the
 * user who started the connection. Callback values never choose their owner.
 */
export async function completeAuthorization(
  protocol: OAuthProtocolClient,
  attempts: AuthorizationAttemptStore,
  credentials: CredentialStore,
  callbackUrl: URL,
  authenticatedApplicationUserId: ApplicationUserId,
  applicationSessionId: ApplicationSessionId,
  meEndpoint: URL = new URL('/v2/me', callbackUrl),
  fetcher: typeof fetch = fetch,
): Promise<{
  applicationUserId: ApplicationUserId
  accountId: AccountId
  lunchMoneyUserId: number
}> {
  const error = callbackUrl.searchParams.get('error')
  const state = callbackUrl.searchParams.get('state')
  if (!state)
    throw new OAuthError(
      'callback_invalid',
      'The OAuth callback could not be verified.',
    )

  // Security invariant: consuming state makes the attempt single-use and recovers its server-bound owner.
  const attempt = await attempts.consume(state)
  if (!attempt)
    throw new OAuthError(
      'callback_invalid',
      'The OAuth callback could not be verified.',
    )
  // Security invariant: the user completing the callback must be the same server-authenticated user who started it.
  if (attempt.applicationUserId !== authenticatedApplicationUserId) {
    throw new OAuthError(
      'callback_invalid',
      'The OAuth callback could not be verified.',
    )
  }
  // Security invariant: a callback must return to the same opaque application session that initiated the redirect.
  if (attempt.applicationSessionId !== applicationSessionId) {
    throw new OAuthError(
      'callback_invalid',
      'The OAuth callback could not be verified.',
    )
  }
  if (error)
    throw new OAuthError(
      'authorization_denied',
      'Lunch Money authorization was denied or cancelled.',
    )
  if (!callbackUrl.searchParams.get('code')) {
    throw new OAuthError(
      'callback_invalid',
      'The OAuth callback did not include an authorization code.',
    )
  }

  let tokenSet
  try {
    tokenSet = await protocol.exchangeCallback(callbackUrl, {
      state: attempt.state,
      codeVerifier: attempt.codeVerifier,
    })
  } catch (cause) {
    // Security invariant: provider errors may contain codes, bodies, and credentials; expose only this stable message.
    throw new OAuthError(
      'provider_failure',
      'Lunch Money could not complete the token exchange.',
      cause,
    )
  }

  // Security invariant: only the validated resource response decides which budgeting account owns the credentials.
  const profile = await identifyLunchMoneyConnection(
    tokenSet,
    meEndpoint,
    fetcher,
  )
  const accountId = profile.account_id as AccountId
  await credentials.upsert(attempt.applicationUserId, {
    accountId,
    budgetName: profile.budget_name,
    credentials: tokenSet,
    lunchMoneyUserId: profile.id,
    lunchMoneyUserName: profile.name,
  })
  return {
    applicationUserId: attempt.applicationUserId,
    accountId,
    lunchMoneyUserId: profile.id,
  }
}
