# Production adaptation checklist

This is a review aid, not a claim that checking boxes makes an application production-ready.

- Authenticate your own users before OAuth and derive a stable internal `applicationUserId` from the server session.
- Bind every authorization attempt to that identity and the initiating server-derived application session before redirect; require both again at callback. Never accept either identity from email, browser forms, callback queries, or OAuth profile data.
- Give attempts a short application-chosen lifetime, allow each one to be used only once, delete expired or abandoned records, and test reuse, expiration, session switching, and clock behavior. Do not infer Lunch Money token lifetimes from this sample's five-minute attempt policy.
- Key every saved connection by the authenticated application's user ID plus the Lunch Money `/v2/me` `id` and `account_id`. Neither Lunch Money value is sufficient alone because different Lunch Money users can share a budgeting account.
- Replace all in-memory adapters with storage that survives restarts and is shared by every server process.
- Encrypt OAuth credentials at rest; define key management, rotation, backup, restore, access auditing, and least-privilege service access.
- Keep each application user's credentials separate during reads, authorization, refresh, revocation, deletion, and administrative work.
- Save a complete replacement credential set in one operation; never update replacement fields independently.
- Allow only one refresh at a time for the same user and connection across every server process. Define what happens when coordination expires, a process crashes, or an operation times out, and record enough safe information to diagnose failures.
- Treat refresh `invalid_grant` as terminal: stop retrying, discard the set, and require authorization. Do not expose whether it meant expiry, revocation, replay, or unknown token.
- Persist a durable reauthorization-required state when the provider rotates but the replacement write fails. Never restore or retry the consumed token; alert operators without logging credentials.
- Define cleanup for disconnect, sign-out/account switching, user deletion, revoked grants, abandoned attempts, and terminal refresh states.
- Keep client secrets, verifiers, codes, access tokens, and—if a separately registered `offline_access` client is later introduced—refresh tokens off browser payloads, URLs, analytics, traces, logs, crash reports, and support captures.
- Use a secret manager and rotation process. Never bake secrets into images or source.
- Require HTTPS, `Secure`/`HttpOnly`/appropriate `SameSite` cookies, session rotation, expiration, fixation protection, and logout invalidation.
- Integrate explicit CSRF protection with your session architecture for every state-changing route. Define token rotation, concurrent-tab behavior, origin/content-type checks, expiry, session renewal, and safe failure telemetry; do not assume this sample's compact per-session token is universally sufficient.
- Validate the exact registered redirect URI and trusted proxy/origin configuration.
- Add rate limiting, abuse controls, request timeouts, retry policy, circuit breaking, and capacity limits.
- Decide exactly which fields may appear in logs, traces, metrics labels, and error reports, and test that credentials and personal data do not appear there.
- Define authorization cancellation, provider outage, token expiry, revocation failure, verification delay, and reauthorization UX.
- Decide at registration whether this immutable-scope client needs optional `offline_access`; adding it later requires a replacement client and new authorization.
- Test rotation, concurrent refresh, expiry/revocation/replay `invalid_grant`, malformed responses, failed persistence after provider success, restart/multi-instance behavior, and reauthorization.
- Review dependencies, pin supported runtimes, automate updates, run audits, enable CI, secret scanning, and branch protection.
- Perform a deployed end-to-end smoke test with non-sensitive test data and verify revoked tokens fail.
- Assign maintainers, dependency/OAuth-contract owners, support triage, private vulnerability reporting, and release coordination.
- Preserve the repository's MIT license and source attribution in substantial copies.
