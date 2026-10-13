import { createHash, timingSafeEqual } from 'node:crypto'
import type { Context } from 'hono'
import type { BrowserSession } from './in-memory-stores.js'

function equalTokens(expected: string, received: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(expected), digest(received))
}

/**
 * Verifies a form token against server-side browser-session state. Missing or
 * incorrect values fail closed; the submitted value is never logged.
 */
export async function verifyCsrfToken(
  context: Context,
  session: BrowserSession,
): Promise<boolean> {
  const body = await context.req.parseBody()
  const submitted = body.csrf_token
  // Before a form changes server state, require the random token stored in this
  // signed browser session so another site cannot submit the action for the user.
  return (
    typeof submitted === 'string' && equalTokens(session.csrfToken, submitted)
  )
}
