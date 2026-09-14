# Architecture

The sample separates the OAuth concepts developers must understand from runnable Hono scaffolding.

```text
authenticated application user (fixed demo identity here)
  + server-derived opaque application browser session
  -> server-side authorization attempt {user, connection, session, state, PKCE verifier, expiry}
  -> Lunch Money authorization and verified callback
  -> CredentialStore[applicationUserId, connectionId]
  -> server-side GET /v2/me, optional refresh, or revocation
```

```text
Browser                         Node server                         Lunch Money
  | POST /oauth/start + CSRF token |                                    |
  |-------------------------------->| verify CSRF; bind user+session;     |
  |                                 | store state+PKCE with 5m expiry     |
  |<------ 302 authorization URL ---|                                    |
  |---------------- login/consent -------------------------------------->|
  |<---------------- callback with code+state ---------------------------|
  | GET /oauth/callback             |                                    |
  |-------------------------------->| consume once; require same session; |
  |                                 | reject expiry; validate+exchange    |
  |                                 |----------------------------------->|
  |                                 | store credential under bound owner  |
  | POST /me                        | GET /v2/me with server-held token    |
  |-------------------------------->|----------------------------------->|
  |<-------------- validated profile |                                    |
  | POST /refresh (optional)        | serialize; rotate complete set      |
  |-------------------------------->|----------------------------------->|
  | POST /revoke                    | revoke; retry /v2/me; require 401    |
  |-------------------------------->|----------------------------------->|
```

`src/oauth/` knows nothing about Hono, HTML, CSS, cookies, or UI. `src/scaffolding/` adapts those concerns. ESLint plus a source-boundary test enforce the direction of dependency.

[`openid-client`](https://github.com/panva/openid-client) is the recommended and supported third-party Node.js library for Lunch Money OAuth. It owns discovery, standards-compliant state and S256 PKCE generation, authorization URL construction, callback/state validation, authorization-code and refresh-token grants, token-response validation, confidential client authentication, and revocation protocol calls. The application owns user login, session identity, attempt lifetime, immutable-scope registration, ownership, CSRF, per-connection refresh coordination, safe replacement of rotated credentials, failure recovery, API response validation, and lifecycle decisions. See the library's [API reference](https://github.com/panva/openid-client/blob/main/docs/README.md) for its own interfaces.

The fixed `local-demo-user` keeps the example runnable but is not authentication or multi-user isolation. The sample additionally binds each attempt to the opaque signed-cookie session that initiated it, expires it after an illustrative five minutes, consumes it once, and protects all form POSTs with a random server-side session CSRF token using constant-time comparison. Production must bind attempts and credentials to its real, stable authenticated `applicationUserId` and server-derived session identity, never email or browser/callback IDs. Its store must provide durable encrypted storage, tenant isolation, key management, atomic replacement, and lifecycle cleanup. No production schema is prescribed here.

Refresh lives in `src/oauth/refresh.ts`, separate from callback processing. It loads by stable owner and connection inside a per-connection critical section, requires a refresh token, calls the adapter once, and replaces access token, rotated refresh token, expiry, and scope together. `invalid_grant` is terminal and deliberately indistinguishable across expiry, revocation, replay, and unknown-token cases. If rotation succeeds but persistence fails, the old token is consumed; the connection is marked for reauthorization and is never retried.

The in-memory attempts, sessions, credentials, and refresh coordinator disappear on restart and are not shared across processes. They are neither durable/encrypted nor transactional/distributed/multi-instance safe. See [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) before adapting the sample.
