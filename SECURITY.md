# Security model

This example assumes the Node server is trusted with the OAuth client secret and credentials, the browser is untrusted, Lunch Money is reached over HTTPS in deployed environments, and the integrating application authenticates its own users in production.

The client secret, PKCE verifier, authorization-code exchange, access token, and optional refresh token remain server-side. `me:read` is always registered; `offline_access` is optional and must be chosen when registering the client because authorization cannot change the registered scopes. Browser cookies contain only a signed random ID that looks up session data on the server. They are `HttpOnly`, `SameSite=Lax`, path-scoped, and `Secure` when the registered callback uses HTTPS. Sensitive responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. A random CSRF token lives in server-side session state, is rendered only into forms for that session, and is compared in constant time before every state-changing POST, including `/refresh`. The callback GET uses OAuth state and the same browser session rather than a form token.

State ties a callback to one stored authorization attempt. S256 PKCE proves that the server exchanging the code holds the private verifier created when authorization started. The attempt records the stable application user, random browser-session ID, and a five-minute sample expiry. After exchange, a complete `/v2/me` response identifies the selected Lunch Money user and budget. Reading an attempt always removes it; expired attempts, copied callbacks, other users, and other browser sessions fail before exchange. Five minutes is a choice made by this sample, not a Lunch Money guarantee. [`openid-client`](https://github.com/panva/openid-client) performs callback and OAuth protocol validation, but it cannot know which application user started the request or whether the same browser returned, so the application performs those checks. See its [API reference](https://github.com/panva/openid-client/blob/main/docs/README.md) for the library's interfaces.

## Credential ownership

Production must sign in its own user, read the current browser-session ID from trusted server state, save both values before redirecting, and use a stable internal `applicationUserId` whenever it reads, replaces, revokes, or deletes credentials. Email and values submitted by the browser are not safe ownership keys. The in-memory store is a teaching aid: it loses data on restart, does not encrypt values, and cannot prevent another server process from seeing different state. Production storage must keep each user's credentials separate, encrypt them, restrict access, replace complete token sets together, manage encryption keys, and remove credentials when access ends.

## Refresh rotation and recovery

Lunch Money issues refresh tokens only when the client was registered with `offline_access`; authorization cannot change that registered choice. Each successful refresh returns a replacement refresh token, so the sample allows only one refresh at a time for a saved connection. If an application runs more than one server process, those processes must also coordinate so they do not try to use the same refresh token at once. Save the new access token, refresh token, expiration, and scopes in one operation. Updating only some of them can leave a set that no longer works.

`invalid_grant` is terminal here. It can represent expiry, revocation, replay, or an unknown token, and consumed-token replay revokes the grant family. The sample never retries it, removes the local set, and requires fresh authorization. Transient provider/network failures retain the current set for a later deliberate retry. A malformed success missing rotation metadata is also unrecoverable.

One difficult failure can happen after Lunch Money accepts the old refresh token and returns a replacement, but before the application saves the new values. The old token has already been used, so the sample never restores or retries it. It tries to delete the old values and marks the connection as requiring authorization again. That marker exists only in this running Node process; a production application must save this state so it survives a restart and give operators a way to investigate it without exposing credentials.

## Logging and errors

The sample logs only fixed event names and a few explicitly chosen diagnostic fields for callback/start failures. It never logs exception text, Lunch Money response bodies, authorization codes, tokens, verifiers, secrets, or cookies. Browser errors use fixed application messages. A successful `/v2/me` response must contain every documented profile property, and the page displays only the fields it names. Do not add request or response logging unless the exact safe fields are listed and tested. There is intentionally no plaintext token logger or debug escape hatch.

## Deliberate omissions

Application login, distributed sessions/locks, durable encrypted transactional storage, background refresh policy, automatic replay recovery, rate limiting, production deployment, and operational monitoring are outside this teaching sample. The optional interactive refresh demonstrates rotation and terminal recovery, not production infrastructure. The included CSRF mechanism is intentionally compact; production must integrate tokens, rotation, session renewal, content-type/origin policy, and failure telemetry with its broader application security design. Revocation and local reset are separate: reset alone cannot invalidate a Lunch Money credential.

## Reporting vulnerabilities

Report potential security concerns privately to [dev-support@lunchmoney.app](mailto:dev-support@lunchmoney.app). Do not post vulnerabilities in Discord or a public GitHub issue, and never include live credentials or personal financial data in a report.
