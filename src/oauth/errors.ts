/** Stable, browser-safe failure categories. Provider bodies and credentials are never included. */
export type OAuthErrorCode =
  | 'authorization_denied'
  | 'callback_invalid'
  | 'credential_not_found'
  | 'insufficient_scope'
  | 'provider_failure'
  | 'refresh_temporarily_unavailable'
  | 'reauthorization_required'
  | 'resource_failure'

/** A safe domain error suitable for mapping to an HTTP response or redacted log event. */
export class OAuthError extends Error {
  constructor(
    public readonly code: OAuthErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'OAuthError'
  }
}

/** Internal refresh failure classification; messages and provider bodies remain server-only. */
export class RefreshProtocolError extends Error {
  constructor(
    public readonly kind: 'invalid_grant' | 'transient' | 'malformed_response',
    public readonly cause?: unknown,
  ) {
    super(kind)
    this.name = 'RefreshProtocolError'
  }
}

/** Converts unknown failures to a stable public message without leaking provider responses. */
export function publicErrorMessage(error: unknown): string {
  return error instanceof OAuthError
    ? error.message
    : 'Lunch Money OAuth could not complete. Please try again.'
}
