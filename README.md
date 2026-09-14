# Lunch Money confidential OAuth example for Node.js

This repository is a focused reference for developers building a **confidential, server-side web client** in Node.js and TypeScript. It demonstrates one walkthrough end to end: register a Lunch Money OAuth client, authorize it with state and S256 PKCE, call `GET /v2/me`, optionally rotate tokens, revoke access, verify that the old access token fails, and reset the local demonstration.

The browser never receives the client secret, PKCE verifier, authorization code exchange, access token, or refresh token. Register `me:read` for the minimal path; optionally register `offline_access` at the same time to enable the refresh step. [`openid-client`](https://github.com/panva/openid-client) performs discovery and the security-sensitive protocol operations. The small integration developers should study is in [`src/oauth/`](src/oauth/README.md); Hono and the interface are replaceable scaffolding.

> This is a teaching sample, not a production-ready application. Its fixed demo user and in-memory stores provide neither real authentication nor durable multi-user isolation. It does demonstrate browser-session binding, finite one-time attempts, and CSRF-protected forms.

## Run the sample with your OAuth client

Follow this path to authorize a real confidential OAuth client, call the real Lunch Money API, and revoke access before studying the implementation.

### 1. Clone the repository

```sh
git clone https://github.com/lunch-money/lm-oauth-confidential-node-example.git
cd lm-oauth-confidential-node-example
```

### 2. Install dependencies

Use Node.js 20 or newer and npm 11.6.2.

```sh
npm ci
```

### 3. Register the OAuth client

In the Lunch Money Developer Portal, create a **Confidential web client** with:

- the exact redirect URI `http://localhost:4002/oauth/callback`;
- the `me:read` scope;
- optionally `offline_access` if you want to run the refresh step; and
- a client secret that you retain securely when Lunch Money shows it. The secret is shown only once.

Lunch Money assigns an immutable registered scope set. The sample deliberately omits `scope` from its authorization request. Decide whether this client needs `offline_access` before registration: adding it later requires a replacement client registration and new authorization, not an authorization-URL change.

While the client is in development, the same Lunch Money user who created it must perform the authorization. Other Lunch Money users cannot authorize the client until Lunch Money approves it.

### 4. Configure the local process

Set the following values in the local process environment. Replace every placeholder with the corresponding public value or credential:

```sh
export OAUTH_CLIENT_ID='YOUR_CLIENT_ID'
export OAUTH_CLIENT_SECRET='YOUR_CLIENT_SECRET'
export OAUTH_REDIRECT_URI='http://localhost:4002/oauth/callback'
export LUNCH_MONEY_API_BASE_URL='https://api-alpha.lunchmoney.dev/'
```

For this preview, the sample uses `LUNCH_MONEY_API_BASE_URL` for OAuth discovery, token operations, and Lunch Money API requests. Use the value above to match the API environment used by the Developer Portal. `PORT` is optional and defaults to `4002`.

For this local-only sample, omitting `SESSION_SECRET` generates a fresh random cookie-signing secret each time the process starts. Restarting already clears all in-memory sessions, attempts, and credentials. A production application must instead provide its own strong `SESSION_SECRET` and keep it stable across restarts; do not rotate it for each authorization.

Keep the client secret in a private local shell session or an untracked secret manager. Never paste credentials into AI chats or prompts, documentation, screenshots, browser code, committed files, or commands retained in shared shell history.

### 5. Start the sample

```sh
npm run dev
```

Open `http://localhost:4002`.

If a form returns **Invalid CSRF token**, reload the home page and try again. This commonly happens when the development server restarts and clears its in-memory browser session while an older page remains open; leaving an unchanged running sample open does not expire the form token. See [Troubleshooting](TROUBLESHOOTING.md#a-form-returns-invalid-csrf-token) for details.

### 6. Complete the real flow

> **This is a real OAuth flow.** The OAuth client, Lunch Money user, selected budgeting account, authorization, tokens, API calls, and revocation are real. Only the automated tests mock Lunch Money HTTP responses. The running sample connects to the real Lunch Money services you configured above.

1. Choose **Connect Lunch Money**.
2. Sign into Lunch Money as the real user who owns the development client.
3. Select one of that user's real budgeting accounts and approve access. The browser returns to `http://localhost:4002/oauth/callback`.
4. Choose **Call /v2/me**. The server calls the real `GET /v2/me` endpoint, and the page shows sanitized API data without exposing the OAuth credential in its HTML.
5. If you registered `offline_access`, choose **Refresh access token**. The server uses the server-held refresh token, receives rotated access and refresh tokens, and atomically replaces the complete credential set. The browser sees only a safe outcome. Without `offline_access`, this action is absent.
6. Choose **Revoke and verify**. For an offline grant the server revokes the refresh token (revoking the grant); otherwise it revokes the access token. It then retries `GET /v2/me` with the old access token, requires a `401`, and deletes the local credential.
7. Use **Local reset only** when you only want to clear the sample's local credential and browser session. It does **not** revoke access at Lunch Money. Revoke first when you intend to end that access.

Lunch Money rotates the refresh token on every successful refresh. If refresh returns `invalid_grant`, the sample does not retry: the token may be expired, revoked, already consumed, or invalid, and replay can invalidate the grant family. It discards local credentials and requires authorization again. If Lunch Money rotates successfully but saving the replacement fails, the old refresh token is already consumed; the sample never restores or retries it and requires authorization again.

The sample is single-user. Internally, it stores credentials under a fixed local identifier named `local-demo-user`. This replaces only the login and user database that your own application would normally provide; it does not mock the Lunch Money user, OAuth client, authorization, tokens, or API requests.

A real multi-user confidential application must replace `local-demo-user` with the stable user ID from its authenticated server-side session and associate every saved Lunch Money connection with that application user. This walkthrough demonstrates one application user with one Lunch Money connection.

Lunch Money redirects your browser to `localhost`; its remote server does not connect directly to your computer. This walkthrough therefore needs no deployment, public callback server, or ngrok tunnel.

> **Keep this sample local.** Its fixed application identity and in-memory stores are not safe for public deployment. Restarting the process clears its in-memory sessions, authorization attempts, and credentials. Review [SECURITY.md](SECURITY.md) and [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) before adapting it. If a step differs from the expected flow, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

After completing the flow, continue with the credential-ownership explanation and code-reading order below.

## Credential ownership is an application boundary

A production application must authenticate its own user first and bind the authorization attempt to both that stable server-side identity and the initiating application browser session. This sample records opaque `applicationUserId`, `connectionId`, and server-derived `applicationSessionId` values before redirect. Callback completion requires the same user and session; none may come from callback parameters or form input. Verified credentials are stored under the stable user and connection. Never use email or another browser-submitted ID as the owner.

Authorization attempts are single-use and expire after an illustrative five minutes. The in-memory store deletes an attempt whenever callback consumption is tried, including when it has expired. Five minutes is sample application policy, not a Lunch Money protocol or token-lifetime guarantee.

The [`CredentialStore`](src/oauth/tokens.ts) API makes this dependency visible. The included adapter is only an in-memory demonstration. Real applications need durable encrypted storage, tenant isolation, key management, atomic writes, access controls, and cleanup on disconnect, sign-out/account switching, and account deletion. This repository intentionally offers no toy database schema as production advice.

## What `openid-client` does—and does not do

It discovers and validates authorization-server metadata, generates standards-compliant random state/PKCE material, builds the authorization URL, validates the authorization response and expected state, exchanges the code, performs the refresh-token grant with confidential client authentication, validates token responses, and performs token revocation.

Your application remains responsible for authenticating its user, deriving trustworthy user/session identities, choosing and enforcing attempt lifetime, exact redirect registration, omitting Lunch Money's authorization-time scope, storing credentials under the correct tenant, serializing refresh per connection, atomically persisting rotations, handling terminal recovery, deciding when to call APIs/revoke/reset, protecting sessions and POST actions, redacting telemetry, and presenting safe errors. The runnable Hono forms include a random per-session CSRF token stored server-side and checked in constant time on `/oauth/start`, `/me`, `/refresh`, `/revoke`, and `/reset`; production must integrate equivalent protection with its own session architecture.

## Code map and reading order

Read [`src/oauth/README.md`](src/oauth/README.md), then these files in order:

1. [`types.ts`](src/oauth/types.ts) — identity, attempt, credential, and protocol types.
2. [`configuration.ts`](src/oauth/configuration.ts) — discovery and the `openid-client` adapter.
3. [`authorization.ts`](src/oauth/authorization.ts) — state/PKCE start, finite lifetime, and user/session binding.
4. [`callback.ts`](src/oauth/callback.ts) — one-time callback consumption, user/session validation, code exchange, and credential ownership.
5. [`tokens.ts`](src/oauth/tokens.ts) — the replaceable `CredentialStore` boundary.
6. [`lunch-money-api.ts`](src/oauth/lunch-money-api.ts) — the server-side `/v2/me` request.
7. [`refresh.ts`](src/oauth/refresh.ts) — per-connection refresh, atomic rotation persistence, and recovery.
8. [`revocation.ts`](src/oauth/revocation.ts) — grant-aware revoke, verify, then delete.
9. [`redaction.ts`](src/oauth/redaction.ts) and [`errors.ts`](src/oauth/errors.ts) — browser/log safety.

The executable documentation is in [`tests/oauth/`](tests/oauth/). Framework, cookies, sessions, pages, and startup live in [`src/scaffolding/`](src/scaffolding/README.md).

## Non-goals and intentionally omitted behavior

There is no native/Expo flow, backend-assisted mobile handoff, generic API explorer, production deployment recipe, application login, persistent database, background refresh scheduler, or token logger. Refresh is an optional step in the same walkthrough, not a second application. The in-memory store and coordinator demonstrate the safety contract but are not durable, encrypted, transactional, distributed, restart-safe, multi-instance-safe, or a production tenant boundary.

## Validation and production adaptation

Run `npm run check` for formatting, lint, typechecking, tests, and a production TypeScript build. Also see [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).

Public materials: [Lunch Money developer getting started](https://lunchmoney.dev/getting-started), [v2 API overview](https://lunchmoney.dev/v2/overview), and [interactive v2 API reference](https://alpha.lunchmoney.dev/v2/docs). OAuth registration/issuer details must come from the current Developer Portal while the OAuth program is in preview.

## Project, support, license, and provenance

- Status: public Lunch Money developer reference.
- Maintainer and dependency-update owner: **publication blocker—must be named by the repository owner**.
- Support and security-reporting channel: **publication blocker—must be selected by the repository owner**.
- License: [MIT](LICENSE), copyright 2026 Lunch Money.
- Provenance: curated from the confidential server/web portions of `lunch-money-oauth-demo` at source commit `100e6aaaa7130250c76891cfef86691f53971892`; old Git history and the plaintext token logger were intentionally not copied.
- Repository: [github.com/lunch-money/lm-oauth-confidential-node-example](https://github.com/lunch-money/lm-oauth-confidential-node-example).
