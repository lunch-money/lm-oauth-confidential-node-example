# Security model

This example assumes the Node server is trusted with the OAuth client secret and credentials, the browser is untrusted, Lunch Money is reached over HTTPS in deployed environments, and the integrating application authenticates its own users in production.

The client secret, PKCE verifier, authorization-code exchange, access token, and optional refresh token remain server-side. `me:read` is always registered; `offline_access` is optional and must be chosen at client registration because scopes are immutable. Browser cookies contain only a signed opaque session locator and are `HttpOnly`, `SameSite=Lax`, path-scoped, and `Secure` when the registered callback uses HTTPS. Sensitive responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. A random CSRF token lives in server-side session state, is rendered only into same-session forms, and is compared in constant time before every state-changing POST, including `/refresh`. The callback GET uses OAuth state and session binding rather than a form token.

State binds a callback to a single stored authorization attempt. S256 PKCE binds the authorization code to its server-held verifier. The attempt also records the initiating stable application user, connection, opaque application browser session, and a five-minute illustrative expiry. Consumption always removes it; expired attempts, replayed callbacks, other users, and other browser sessions fail before exchange. Five minutes is local application policy, not a Lunch Money guarantee. `openid-client` performs callback and protocol validation; it cannot determine application ownership or session continuity, so those checks remain explicit application responsibilities.

## Credential ownership

Production must authenticate its user independently, derive the current browser-session identity on the server, bind both values before redirect, and use a stable internal `applicationUserId` for every read, replacement/refresh persistence, revocation, and deletion. Email and callback/form/query values are not authorization keys. The in-memory adapter is a teaching aid, not durable storage or a real tenant boundary. Supply encrypted durable storage, tenant isolation, key management, least-privilege access, atomic updates, retention rules, expiry cleanup, and cleanup for disconnect, account switching, sign-out, and account deletion.

## Refresh rotation and recovery

Lunch Money issues refresh tokens only when the immutable registered scopes include `offline_access`, and replaces the refresh token on every success. The sample permits only one in-flight refresh per owner/connection. Production needs distributed serialization across all workers. The replacement access token, refresh token, expiry, and scope metadata must be committed atomically; partial field updates can destroy recoverability.

`invalid_grant` is terminal here. It can represent expiry, revocation, replay, or an unknown token, and consumed-token replay revokes the grant family. The sample never retries it, removes the local set, and requires fresh authorization. Transient provider/network failures retain the current set for a later deliberate retry. A malformed success missing rotation metadata is also unrecoverable.

The dangerous sequence is: Lunch Money accepts and consumes the old refresh token, returns its replacement, then local persistence fails. The old token is no longer safe or usable, so the sample never restores or retries it. It best-effort deletes the old set, marks that connection as requiring reauthorization, and exposes only that safe outcome. The process-local marker is demonstration-only; production needs a durable failure state and operational recovery.

## Logging and errors

The sample logs only fixed event names for callback/start failures. It never logs exception text, provider bodies, codes, tokens, verifiers, secrets, or cookies. Browser errors are stable application messages. `/v2/me` JSON is recursively redacted before display. Do not add request/response logging without equivalent redaction and tests. There is intentionally no plaintext token logger or debug escape hatch.

## Deliberate omissions

Application login, distributed sessions/locks, durable encrypted transactional storage, background refresh policy, automatic replay recovery, rate limiting, production deployment, and operational monitoring are outside this teaching sample. The optional interactive refresh demonstrates rotation and terminal recovery, not production infrastructure. The included CSRF mechanism is intentionally compact; production must integrate tokens, rotation, session renewal, content-type/origin policy, and failure telemetry with its broader application security design. Revocation and local reset are separate: reset alone cannot invalidate a Lunch Money credential.

## Reporting vulnerabilities

No security-reporting owner or private contact is currently declared. That is a publication blocker. The owner must add a monitored private reporting path before publication; do not disclose live credentials or personal financial data in a public issue.
