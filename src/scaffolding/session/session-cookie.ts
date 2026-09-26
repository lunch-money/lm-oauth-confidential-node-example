import { randomBytes } from 'node:crypto'
import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import type { ApplicationConfiguration } from '../configuration.js'
import type {
  BrowserSession,
  InMemoryBrowserSessionStore,
} from './in-memory-stores.js'

const COOKIE_NAME = 'lm_oauth_sample'

/**
 * Call for each demonstration request to load or create its browser session.
 * The cookie contains only a random ID whose signature lets the server detect
 * modification; the actual session data stays in server memory. This keeps one
 * browser's OAuth callback tied to the browser that started it, but it does not
 * sign a user in and is not a replacement for the integrating application's
 * authentication and session management.
 */
export async function browserSession(
  context: Context,
  configuration: ApplicationConfiguration,
  store: InMemoryBrowserSessionStore,
): Promise<{
  id: import('../../oauth/types.js').ApplicationSessionId
  value: BrowserSession
}> {
  const existing = await getSignedCookie(
    context,
    configuration.sessionSecret,
    COOKIE_NAME,
  )
  if (typeof existing === 'string') {
    const value = store.get(existing)
    if (value)
      return {
        id: existing as import('../../oauth/types.js').ApplicationSessionId,
        value,
      }
  }
  const id = randomBytes(32).toString('base64url')
  const value = store.create(id, randomBytes(32).toString('base64url'))
  // Security invariant: the cookie holds only a signed random lookup ID; OAuth credentials, PKCE values, and session data stay on the server.
  await setSignedCookie(context, COOKIE_NAME, id, configuration.sessionSecret, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: configuration.oauth.redirectUri.startsWith('https://'),
    path: '/',
  })
  return {
    id: id as import('../../oauth/types.js').ApplicationSessionId,
    value,
  }
}

/** Clears the browser's signed session lookup ID when the local demo resets. */
export function clearBrowserCookie(context: Context): void {
  deleteCookie(context, COOKIE_NAME, { path: '/' })
}
