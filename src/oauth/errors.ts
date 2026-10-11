/** Failure categories the application can handle without exposing credentials or Lunch Money response bodies. */
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
    'http_error' | 'invalid_json' | 'invalid_response' | 'network_error'
  readonly httpStatus?: number
}

/** An OAuth failure with a message safe to show in the sample and an optional server-only cause. */
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

/** Returns only the error code, failure reason, and HTTP status for safe server logging. */
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

/** Describes why refresh failed without passing Lunch Money's response body to the browser. */
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
