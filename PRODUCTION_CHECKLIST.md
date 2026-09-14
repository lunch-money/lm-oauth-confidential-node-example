# Production adaptation checklist

This is a review aid, not a claim that checking boxes makes an application production-ready.

- Authenticate your own users before OAuth and derive a stable internal `applicationUserId` from the server session.
- Bind every authorization attempt to that identity and the initiating server-derived application session before redirect; require both again at callback. Never accept either identity from email, browser forms, callback queries, or OAuth profile data.
- Give attempts a short application-chosen lifetime, atomically consume them once, delete expired/abandoned records, and test replay, expiry boundaries, session switching, and clock behavior. Do not infer Lunch Money token lifetimes from this sample's five-minute attempt policy.
- Decide whether users may own multiple Lunch Money connections and use a stable `connectionId` consistently.
- Replace all in-memory adapters with durable, horizontally shared storage.
- Encrypt OAuth credentials at rest; define key management, rotation, backup, restore, access auditing, and least-privilege service access.
- Enforce tenant isolation for reads, authorization replacement, refresh replacement, revocation, deletion, and administrative tools.
- Make complete credential-set replacement atomic and transactional; never update rotated fields independently.
- Serialize refresh per owner/connection across every process with a distributed lock, queue, or equivalent. Define lock leases, crash recovery, timeouts, and observability.
- Treat refresh `invalid_grant` as terminal: stop retrying, discard the set, and require authorization. Do not expose whether it meant expiry, revocation, replay, or unknown token.
- Persist a durable reauthorization-required state when the provider rotates but the replacement write fails. Never restore or retry the consumed token; alert operators without logging credentials.
- Define cleanup for disconnect, sign-out/account switching, user deletion, revoked grants, abandoned attempts, and terminal refresh states.
- Keep client secrets, verifiers, codes, access tokens, and—if a separately registered `offline_access` client is later introduced—refresh tokens off browser payloads, URLs, analytics, traces, logs, crash reports, and support captures.
- Use a secret manager and rotation process. Never bake secrets into images or source.
- Require HTTPS, `Secure`/`HttpOnly`/appropriate `SameSite` cookies, session rotation, expiration, fixation protection, and logout invalidation.
- Integrate explicit CSRF protection with your session architecture for every state-changing route. Define token rotation, concurrent-tab behavior, origin/content-type checks, expiry, session renewal, and safe failure telemetry; do not assume this sample's compact per-session token is universally sufficient.
- Validate the exact registered redirect URI and trusted proxy/origin configuration.
- Add rate limiting, abuse controls, request timeouts, retry policy, circuit breaking, and capacity limits.
- Redact structured observability by allowlist and test logs, traces, metrics labels, and error reporting.
- Define authorization cancellation, provider outage, token expiry, revocation failure, verification delay, and reauthorization UX.
- Decide at registration whether this immutable-scope client needs optional `offline_access`; adding it later requires a replacement client and new authorization.
- Test rotation, concurrent refresh, expiry/revocation/replay `invalid_grant`, malformed responses, failed persistence after provider success, restart/multi-instance behavior, and reauthorization.
- Review dependencies, pin supported runtimes, automate updates, run audits, enable CI, secret scanning, and branch protection.
- Perform a deployed end-to-end smoke test with non-sensitive test data and verify revoked tokens fail.
- Assign maintainers, dependency/OAuth-contract owners, support triage, private vulnerability reporting, and release coordination.
- Preserve the repository's MIT license and source attribution in substantial copies.
