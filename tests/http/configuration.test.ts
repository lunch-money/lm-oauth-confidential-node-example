import { describe, expect, it } from 'vitest'
import {
  loadConfiguration,
  safeConfigurationError,
} from '../../src/scaffolding/configuration.js'

describe('startup configuration', () => {
  it('uses the configured Lunch Money API origin for OAuth and API calls', () => {
    const value = loadConfiguration({
      NODE_ENV: 'test',
      OAUTH_CLIENT_ID: 'client',
      OAUTH_CLIENT_SECRET: 'server-secret',
      OAUTH_REDIRECT_URI: 'http://localhost:4002/oauth/callback',
      LUNCH_MONEY_API_BASE_URL: 'https://api.example/base',
      SESSION_SECRET: 'a-session-secret-with-at-least-32-characters',
    })
    expect(value.oauth.issuer.href).toBe('https://api.example/base')
    expect(value.oauth.meEndpoint.href).toBe('https://api.example/v2/me')
  })

  it('generates a local session secret when none is configured', () => {
    const value = loadConfiguration({
      OAUTH_CLIENT_ID: 'client-id',
      OAUTH_CLIENT_SECRET: 'client-secret',
      OAUTH_REDIRECT_URI: 'http://localhost:4002/oauth/callback',
      LUNCH_MONEY_API_BASE_URL: 'https://api.example.test/',
    })

    expect(value.oauth.issuer.href).toBe('https://api.example.test/')
    expect(value.oauth.meEndpoint.href).toBe('https://api.example.test/v2/me')
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

    expect(value.oauth.issuer.href).toBe('http://localhost:3002/')
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
