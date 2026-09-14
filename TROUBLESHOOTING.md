# Troubleshooting

The sample intentionally returns short errors and does not print upstream bodies because those may contain credentials or sensitive context.

## Startup configuration fails

Confirm `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, and `LUNCH_MONEY_API_BASE_URL` are present in the process environment. The local sample generates a cookie-signing secret when `SESSION_SECRET` is omitted; if you set it explicitly, it must contain at least 32 characters. Inspect or change your secret configuration yourself; do not paste it into an issue or log.

## Discovery or network failure

Use the issuer exactly as documented in the Lunch Money Developer Portal. It must expose authorization-server metadata and be reachable by Node. Do not substitute a private repository or undocumented local service. Check proxy/TLS settings without logging credentials.

For the published preview walkthrough, set `LUNCH_MONEY_API_BASE_URL` to `https://api-alpha.lunchmoney.dev/`. The sample requires HTTPS for this remote service origin.

## Redirect URI mismatch

The registered URI and `OAUTH_REDIRECT_URI` must match exactly, including scheme, hostname, port, path, and trailing slash. The default is `http://localhost:4002/oauth/callback`.

## State or callback verification fails

State is single-use and stored in memory with the initiating application session. A second callback, a changed browser/session cookie, an attempt at or beyond the sample's illustrative five-minute expiry, a lost process, or a server restart cannot complete it. Start again. Never bypass state, session, or expiry validation; five minutes is sample policy, not a Lunch Money guarantee.

## A form returns `Invalid CSRF token`

Reload the home page and submit the newly rendered form in the same browser session. A development-server restart is a common cause: it clears the in-memory browser session while an older page may remain open. Simply leaving an unchanged running sample open does not expire the form token. Missing, stale, changed, or cross-session tokens are rejected on every POST action. The OAuth callback GET does not use the form token.

## PKCE or `invalid_grant`

Authorization codes are short-lived and single-use, and each attempt has its own verifier. Restart the flow rather than retrying an old callback. Verify the callback reaches the same server-side attempt store. Do not print the code or verifier.

## `invalid_client`

Confirm the client ID/secret belong to the same confidential client and that the current registration supports the authentication method advertised by Lunch Money. Inspect the secret locally; do not log or share it.

## Authorization denied or cancelled

The user can decline consent. Return to the home page and choose Connect again when ready. A denial does not create or replace credentials.

## Missing `me:read`

Add `me:read` to the client's immutable registered scope set in the Developer Portal. Do not add a `scope` query parameter: Lunch Money applies the registered set.

## Expired or rejected access token

If you registered `offline_access`, use **Refresh access token**. Otherwise reauthorize, or replace the immutable-scope client registration with one that includes `me:read` and `offline_access` and authorize that replacement. Do not add `scope` to the authorization URL.

## Refresh says authorization is required

Refresh returned terminal `invalid_grant`, returned an incomplete rotated response, or Lunch Money rotated successfully but the sample could not persist the replacement. The old refresh token must not be retried: it may already be consumed, and replay can revoke the entire grant family. Choose **Connect Lunch Money** to perform a fresh authorization.

## Refresh is temporarily unavailable or already in progress

A provider/network error retains the current set for a later deliberate retry. An in-progress result means this connection already has a refresh call running; wait for it rather than starting another. Production needs distributed per-connection serialization, retry limits/backoff for transient errors, and safe telemetry. Never log token requests or responses.

## Revocation verification does not return 401

The sample intentionally retains the local credential and reports that verification failed. Confirm issuer metadata and endpoint behavior, allow for any documented propagation behavior, and consult Lunch Money support. Do not weaken verification or display the old token.

## Restart cleared the connection

Expected: all stores are in memory. Production needs durable encrypted credentials, shared attempt/session state, tenant isolation, key management, and lifecycle cleanup.
