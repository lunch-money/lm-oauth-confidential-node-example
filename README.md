# Lunch Money confidential OAuth example for Node.js

This repository is a focused reference for developers building a **confidential, server-side web client** in Node.js and TypeScript. It demonstrates one walkthrough end to end: register a Lunch Money OAuth client, authorize it with state and S256 PKCE, call `GET /v2/me`, optionally rotate tokens, revoke access, verify that the old access token fails, and reset the local demonstration.

The browser never receives the client secret, PKCE verifier, authorization code exchange, access token, or refresh token. Register `me:read` for the minimal path; optionally register `offline_access` at the same time to enable the refresh step. [`openid-client`](https://github.com/panva/openid-client) is the recommended and supported third-party Node.js library for working with Lunch Money's OAuth interfaces; its [API reference](https://github.com/panva/openid-client/blob/main/docs/README.md) documents the library itself. The small integration developers should study is in [`src/oauth/`](src/oauth/README.md); Hono and the interface are replaceable scaffolding.

> This is a teaching sample, not a production-ready application. Its fixed demo user and in-memory stores provide neither real authentication nor durable multi-user isolation. It does demonstrate browser-session binding, finite one-time attempts, and CSRF-protected forms.

## Is this the right sample for my application?

Use this confidential-client sample when:

- your application has a backend server you control;
- that server can keep a client secret and OAuth credentials away from browsers and installed applications;
- the server performs the OAuth code exchange and Lunch Money API calls; and
- your application has, or will have, its own server-side user authentication.

Use a native/public-client sample instead when:

- your application is installed directly on a phone or computer;
- there is no trusted application server that can hold a client secret;
- credentials must be stored with platform facilities such as Keychain or Android Keystore; and
- the installed application performs OAuth with PKCE and without a client secret.

A responsive interface does not determine the OAuth client type. A responsive web application backed by a trusted server can be a confidential client. A browser-only single-page application cannot safely contain a client secret.

> [!NOTE]
> You can install, build, test, and study this repository without Lunch Money OAuth access. The automated tests use mocked Lunch Money responses. Completing the real walkthrough requires a registered OAuth client and the API base URL supplied with access.

## Run the sample with your OAuth client

[`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md) is the canonical first-run guide. It walks through registering a confidential client, configuring the sample, authorizing a real Lunch Money budgeting account, calling `/v2/me`, optionally testing refresh, revoking access, and starting again.

Begin by cloning and building the sample:

```sh
git clone https://github.com/lunch-money/lm-oauth-confidential-node-example.git
cd lm-oauth-confidential-node-example
npm ci
npm run build
```

Use Node.js 20 or newer and npm 11.6.2. Then continue with [Register a confidential client](docs/WALKTHROUGH.md#2-register-a-confidential-client). Keep the sample local: it has a fixed demo identity and stores sessions and credentials only in memory.

## How credentials stay with the right application user

Before redirecting to Lunch Money, an application must remember which signed-in application user started the connection and which browser session made the request. When Lunch Money redirects back, the callback must match both saved values. The application then stores the credentials for that user and connection; callback parameters and form fields never decide who owns them.

The sample represents its one application user as `local-demo-user`. A real application replaces it with an application-specific ID obtained from its authenticated server-side session. That ID should not be an email address or other personally identifiable information.

Each authorization attempt works once and expires after five minutes. That duration is a choice made by this sample, not a Lunch Money token lifetime. The [`CredentialStore`](src/oauth/tokens.ts) shows where an application supplies secure credential storage. The included implementation keeps everything in memory; production applications need encrypted durable storage, strict separation between users, safe key management, reliable complete-token updates, and lifecycle cleanup.

## What `openid-client` does—and does not do

It handles the OAuth protocol details: discovering Lunch Money's OAuth endpoints, creating state and PKCE values, building the authorization URL, checking the callback, exchanging the code, refreshing credentials, and revoking them.

Your application still has to authenticate its users, remember who started each connection, protect browser sessions and forms, save credentials for the right user, prevent two refreshes from using the same token at once, save replacement tokens together, and keep secrets out of browser responses and logs. The deeper responsibilities are documented in [SECURITY.md](SECURITY.md) and [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).

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
9. [`errors.ts`](src/oauth/errors.ts) — safe browser and log errors.

The executable documentation is in [`tests/oauth/`](tests/oauth/). Framework, cookies, sessions, pages, and startup live in [`src/scaffolding/`](src/scaffolding/README.md).

## Non-goals and intentionally omitted behavior

There is no native/Expo flow, backend-assisted mobile handoff, generic API explorer, production deployment recipe, application login, persistent database, background refresh scheduler, or token logger. Refresh is an optional step in the same walkthrough, not a second application. The in-memory store and coordinator demonstrate the safety contract but are not durable, encrypted, transactional, distributed, restart-safe, multi-instance-safe, or a production tenant boundary.

## Validation and production adaptation

Run `npm run check` for formatting, lint, typechecking, tests, and a production TypeScript build. Also see [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).

Public materials: [Lunch Money developer getting started](https://lunchmoney.dev/getting-started) and the [v2 API overview](https://lunchmoney.dev/v2/overview). OAuth registration, API base URL, and issuer details must come from the Lunch Money environment where your client is registered.

## Get help

For questions about this sample or Lunch Money's developer platform, email [dev-support@lunchmoney.app](mailto:dev-support@lunchmoney.app) or ask in the [developers channel on Discord](https://discord.com/channels/842337014556262411/1134594318414389258). [Join the Lunch Money Discord](https://lunchmoney.app/discord) if you are not already a member.

Send potential security concerns privately to [dev-support@lunchmoney.app](mailto:dev-support@lunchmoney.app), not to Discord or a public GitHub issue. Never include live credentials or personal financial data in a report.

This project is maintained by Lunch Money and licensed under the [MIT License](LICENSE).
