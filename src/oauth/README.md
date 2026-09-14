# OAuth teaching core

This is the directory to study if you want to add Lunch Money OAuth to a server-side Node.js application. It contains the OAuth code that you should understand and adapt: starting authorization, validating the callback, storing credentials for the correct application user, calling Lunch Money, refreshing tokens, and revoking access. The code does not depend on a particular web framework, so it applies whether your Node.js server uses Hono, Express, Fastify, NestJS, or something else.

The rest of this repository makes the example runnable in a browser. [`src/scaffolding/`](../scaffolding/README.md) contains ordinary web-application plumbing such as HTTP routes, signed cookies, browser sessions, CSRF protection, in-memory storage, HTML, and CSS. This sample uses Hono with server-rendered HTML; it does not use React, Vite, or Tailwind. Replace that scaffolding with the equivalent pieces from your own application while keeping the OAuth responsibilities shown here.

ESLint and the [`src/oauth` boundary test](../../tests/oauth/boundary.test.ts) ensure this directory does not import Hono, React, Vite, Tailwind, HTML, or cookie libraries.

This sample uses [`openid-client`](https://github.com/panva/openid-client), the recommended and supported third-party Node.js library for working with Lunch Money's OAuth interfaces. Its [API reference](https://github.com/panva/openid-client/blob/main/docs/README.md) documents the library calls used here. `openid-client` handles OAuth discovery, state and PKCE generation, authorization URL encoding, callback and token-response validation, confidential client authentication, code exchange, refresh, and revocation. Your application is still responsible for authenticating its users, deciding who owns saved credentials, protecting browser sessions, coordinating refreshes, saving rotated tokens safely, handling failures, and keeping sensitive values out of logs and browser responses.

The [root README walkthrough](../../README.md#run-the-sample-with-your-oauth-client) shows how to register a client and exercise the sample. It always uses `me:read`; add `offline_access` during registration if you also want to try refresh. Lunch Money client scopes are fixed after registration, so enabling refresh later requires a replacement client and a new authorization.

## Recommended reading order

1. [`types.ts`](types.ts) defines the application user, browser session, connection, authorization attempt, credential, and protocol types.
2. [`configuration.ts`](configuration.ts) configures `openid-client` for Lunch Money and adapts its authorization, callback, refresh, and revocation APIs.
3. [`authorization.ts`](authorization.ts) creates state and S256 PKCE values, gives the attempt an illustrative five-minute lifetime, and remembers which application user and browser session started it.
4. [`callback.ts`](callback.ts) uses the stored attempt once, requires the same user and browser session, lets `openid-client` validate and exchange the code, and saves credentials for the user who started the flow—not an identity supplied by the browser or callback.
5. [`tokens.ts`](tokens.ts) defines `CredentialStore`; every operation identifies both the application user and Lunch Money connection.
6. [`lunch-money-api.ts`](lunch-money-api.ts) reads the access token on the server, calls `/v2/me`, and prepares a safe response for display.
7. [`refresh.ts`](refresh.ts) ensures that only one refresh runs for the same saved connection at a time. It saves the new access token, replacement refresh token, expiration, and scopes together; if that cannot be done safely, it requires the user to authorize again.
8. [`revocation.ts`](revocation.ts) revokes the refresh token when one exists, which revokes the whole grant. For an access-only connection, it revokes the access token. It then confirms the old access token receives `401` before deleting the local credential.
9. [`errors.ts`](errors.ts) keeps provider error details out of browser-visible results.

The `/v2/me` response is not passed through a general-purpose redactor. [`lunch-money-api.ts`](lunch-money-api.ts) strictly validates the documented `userObject` fields and rejects malformed responses or unexpected properties before anything is displayed.

## Refresh-token replacement in plain language

Lunch Money gives the application a new refresh token each time refresh succeeds, and the token just used stops working. The application therefore has to save the new access token and new refresh token together. If Lunch Money issued the new tokens but the application failed to save them, retrying the old refresh token would be unsafe and would not recover the connection. The sample stops and asks the user to authorize again. Its in-memory coordination is useful for demonstrating that rule, but a real application needs encrypted durable storage and coordination shared by all of its servers.

## How credentials stay associated with the right user

Before redirecting to Lunch Money, the sample remembers which signed-in application user started authorization, which Lunch Money connection they are creating, and which browser session made the request. Here, “browser session” means the random opaque session identifier created by the server and referenced by its signed cookie; it is not a user ID submitted by the browser. When the callback returns, the sample accepts it only in that same browser session and uses the saved one-time attempt to decide where the credentials belong. Callback query parameters and form fields never choose the credential owner.

The runnable sample uses a fixed demo user and keeps attempts, browser sessions, credentials, and refresh coordination in memory. An authorization attempt expires after five minutes and is removed the first time a callback tries to use it. The five-minute limit applies only to the sample's temporary authorization request, not to Lunch Money tokens. Store credentials under an application-specific ID that identifies the user without using an email address or other personally identifiable information, and never trust an ID supplied by the browser. A real application must also provide encrypted durable storage, isolation between users, safe key management, reliable token replacement, cleanup for expired or disconnected accounts, and CSRF protection that fits its session system. This sample intentionally does not suggest a database schema because those choices depend on the application.

The tests follow the same path: [`authorization.test.ts`](../../tests/oauth/authorization.test.ts), [`openid-client.test.ts`](../../tests/oauth/openid-client.test.ts), [`callback.test.ts`](../../tests/oauth/callback.test.ts), [`credential-ownership.test.ts`](../../tests/oauth/credential-ownership.test.ts), [`refresh.test.ts`](../../tests/oauth/refresh.test.ts), [`resource-and-revocation.test.ts`](../../tests/oauth/resource-and-revocation.test.ts), and [`boundary.test.ts`](../../tests/oauth/boundary.test.ts).
