import * as oauth from 'openid-client'
import { RefreshProtocolError } from './errors.js'
import type { CredentialSet, OAuthProtocolClient } from './types.js'

function convertTokenResponse(
  tokens: oauth.TokenEndpointResponse,
  options: { requireRotatedRefreshToken: boolean },
): CredentialSet {
  if (
    options.requireRotatedRefreshToken &&
    (!tokens.refresh_token ||
      typeof tokens.expires_in !== 'number' ||
      typeof tokens.scope !== 'string')
  ) {
    throw new RefreshProtocolError('malformed_response')
  }
  return {
    accessToken: tokens.access_token,
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    ...(typeof tokens.expires_in === 'number'
      ? {
          expiresAt: new Date(
            Date.now() + tokens.expires_in * 1000,
          ).toISOString(),
        }
      : {}),
    scope: tokens.scope ?? '',
  }
}

/** Configuration needed by the framework-independent OAuth workflow. */
export interface OAuthConfiguration {
  readonly issuer: URL
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
  readonly meEndpoint: URL
}

/**
 * Discovers Lunch Money metadata and returns the small protocol boundary used by
 * this sample. `openid-client` validates discovery metadata, callback state,
 * authorization responses, and token responses. The application still owns
 * user authentication, attempt storage, redirect URI configuration, credential
 * storage, authorization decisions, error redaction, and lifecycle cleanup.
 */
export async function createOpenIdClient(
  configuration: OAuthConfiguration,
  fetcher?: oauth.CustomFetch,
): Promise<OAuthProtocolClient> {
  // Loopback HTTP supports local protocol tests only. Deployed Lunch Money and
  // production application origins must use HTTPS.
  const allowTemporaryLoopbackHttp =
    configuration.issuer.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(configuration.issuer.hostname)
  const discovered = await oauth.discovery(
    configuration.issuer,
    configuration.clientId,
    { client_secret: configuration.clientSecret },
    oauth.ClientSecretBasic(configuration.clientSecret),
    {
      algorithm: 'oauth2',
      ...(allowTemporaryLoopbackHttp
        ? { execute: [oauth.allowInsecureRequests] }
        : {}),
      ...(fetcher ? { [oauth.customFetch]: fetcher } : {}),
    },
  )

  return {
    async createAuthorizationUrl(redirectUri) {
      // Security invariant: state and a new verifier are unpredictable and unique per attempt.
      const state = oauth.randomState()
      const codeVerifier = oauth.randomPKCECodeVerifier()
      const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier)
      const url = oauth.buildAuthorizationUrl(discovered, {
        redirect_uri: redirectUri,
        response_type: 'code',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        // Lunch Money applies the client's immutable registered scopes. Do not add `scope` here.
      })
      return { state, codeVerifier, url }
    },
    async exchangeCallback(callbackUrl, expected) {
      // Security invariant: openid-client must compare callback state and bind the code to our PKCE verifier.
      const tokens = await oauth.authorizationCodeGrant(
        discovered,
        callbackUrl,
        {
          expectedState: expected.state,
          pkceCodeVerifier: expected.codeVerifier,
        },
      )
      return convertTokenResponse(tokens, { requireRotatedRefreshToken: false })
    },
    async refresh(credentials) {
      if (!credentials.refreshToken)
        throw new RefreshProtocolError('malformed_response')
      try {
        const tokens = await oauth.refreshTokenGrant(
          discovered,
          credentials.refreshToken,
        )
        // Lunch Money rotates on every refresh. Accepting a response without the
        // replacement would leave the application holding a consumed credential.
        return convertTokenResponse(tokens, {
          requireRotatedRefreshToken: true,
        })
      } catch (cause) {
        if (cause instanceof RefreshProtocolError) throw cause
        if (cause instanceof oauth.ResponseBodyError) {
          throw new RefreshProtocolError(
            cause.error === 'invalid_grant' ? 'invalid_grant' : 'transient',
            cause,
          )
        }
        throw new RefreshProtocolError('transient', cause)
      }
    },
    async revoke(token, tokenKind) {
      // Security invariant: revocation happens server-to-server; the browser never receives the token.
      await oauth.tokenRevocation(discovered, token, {
        token_type_hint: tokenKind,
      })
    },
  }
}
