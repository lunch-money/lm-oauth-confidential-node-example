# Try OAuth with your Lunch Money account

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

While a client is in development, only the Lunch Money user who created it can authorize it. Use that same Lunch Money user when the sample sends you through authorization. Other Lunch Money users can authorize the client only after it has been [reviewed and approved](https://lunchmoney.dev/oauth/review-and-approval).

Three actions and identities are involved:

- **A real Lunch Money user creates the client.** You create a real confidential OAuth client in the Developer Portal using your Lunch Money account. While the client is in development, only that same Lunch Money user can authorize it.
- **That same Lunch Money user authorizes the client.** When you run the sample, you sign into Lunch Money, select one of your real budgeting accounts, and grant the client real access. The sample receives real tokens and uses them to call the real Lunch Money API.
- **Only the sample application's user is simulated.** Most confidential web applications have their own users and login system. They must associate each Lunch Money authorization and its credentials with the correct application user. To demonstrate that boundary without building an unrelated login system, the sample uses a fixed internal identity named `local-demo-user`. A production application replaces it with an application-specific ID obtained from its authenticated server-side session. The ID should identify the user without using an email address or other personally identifiable information.

```text
Your real Lunch Money account
  creates and owns the OAuth client
  authorizes access to a real budgeting account
                    ↓
          Sample OAuth callback
                    ↓
Credentials stored under local-demo-user
(the stand-in for your application's authenticated user)
```

The sample uses the client you register in the steps below; it does not create or modify that client. Client management remains in the Developer Portal. The automated tests use mocked HTTP responses, but the running sample connects to the configured real Lunch Money authorization and API services.

## 1. Download and install the sample

```sh
git clone https://github.com/lunch-money/lm-oauth-confidential-node-example.git
cd lm-oauth-confidential-node-example
npm ci
npm run build
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

The sample uses `LUNCH_MONEY_API_BASE_URL` for OAuth discovery, token operations, and Lunch Money API requests. A real application should also use [OAuth discovery](https://lunchmoney.dev/oauth/authorization-code#configure-lunch-money-with-discovery) instead of hard-coding authorization, token, and revocation endpoint URLs. `PORT` is optional and defaults to `4002`.

`SESSION_SECRET` is also optional for this local sample. If it is absent, the process creates a new random cookie-signing secret when it starts. Because all browser sessions, authorization attempts, and credentials are held in memory and cleared on restart, the generated secret can be cleared at the same time. A production application must instead provide a strong `SESSION_SECRET`, keep it stable across restarts, and not rotate it for each OAuth authorization.

> [!WARNING]
> **Keep credentials private**
> Keep the client secret in a private local environment or secret manager. Never paste it into documentation, AI chats or prompts, committed files, screenshots, browser code, logs, support requests, or commands retained in shared shell history.

## 4. Start the sample

```sh
npm run dev
```

Open [http://localhost:4002](http://localhost:4002) in your browser.

If a form reports **Invalid CSRF token**, reload the page and try again. This commonly happens when the development server restarts and clears its in-memory browser session while an older page remains open. Simply leaving the unchanged running sample open does not expire the form token.

## 5. Authorize and call `/v2/me`

1. Choose **Connect Lunch Money**.
2. Sign into Lunch Money as the user who created the development client.
3. Select one of that user's budgeting accounts and approve access.
4. After the browser returns to `http://localhost:4002/oauth/callback`, choose **Call /v2/me**.

The sample calls `GET /v2/me` from its Node.js server using the server-held access token. It validates the response against the documented `userObject` schema and displays the returned profile fields. The access token is never sent to the browser.

Open Lunch Money's [Connected Apps](https://my.lunchmoney.app/connected-apps) page in another tab, keeping the sample available so you can return to it. The client you just authorized should appear with the details you registered. If you plan to exercise refresh, return to the sample without revoking access yet; revocation ends this authorization's continuing access.

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
2. Open [Connected Apps](https://my.lunchmoney.app/connected-apps). Keep the sample available in another tab so you can return to it after revoking the authorization.
3. Revoke the client's access there.
4. Return to the sample and choose **Call /v2/me**.

The request should fail because Lunch Money no longer accepts the stored access token. Choose **Local reset only** to remove the now-unusable local credential and browser session before starting again.

## Local reset is not revocation

**Local reset only** clears the sample's browser session and locally stored credential. It does not contact Lunch Money and does not revoke active access.

When access is still active, revoke it first through **Revoke and verify** or Lunch Money's Connected Apps page. Use local reset by itself only when the remote authorization has already been revoked or you deliberately want to clear this disposable local demonstration.

## Why `localhost` works

> [!NOTE]
> Lunch Money redirects your browser to the registered callback, and your browser connects to the sample running on your computer. Lunch Money's server does not initiate a connection to `localhost`, so this walkthrough does not require a public deployment or tunnel.

## Keep the sample local

> [!WARNING]
> The sample uses a fixed application identity and keeps browser sessions, authorization attempts, credentials, and refresh coordination in memory. Run it locally and do not expose it as a public application. Use a test budgeting account when practical. Restarting the sample clears its in-memory state.

After the flow succeeds, connect each action you performed to the code that implemented it, then decide how those responsibilities fit into your own application.

Before adapting the code, read the repository's [OAuth code guide](../src/oauth/README.md), [security model](../SECURITY.md), [production checklist](../PRODUCTION_CHECKLIST.md), and [troubleshooting guide](../TROUBLESHOOTING.md).
