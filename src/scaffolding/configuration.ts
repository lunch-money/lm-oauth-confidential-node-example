import { randomBytes } from 'node:crypto'
import { z, ZodError } from 'zod'
import type { OAuthConfiguration } from '../oauth/configuration.js'

const secureOrLoopbackUrl = z
  .string()
  .url()
  .refine(
    (value) => {
      const url = new URL(value)
      return (
        url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    },
    {
      message: 'must use HTTPS or a loopback HTTP origin',
    },
  )

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  OAUTH_CLIENT_ID: z.string().min(1),
  OAUTH_CLIENT_SECRET: z.string().min(1),
  OAUTH_REDIRECT_URI: z.string().url(),
  LUNCH_MONEY_API_BASE_URL: secureOrLoopbackUrl,
  SESSION_SECRET: z.string().min(32).optional(),
  PORT: z.coerce.number().int().positive().default(4002),
})

export interface ApplicationConfiguration {
  readonly nodeEnv: 'development' | 'production' | 'test'
  readonly oauth: OAuthConfiguration
  readonly port: number
  readonly sessionSecret: string
}

/** Validates startup configuration and derives the public `/v2/me` endpoint. */
export function loadConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): ApplicationConfiguration {
  const value = schema.parse(environment)
  const apiBaseUrl = new URL(value.LUNCH_MONEY_API_BASE_URL)
  return {
    nodeEnv: value.NODE_ENV,
    oauth: {
      issuer: apiBaseUrl,
      clientId: value.OAUTH_CLIENT_ID,
      clientSecret: value.OAUTH_CLIENT_SECRET,
      redirectUri: value.OAUTH_REDIRECT_URI,
      meEndpoint: new URL('/v2/me', apiBaseUrl),
    },
    port: value.PORT,
    // The sample's sessions and credentials are already cleared on restart, so a
    // fresh signing secret is the safest zero-configuration local default.
    // Production applications must provide a strong value that remains stable
    // across restarts; it must not rotate for each OAuth authorization.
    sessionSecret:
      value.SESSION_SECRET ?? randomBytes(32).toString('base64url'),
  }
}

/** Returns only invalid setting names, never rejected values or secret contents. */
export function safeConfigurationError(error: unknown): string {
  if (!(error instanceof ZodError))
    return 'OAuth discovery or server startup failed.'
  const names = [
    ...new Set(
      error.issues.map((issue) => String(issue.path[0] ?? 'configuration')),
    ),
  ]
  const requiresHttps = error.issues.some(
    (issue) =>
      issue.path[0] === 'LUNCH_MONEY_API_BASE_URL' &&
      issue.message === 'must use HTTPS or a loopback HTTP origin',
  )
  return `Invalid or missing configuration: ${names.join(', ')}${requiresHttps ? '. LUNCH_MONEY_API_BASE_URL must use HTTPS or a loopback HTTP origin.' : ''}`
}
