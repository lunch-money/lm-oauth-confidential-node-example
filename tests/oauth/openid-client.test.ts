import { Buffer } from 'node:buffer'
import type { CustomFetch, CustomFetchOptions } from 'openid-client'
import * as oauth from 'openid-client'
import { describe, expect, it, vi } from 'vitest'
import { createOpenIdClient } from '../../src/oauth/index.js'

const redirectUri = 'http://localhost:4002/oauth/callback'
const metadata = {
  issuer: 'https://issuer.example',
  authorization_endpoint: 'https://issuer.example/oauth/authorize',
  token_endpoint: 'https://issuer.example/oauth/token',
  revocation_endpoint: 'https://issuer.example/oauth/revoke',
  response_types_supported: ['code'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['client_secret_basic'],
}

function configuration() {
  return {
    issuer: new URL(metadata.issuer),
    clientId: 'sample-client',
    clientSecret: 'server-secret',
    redirectUri,
    meEndpoint: new URL('https://api.example/v2/me'),
  }
}

function decodeBasicCredentials(value: string | null): [string, string] {
  const decoded = Buffer.from(
    value?.replace('Basic ', '') ?? '',
    'base64',
  ).toString()
  const separator = decoded.indexOf(':')
  return [
    decodeURIComponent(decoded.slice(0, separator)),
    decodeURIComponent(decoded.slice(separator + 1)),
  ]
}

describe('openid-client adapter', () => {
  it('uses discovered endpoints and builds state plus S256 PKCE without an authorization scope', async () => {
    const fetcher = vi
      .fn<CustomFetch>()
      .mockResolvedValue(Response.json(metadata))
    const protocol = await createOpenIdClient(configuration(), fetcher)
    const request = await protocol.createAuthorizationUrl(redirectUri)

    expect(fetcher).toHaveBeenCalledOnce()
    expect(request.url.searchParams.get('client_id')).toBe('sample-client')
    expect(request.url.searchParams.get('redirect_uri')).toBe(redirectUri)
    expect(request.url.searchParams.get('state')).toBe(request.state)
    expect(request.url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(request.url.searchParams.get('code_challenge')).toBe(
      await oauth.calculatePKCECodeChallenge(request.codeVerifier),
    )
    expect(request.url.searchParams.has('scope')).toBe(false)
    expect(request.url.toString()).not.toContain(request.codeVerifier)
    expect(request.url.toString()).not.toContain('server-secret')
  })

  it('exchanges with expected state, verifier, exact redirect URI, and confidential client authentication', async () => {
    const requests: Array<{ url: string; init: CustomFetchOptions }> = []
    const fetcher = vi
      .fn<CustomFetch>()
      .mockImplementation(async (input, init) => {
        const url = input
        requests.push({ url, init })
        if (url.endsWith('/.well-known/oauth-authorization-server'))
          return Response.json(metadata)
        if (url === metadata.token_endpoint) {
          return Response.json({
            access_token: 'private-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'me:read',
          })
        }
        throw new Error(`Unexpected test request: ${url}`)
      })
    const protocol = await createOpenIdClient(configuration(), fetcher)
    const authorization = await protocol.createAuthorizationUrl(redirectUri)
    const credentials = await protocol.exchangeCallback(
      new URL(`${redirectUri}?code=one-time-code&state=${authorization.state}`),
      { state: authorization.state, codeVerifier: authorization.codeVerifier },
    )

    expect(credentials).toMatchObject({
      accessToken: 'private-access-token',
      scope: 'me:read',
    })
    expect(credentials).not.toHaveProperty('refreshToken')
    expect(credentials.expiresAt).toBeTruthy()
    const tokenRequest = requests.find(
      (request) => request.url === metadata.token_endpoint,
    )
    expect(tokenRequest).toBeDefined()
    const headers = new Headers(tokenRequest?.init?.headers)
    expect(decodeBasicCredentials(headers.get('authorization'))).toEqual([
      'sample-client',
      'server-secret',
    ])
    const body = new URLSearchParams(String(tokenRequest?.init?.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('one-time-code')
    expect(body.get('code_verifier')).toBe(authorization.codeVerifier)
    expect(body.get('redirect_uri')).toBe(redirectUri)
  })

  it('rejects mismatched state before sending a token request', async () => {
    const fetcher = vi
      .fn<CustomFetch>()
      .mockResolvedValue(Response.json(metadata))
    const protocol = await createOpenIdClient(configuration(), fetcher)
    await expect(
      protocol.exchangeCallback(
        new URL(`${redirectUri}?code=code&state=wrong`),
        { state: 'expected', codeVerifier: 'verifier' },
      ),
    ).rejects.toBeDefined()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('refreshes with the server-held token, confidential authentication, and converts the rotated replacement', async () => {
    let tokenRequest: CustomFetchOptions | undefined
    const fetcher = vi
      .fn<CustomFetch>()
      .mockImplementation(async (input, init) => {
        if (input.endsWith('/.well-known/oauth-authorization-server'))
          return Response.json(metadata)
        if (input === metadata.token_endpoint) {
          tokenRequest = init
          return Response.json({
            access_token: 'replacement-access',
            refresh_token: 'replacement-refresh',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'me:read offline_access',
          })
        }
        throw new Error(`Unexpected test request: ${input}`)
      })
    const protocol = await createOpenIdClient(configuration(), fetcher)
    const credentials = await protocol.refresh({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      scope: 'me:read offline_access',
    })

    expect(credentials).toMatchObject({
      accessToken: 'replacement-access',
      refreshToken: 'replacement-refresh',
      scope: 'me:read offline_access',
    })
    expect(credentials.expiresAt).toBeTruthy()
    const headers = new Headers(tokenRequest?.headers)
    expect(decodeBasicCredentials(headers.get('authorization'))).toEqual([
      'sample-client',
      'server-secret',
    ])
    const body = new URLSearchParams(String(tokenRequest?.body))
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('old-refresh')
    expect(body.has('scope')).toBe(false)
  })

  it('rejects a successful refresh response without the required rotated refresh token', async () => {
    const fetcher = vi.fn<CustomFetch>().mockImplementation(async (input) => {
      if (input.endsWith('/.well-known/oauth-authorization-server'))
        return Response.json(metadata)
      return Response.json({
        access_token: 'replacement-access',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'me:read offline_access',
      })
    })
    const protocol = await createOpenIdClient(configuration(), fetcher)
    await expect(
      protocol.refresh({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        scope: 'me:read offline_access',
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response' })
  })

  it('classifies provider invalid_grant without exposing the response through the adapter result', async () => {
    const fetcher = vi.fn<CustomFetch>().mockImplementation(async (input) => {
      if (input.endsWith('/.well-known/oauth-authorization-server'))
        return Response.json(metadata)
      return Response.json(
        {
          error: 'invalid_grant',
          error_description: 'sensitive provider detail',
        },
        { status: 400 },
      )
    })
    const protocol = await createOpenIdClient(configuration(), fetcher)
    await expect(
      protocol.refresh({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        scope: 'me:read offline_access',
      }),
    ).rejects.toMatchObject({ kind: 'invalid_grant' })
  })

  it('revokes the server-held access token using confidential client authentication', async () => {
    let revocation: { init: CustomFetchOptions } | undefined
    const fetcher = vi
      .fn<CustomFetch>()
      .mockImplementation(async (input, init) => {
        const url = input
        if (url.endsWith('/.well-known/oauth-authorization-server'))
          return Response.json(metadata)
        if (url === metadata.revocation_endpoint) {
          revocation = { init }
          return new Response(null, { status: 200 })
        }
        throw new Error(`Unexpected test request: ${url}`)
      })
    const protocol = await createOpenIdClient(configuration(), fetcher)
    await protocol.revoke('server-held-access-token', 'access_token')

    const headers = new Headers(revocation?.init?.headers)
    expect(decodeBasicCredentials(headers.get('authorization'))).toEqual([
      'sample-client',
      'server-secret',
    ])
    const body = new URLSearchParams(String(revocation?.init?.body))
    expect(body.get('token')).toBe('server-held-access-token')
    expect(body.get('token_type_hint')).toBe('access_token')
  })
})
