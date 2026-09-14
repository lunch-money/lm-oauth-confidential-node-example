import { randomBytes } from 'node:crypto'
import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import type { ApplicationConfiguration } from '../configuration.js'
import type {
  BrowserSession,
  InMemoryBrowserSessionStore,
} from './in-memory-stores.js'

const COOKIE_NAME = 'lm_oauth_sample'

/** Reads or creates an opaque server-side session selected by a signed browser cookie. */
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
  // Security invariant: the cookie holds only an opaque signed locator, never OAuth credentials or PKCE material.
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

/** Clears the browser's opaque session locator. */
export function clearBrowserCookie(context: Context): void {
  deleteCookie(context, COOKIE_NAME, { path: '/' })
}
