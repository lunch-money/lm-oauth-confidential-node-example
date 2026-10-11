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

export interface OAuthErrorDiagnostic {
  readonly failureReason?:
    'http_error' | 'invalid_json' | 'network_error' | 'schema_mismatch'
  readonly httpStatus?: number
}

/** A safe domain error suitable for mapping to an HTTP response or redacted log event. */
export class OAuthError extends Error {
  constructor(
    public readonly code: OAuthErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly diagnostic?: OAuthErrorDiagnostic,
  ) {
    super(message)
    this.name = 'OAuthError'
  }
}

/** Returns only allowlisted diagnostic fields that cannot contain credentials or provider bodies. */
export function safeOAuthErrorDiagnostic(
  error: unknown,
): Record<string, unknown> {
  if (!(error instanceof OAuthError)) return { errorCode: 'unexpected_error' }
  return {
    errorCode: error.code,
    ...(error.diagnostic?.failureReason
      ? { failureReason: error.diagnostic.failureReason }
      : {}),
    ...(error.diagnostic?.httpStatus === undefined
      ? {}
      : { httpStatus: error.diagnostic.httpStatus }),
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
