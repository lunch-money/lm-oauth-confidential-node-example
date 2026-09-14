import { OAuthError } from './errors.js'
import type { AuthorizationAttemptStore } from './authorization.js'
import type { CredentialStore } from './tokens.js'
import type {
  ApplicationSessionId,
  ApplicationUserId,
  ConnectionId,
  OAuthProtocolClient,
} from './types.js'

/**
 * Validates and consumes a callback, then stores credentials under the identity
 * bound before redirect. No callback value is accepted as a credential owner.
 */
export async function completeAuthorization(
  protocol: OAuthProtocolClient,
  attempts: AuthorizationAttemptStore,
  credentials: CredentialStore,
  callbackUrl: URL,
  authenticatedApplicationUserId: ApplicationUserId,
  applicationSessionId: ApplicationSessionId,
): Promise<{
  applicationUserId: ApplicationUserId
  connectionId: ConnectionId
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

  // Security invariant: verified credentials inherit the owner bound to the original server-side attempt.
  await credentials.replace(
    attempt.applicationUserId,
    attempt.connectionId,
    tokenSet,
  )
  return {
    applicationUserId: attempt.applicationUserId,
    connectionId: attempt.connectionId,
  }
}
