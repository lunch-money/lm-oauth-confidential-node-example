# Try Lunch Money OAuth with the confidential Node.js sample

Use this walkthrough to authorize a real Lunch Money OAuth client, call the Lunch Money API, optionally refresh its credentials, revoke access, and repeat the flow. The sample is a confidential, server-side web client built with Node.js and TypeScript.

[`openid-client`](https://github.com/panva/openid-client) is the recommended and supported third-party Node.js library for working with Lunch Money's OAuth interfaces. The sample uses it for discovery, authorization, callback validation, token exchange, refresh, and revocation while keeping every credential on the server.

> [!IMPORTANT]
> This is a real OAuth flow. You will create a real client, authorize access to a real Lunch Money budgeting account, receive real credentials, and call the real Lunch Money API. Only the automated tests use mocked Lunch Money responses.

## Before you begin

You need:

- a Lunch Money account;
- Node.js 20 or newer;
- npm 11.6.2; and
- Git.

While a client is in development, only the Lunch Money user who created it can authorize it. Use that same Lunch Money user when the sample sends you through authorization.

Most confidential web applications also have their own users and login system. To keep this sample focused on Lunch Money OAuth, it uses a fixed application user named `local-demo-user`. That value stands in for the application-specific user ID that a production application would obtain from its own authentication system. It does not replace or simulate your Lunch Money user.

## 1. Download and install the sample

```sh
git clone https://github.com/lunch-money/lm-oauth-confidential-node-example.git
cd lm-oauth-confidential-node-example
npm ci
```

## 2. Register a confidential client

In the Lunch Money Developer Portal, create a **Confidential web client** with:

- the exact redirect URI `http://localhost:4002/oauth/callback`;
- the required `me:read` scope;
- optionally, `offline_access` if you also want to exercise refresh; and
- a client secret that you save securely when Lunch Money displays it.

Lunch Money uses the complete scope set registered for the client. The sample therefore does not send a `scope` parameter during authorization.

Registered scopes cannot be changed. Decide whether you want to test refresh before creating the client: adding `offline_access` later requires a replacement client registered with both `me:read` and `offline_access`, followed by a new authorization.

You do not need `offline_access` to authorize the client, call `/v2/me`, revoke access, or authorize again.

## 3. Configure the local process

In the same terminal, set the client ID and secret from the Developer Portal:

```sh
export OAUTH_CLIENT_ID='YOUR_CLIENT_ID'
export OAUTH_CLIENT_SECRET='YOUR_CLIENT_SECRET'
export OAUTH_REDIRECT_URI='http://localhost:4002/oauth/callback'
export LUNCH_MONEY_API_BASE_URL='https://api-alpha.lunchmoney.dev/'
```

The sample uses `LUNCH_MONEY_API_BASE_URL` for OAuth discovery, token operations, and Lunch Money API requests. Use the value above to match the preview environment used by the Developer Portal. `PORT` is optional and defaults to `4002`.

`SESSION_SECRET` is also optional for this local sample. If it is absent, the process creates a new random cookie-signing secret when it starts. Restarting already clears every in-memory browser session, authorization attempt, and credential. A production application must instead provide a strong signing secret that remains stable across restarts.

> [!WARNING]
> Keep the client secret in a private local environment or secret manager. Never put it in browser code, committed files, documentation, screenshots, logs, support requests, AI chats, or prompts.

## 4. Start the sample

```sh
npm run dev
```

Open [http://localhost:4002](http://localhost:4002) in your browser.

If a form reports **Invalid CSRF token**, reload the page and try again. This usually means the development server restarted and cleared its in-memory browser session while an older page remained open.

## 5. Authorize and call `/v2/me`

1. Choose **Connect Lunch Money**.
2. Sign into Lunch Money as the user who created the development client.
3. Select one of that user's budgeting accounts and approve access.
4. After the browser returns to `http://localhost:4002/oauth/callback`, choose **Call /v2/me**.

The sample calls `GET /v2/me` from its Node.js server using the server-held access token. It validates the response against the documented `userObject` schema and displays the returned profile fields. The access token is never sent to the browser.

Open Lunch Money's [Connected Apps](https://my.lunchmoney.app/connected-apps) page in another tab. The client you just authorized should appear there.

## 6. Optionally refresh access

If you registered the client with `offline_access`, choose **Refresh access token**, then choose **Call /v2/me** again.

Lunch Money replaces both the access token and refresh token after a successful refresh. The sample stores the complete replacement credential set on the server before reporting success. Calling `/v2/me` again confirms that it is using the replacement access token.

If you registered only `me:read`, Lunch Money does not issue a refresh token and the refresh button does not appear. Skip this step.

The sample allows an immediate refresh so you can observe the flow. A production application normally decides when to refresh using expiration information from the token response or after an API authentication failure.

## 7. Revoke and verify access

Choose **Revoke and verify**.

- If the connection has a refresh token, the sample revokes it to revoke the entire grant.
- If the connection has only an access token, the sample revokes that access token.

The sample then calls `/v2/me` with the old access token, requires Lunch Money to return `401`, and deletes its locally stored credential. This verification demonstrates that the old access token no longer works.

To repeat the flow, choose **Connect Lunch Money** and authorize the client again.

## 8. Try user-initiated revocation

To see what happens when a Lunch Money user disconnects the client:

1. Authorize the sample again.
2. Return to [Connected Apps](https://my.lunchmoney.app/connected-apps).
3. Revoke the client's access there.
4. Return to the sample and choose **Call /v2/me**.

The request should fail because Lunch Money no longer accepts the stored access token. Choose **Local reset only** to remove the now-unusable local credential and browser session before starting again.

## Local reset is not revocation

**Local reset only** clears the sample's browser session and locally stored credential. It does not contact Lunch Money and does not revoke active access.

When access is still active, revoke it first through **Revoke and verify** or Lunch Money's Connected Apps page. Use local reset by itself only when the remote authorization has already been revoked or you deliberately want to clear this disposable local demonstration.

## Why `localhost` works

Lunch Money redirects your browser to the registered callback, and your browser connects to the sample running on your computer. Lunch Money's server does not initiate a connection to `localhost`, so this walkthrough does not require a public deployment or tunnel.

## Keep the sample local

The sample uses a fixed application identity and keeps browser sessions, authorization attempts, credentials, and refresh coordination in memory. It is designed for local learning, not public deployment. Restarting it clears that state.

Before adapting the code, read the repository's [OAuth code guide](../src/oauth/README.md), [security model](../SECURITY.md), [production checklist](../PRODUCTION_CHECKLIST.md), and [troubleshooting guide](../TROUBLESHOOTING.md).
