# OAuth teaching core

This directory contains the complete framework-independent path. It imports no Hono, React, Vite, Tailwind, HTML, or cookie library; ESLint and `tests/oauth/boundary.test.ts` enforce that rule.

Recommended reading order:

1. `types.ts` defines the stable authenticated `ApplicationUserId`, server-derived `ApplicationSessionId`, optional `ConnectionId`, server-only attempt/credential values, and the narrow testable protocol client.
2. `configuration.ts` discovers Lunch Money through `openid-client` and adapts its authorization, callback exchange, refresh, and revocation APIs.
3. `authorization.ts` generates state/S256 PKCE through the adapter, gives the attempt an illustrative five-minute lifetime, and binds it to the already-authenticated application user plus initiating application session.
4. `callback.ts` consumes state once, requires the same user and application session, lets `openid-client` validate/exchange, and stores credentials under the pre-bound owner—not a browser or callback parameter.
5. `tokens.ts` defines `CredentialStore`; every operation requires `applicationUserId` and `connectionId`.
6. `lunch-money-api.ts` reads credentials server-side, calls `/v2/me`, and returns redacted JSON.
7. `refresh.ts` excludes concurrent work per owner/connection, rotates once, replaces the complete set atomically, and defines terminal recovery.
8. `revocation.ts` revokes the refresh token for an offline grant (or access token for access-only), verifies the old access token gets `401`, and removes local storage.
9. `redaction.ts` and `errors.ts` establish safe output boundaries.

`openid-client` handles discovery validation, cryptographic state/PKCE generation, authorization URL encoding, callback/state and token-response validation, confidential client authentication, code exchange, refresh-token grant, and revocation requests. It does not authenticate your application's user, store attempts, select owners, serialize refresh, atomically persist rotations, decide terminal recovery, enforce tenants, protect sessions, or redact telemetry.

The walkthrough always registers `me:read` and optionally registers `offline_access`. Scopes are immutable: enabling refresh later requires a replacement client and new authorization. Callback handling merely stores the optional field. `refresh.ts` is the separate lifecycle boundary and requires Lunch Money's replacement refresh token, expiry, and scope metadata before atomically replacing the whole set.

Lunch Money rotation makes persistence ordering security-critical. The old token is consumed at the provider before the local replacement can commit. On write failure, never restore or retry it; persist a reauthorization-required state. This sample's in-process coordinator demonstrates exclusion and poisoning but is not distributed or restart-safe. Real applications require durable encrypted transactional storage, tenant isolation, key management, lifecycle cleanup, and multi-instance coordination.

The essential ownership chain is:

```text
authenticated application user + server-derived application session
  -> finite, one-time server-side authorization attempt
  -> verified OAuth callback
  -> Lunch Money credential set
  -> CredentialStore[applicationUserId, connectionId]
```

Never substitute email, a callback query value, a form field, or any other browser-supplied user/session ID. The attempt store uses an injected clock, removes every consumed or expired attempt, and treats five minutes as illustrative application policy—not a Lunch Money protocol guarantee. The adapter in `src/scaffolding/session/` is clearly demonstration-only and provides neither authentication nor a production tenant boundary. Real applications need durable encrypted storage, tenant isolation, key management, atomic replacement, access control, expiry/lifecycle cleanup, and CSRF protection integrated with their own session design. No database schema is suggested here because those requirements are application-specific.

Tests mirror the reading path: `authorization.test.ts`, `openid-client.test.ts`, `callback.test.ts`, `credential-ownership.test.ts`, `refresh.test.ts`, `resource-and-revocation.test.ts`, and `boundary.test.ts`.
