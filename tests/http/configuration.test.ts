import { describe, expect, it } from 'vitest'
import {
  DEFAULT_API_BASE_URL,
  loadConfiguration,
  safeConfigurationError,
} from '../../src/scaffolding/configuration.js'

describe('startup configuration', () => {
  it('defaults OAuth discovery and API calls to the production origin', () => {
    const value = loadConfiguration({
      OAUTH_CLIENT_ID: 'client',
      OAUTH_CLIENT_SECRET: 'server-secret',
      OAUTH_REDIRECT_URI: 'http://localhost:4002/oauth/callback',
    })

    expect(value.oauth.issuer.origin).toBe(DEFAULT_API_BASE_URL)
    expect(value.oauth.meEndpoint.href).toBe(`${DEFAULT_API_BASE_URL}/v2/me`)
  })

  it('uses the alpha Lunch Money API origin for OAuth and API calls', () => {
    const value = loadConfiguration({
      NODE_ENV: 'test',
      OAUTH_CLIENT_ID: 'client',
      OAUTH_CLIENT_SECRET: 'server-secret',
      OAUTH_REDIRECT_URI: 'http://localhost:4002/oauth/callback',
      LUNCH_MONEY_API_BASE_URL: 'https://api-alpha.lunchmoney.dev',
      SESSION_SECRET: 'a-session-secret-with-at-least-32-characters',
    })
    expect(value.oauth.issuer.origin).toBe('https://api-alpha.lunchmoney.dev')
    expect(value.oauth.meEndpoint.href).toBe(
      'https://api-alpha.lunchmoney.dev/v2/me',
    )
  })

  it('generates a local session secret when none is configured', () => {
    const value = loadConfiguration({
      OAUTH_CLIENT_ID: 'client-id',
      OAUTH_CLIENT_SECRET: 'client-secret',
      OAUTH_REDIRECT_URI: 'http://localhost:4002/oauth/callback',
      LUNCH_MONEY_API_BASE_URL: 'https://api-alpha.lunchmoney.dev///',
    })

    expect(value.oauth.issuer.origin).toBe('https://api-alpha.lunchmoney.dev')
    expect(value.oauth.meEndpoint.href).toBe(
      'https://api-alpha.lunchmoney.dev/v2/me',
    )
    expect(value.sessionSecret.length).toBeGreaterThanOrEqual(32)
  })

  it('fails before startup when required client configuration is absent', () => {
    expect(() => loadConfiguration({})).toThrow()
  })

  it('temporarily permits a loopback HTTP origin for local validation', () => {
    const value = loadConfiguration({
      OAUTH_CLIENT_ID: 'client-id',
      OAUTH_CLIENT_SECRET: 'client-secret',
      OAUTH_REDIRECT_URI: 'http://localhost:4002/oauth/callback',
      LUNCH_MONEY_API_BASE_URL: 'http://localhost:3002',
    })

    expect(value.oauth.issuer.origin).toBe('http://localhost:3002')
  })

  it('rejects a URL with a path because the API base URL must be an origin', () => {
    try {
      loadConfiguration({
        OAUTH_CLIENT_ID: 'client-id',
        OAUTH_CLIENT_SECRET: 'client-secret',
        OAUTH_REDIRECT_URI: 'http://localhost:4002/oauth/callback',
        LUNCH_MONEY_API_BASE_URL: 'https://api.lunchmoney.dev/base',
      })
      expect.unreachable('configuration should have been rejected')
    } catch (error) {
      expect(safeConfigurationError(error)).toContain(
        'LUNCH_MONEY_API_BASE_URL must be an origin without a path, query, or fragment.',
      )
    }
  })

  it('reports invalid setting names without echoing a rejected secret', () => {
    const rejectedSecret = 'do-not-echo-this-secret'
    try {
      loadConfiguration({ OAUTH_CLIENT_SECRET: rejectedSecret })
    } catch (error) {
      const message = safeConfigurationError(error)
      expect(message).toContain('OAUTH_CLIENT_ID')
      expect(message).not.toContain(rejectedSecret)
    }
  })
})
