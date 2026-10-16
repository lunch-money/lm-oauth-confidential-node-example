# Runnable scaffolding

Everything here is incidental to OAuth: environment parsing, Hono routing, signed cookies, fixed demo identity, per-session CSRF forms, in-memory adapters, React server rendering, styling, and Node startup.

`presentation/page-model.ts` defines the browser-safe values that Hono may pass to the UI. `presentation/Page.tsx` and its small components render those values on the server, while `presentation/render-page.tsx` produces the complete static HTML document. No React runtime or hydration payload is sent to the browser. Replace this presentation layer freely; it is not part of the OAuth teaching core.

Replace `http/app.ts` with your framework's thin routes while keeping calls to the named operations in `src/oauth/`. Replace `session/session-cookie.ts` with your production session/authentication integration. Replace the in-memory stores with shared, expiring authorization-attempt storage and durable encrypted credential storage.

The constant `local-demo-user` is only enough to run one local demonstration. It does not sign users in or keep different users' data separate. The signed cookie contains a random ID that finds the session data stored on this server. Each authorization attempt records that ID, so a callback from another browser session is rejected. A production application must get a stable `applicationUserId` and session ID from its own server-side login system. Never trust an email, user ID, or session ID submitted by the browser or callback. Use the same application user ID whenever credentials are read, replaced, revoked, or deleted.

Each page form includes a random token stored in the server-side browser session. `session/csrf.ts` rejects missing or incorrect values with a constant-time comparison before `/oauth/start`, `/me`, `/refresh`, `/revoke`, or `/reset` executes. The OAuth callback is a GET and instead requires a one-time OAuth state value plus the same signed application session. A production application should choose when these form tokens and sessions expire or change, and should also decide which request origins and content types it accepts.

`InMemoryRefreshCoordinator` rejects two refresh attempts for the same connection while allowing different connections to refresh independently. It coordinates only this Node process and forgets everything on restart. An application with multiple server processes must coordinate them too. Production storage must encrypt credentials, keep different users' data separate, save an entire replacement token set in one operation, record access, and remove data when it is no longer needed. The in-memory map deliberately does not suggest a production database design.

Routes:

- `GET /` renders the state held in the server-side browser session.
- `POST /oauth/start` binds the fixed demo identity and redirects.
- `GET /oauth/callback` validates and stores credentials server-side.
- `POST /me` makes a server-side `GET /v2/me` call.
- `POST /refresh` appears only when a stored refresh token exists; it rotates and stores a complete replacement set.
- `POST /revoke` revokes the grant with a refresh token when present (otherwise the access token), verifies rejection, and deletes the credential.
- `GET /reset/confirm` explains that local deletion is not revocation and renders the final CSRF-protected form.
- `POST /reset` deletes local state only; it does not revoke remotely.
