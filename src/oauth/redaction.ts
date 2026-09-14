import type { SafeJson } from './types.js'

const SENSITIVE_KEY =
  /(?:access|refresh|id)?_?token|secret|authorization_?code|verifier|cookie/i

/** Recursively converts unknown provider data to JSON while redacting credential-shaped keys and known values. */
export function redactSensitiveValue(
  value: unknown,
  secrets: readonly string[],
): SafeJson | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return value
  if (typeof value === 'string') {
    return secrets.reduce(
      (result, secret) =>
        secret ? result.replaceAll(secret, '[redacted]') : result,
      value,
    )
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item, secrets) ?? null)
  }
  if (typeof value !== 'object') return undefined
  const result: Record<string, SafeJson> = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key)
      ? '[redacted]'
      : (redactSensitiveValue(item, secrets) ?? null)
  }
  return result
}
