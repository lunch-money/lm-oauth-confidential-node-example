# Runnable scaffolding

Everything here is incidental to OAuth: environment parsing, Hono routing, signed cookies, fixed demo identity, per-session CSRF forms, in-memory adapters, server-rendered HTML, styling, and Node startup.

Replace `http/app.ts` with your framework's thin routes while keeping calls to the named operations in `src/oauth/`. Replace `session/session-cookie.ts` with your production session/authentication integration. Replace the in-memory stores with shared, expiring authorization-attempt storage and durable encrypted credential storage.

The constant `local-demo-user` is only enough to run one local demonstration. It is not login, tenant isolation, or an example of how to derive identity. The signed cookie selects opaque server-side session state; its ID is bound to each authorization attempt and never submitted as form/callback data. Production must obtain a stable `applicationUserId` and application-session identity from trusted server state and bind both before redirect. Never accept email or an owner/session ID supplied by the browser/callback. Preserve the user identity for every credential read, authorization/refresh replacement, revocation, and deletion.

Each page form includes a random token stored in the server-side browser session. `session/csrf.ts` rejects missing or incorrect values with a constant-time comparison before `/oauth/start`, `/me`, `/refresh`, `/revoke`, or `/reset` executes. The OAuth callback is a GET and instead requires one-time state plus the same signed application session. Production should adapt token rotation, expiry, origin policy, and session lifecycle to its threat model.

`InMemoryRefreshCoordinator` rejects overlapping refresh for one connection and permits independent connections. It is not a distributed lock, durable terminal-state record, or restart/multi-instance solution. Production storage must add encryption, key management, transactional complete-set replacement, tenant isolation, access auditing, retention, and lifecycle cleanup. The in-memory map deliberately does not resemble a production database schema.

Routes:

- `GET /` renders the state held in the opaque browser session.
- `POST /oauth/start` binds the fixed demo identity and redirects.
- `GET /oauth/callback` validates and stores credentials server-side.
- `POST /me` makes a server-side `GET /v2/me` call.
- `POST /refresh` appears only when a stored refresh token exists; it rotates and stores a complete replacement set.
- `POST /revoke` revokes the grant with a refresh token when present (otherwise the access token), verifies rejection, and deletes the credential.
- `POST /reset` deletes local state only; it does not revoke remotely.
