# Public OAuth confidential-web reference plan

Status: proposed

Owner: `lunch-money-oauth-demo` maintainers initially; final code lives in two
new public repositories with explicitly named maintainers.

Related plan: [OAuth developer documentation plan](./oauth-docs.md), Phase 5 /
Checkpoint 6.

## 1. Decision and objective

Create new public repositories from curated snapshots of
`lunch-money-oauth-demo`; do not use GitHub's **Fork** action. A GitHub fork
retains the proof-of-concept repository's history and relationship, which does
not achieve the desired clean public history. Preserve provenance in the new
READMEs and comply with the source repository's license, but begin each new
repository with a deliberately reviewed initial commit.

The first repository will be Lunch Money's maintained Node.js/TypeScript reference
for a **confidential web OAuth client**. Its primary goal is to let a developer:

1. register a client in the Lunch Money Developer Portal;
2. configure the sample with that client ID, client secret, redirect URI, and
   the documented Lunch Money issuer;
3. run one command;
4. authorize the client through Lunch Money;
5. call `GET /v2/me`; and
6. revoke access and observe the resulting failure.

The repository is a teaching artifact before it is a showcase application.
The OAuth code that developers should read must be easy to find, small enough
to read in one sitting, thoroughly commented, and separated from Hono, HTML,
CSS, session adapters, and other incidental scaffolding.

A second repository will eventually be the maintained Expo/React Native
reference for a **native public OAuth client**. The two samples must remain
independently runnable and must not share a private runtime package. They teach
different credential boundaries and may have different maintainers and release
cadences.

## 2. Scope boundaries

### Initial public release

- Confidential web application only.
- Node.js and TypeScript.
- `openid-client` owns authorization-server discovery and OAuth protocol
  operations.
- Hono remains the thin HTTP adapter, isolated as scaffolding rather than
  presented as a Lunch Money requirement.
- Authorization Code flow with state and S256 PKCE.
- No authorization-time `scope` parameter; Lunch Money uses the client's
  registered scope set.
- Client secret, PKCE verifier, authorization code exchange, and tokens remain
  on the server.
- One `GET /v2/me` API call.
- Explicit revocation and local-session reset paths.
- Safe errors and logs that do not expose credentials.
- In-memory storage is acceptable for the runnable teaching sample only when
  its limits are prominent and the production replacement seam is clear.

### Deferred from the confidential-web release

- Expo and React Native move to the separately planned native repository.
  Backend-assisted mobile handoff, Swift, Kotlin, Python, and additional
  framework variants remain deferred.
- A generic API explorer.
- A production deployment recipe or claim that the sample is production-ready.
- Refresh-token storage, rotation, replay recovery, and periodic-integration
  recipes until the public refresh contract is approved and tested against the
  production-equivalent persistent server implementation.
- Token-debug logging in the initial public reference. The existing demo's
  opt-in plaintext token logger should not be copied.

The existing `lunch-money-oauth-demo` remains an internal/integration demo and
the source for a separately labeled, non-production "under the hood"
illustration. It does not become the public reference repository in place.

## 3. Repository split and naming

Use the pattern:

```text
lm-oauth-<client-type>-<stack>-example
```

`<client-type>` names the OAuth security boundary rather than the UI platform.
Initial values are `confidential` and `native`. `<stack>` names the most useful
recognizable implementation choice; it may be a runtime, language, or framework
when that is what determines how a developer will use the sample.

Initial repository names:

- `lm-oauth-confidential-node-example` — Node.js/TypeScript, `openid-client`,
  and replaceable Hono scaffolding;
- `lm-oauth-native-expo-example` — Expo/React Native with TypeScript,
  `expo-auth-session`, platform authentication browsers, and
  `expo-secure-store`.

Do not call the second repository merely `native` or `react-native`: `expo` is
an important implementation constraint. The native guide should separately
point bare React Native, Swift/iOS, and Kotlin/Android developers to suitable
libraries without implying that the Expo sample is universal.

Each repository has its own root README, lockfile, CI, releases, dependency
updates, security notes, and maintenance owner. A developer must not configure,
install, build, or test one sample to use the other.

This plan delivers the confidential repository first. The native repository is
created only after its iOS and Android build, callback, and authorization smoke
path is reproducible.

## 4. Confidential repository code organization

Confirm the GitHub organization visibility, license, and maintainer before
creating `lm-oauth-confidential-node-example`.

Proposed structure:

```text
README.md
ARCHITECTURE.md
SECURITY.md
PRODUCTION_CHECKLIST.md
TROUBLESHOOTING.md
CONTRIBUTING.md
.env.example
package.json
src/
  oauth/
    README.md
    configuration.ts
    authorization.ts
    callback.ts
    tokens.ts
    lunch-money-api.ts
    revocation.ts
    errors.ts
    types.ts
    index.ts
  scaffolding/
    README.md
    http/
      app.ts
      routes.ts
      server.ts
    session/
      session-store.ts
      session-cookie.ts
    presentation/
      pages.ts
      styles.css
  index.ts
tests/
  oauth/
  http/
  fixtures/
```

`src/oauth/` is the single teaching surface. A developer following the guide
should not need to inspect `src/scaffolding/` to understand the OAuth flow.

The boundary must be enforceable, not merely cosmetic:

- `src/oauth/` contains no Hono, React, Vite, Tailwind, cookie-library, or HTML
  imports.
- OAuth modules accept narrow interfaces for session state, token storage,
  logging, clocks, randomness where useful, and `fetch`/library dependencies.
- `src/scaffolding/` adapts HTTP requests and cookies to those interfaces.
- Route handlers remain thin: parse input, call a named OAuth operation, map
  the result to a response.
- Tests for `src/oauth/` run without opening a port or rendering a UI.
- A boundary test or lint rule prevents framework imports from entering
  `src/oauth/`.

Avoid an oversized `oauth.ts`. Each file should correspond to one recognizable
part of the reader's journey, and `src/oauth/README.md` supplies the recommended
reading order.

## 5. Documentation standard

Overindex on documentation. The repository should answer both "how do I run
this?" and "why is this safe?" without requiring the reader to reverse-engineer
the code.

### Root README

The root README is task-oriented and supports a first success without knowledge
of Lunch Money's internal development stack. It must include:

- what the sample demonstrates and who it is for;
- an explicit statement that it is a confidential server-side client;
- prerequisites and supported Node/package-manager versions;
- a five-minute quick start beginning with Developer Portal registration;
- the exact redirect URI to register for the default local run;
- the minimum recommended scope set for the walkthrough (`me:read`) and an
  explanation that the authorization request itself omits `scope`;
- configuration-variable descriptions using placeholders only;
- start, authorize, inspect `/v2/me`, revoke, and reset steps;
- expected browser states so a developer can tell whether each step worked;
- links into the public Lunch Money OAuth guides and API reference;
- a short code map pointing directly to every file under `src/oauth/`;
- a clear separation between sample guarantees and production responsibilities;
- a prominent credential-ownership section explaining that a real application
  must associate every stored Lunch Money grant and credential set with the
  correct authenticated user of that application;
- troubleshooting links; and
- project status, maintenance owner, support path, license, and provenance.

Do not require the reader to configure or run `server`, `lunch-money-auth`, a
mobile app, or any private Lunch Money component. An optional maintainer section
may explain how to point the sample at a complete local Lunch Money stack.

### Supporting documents

- `ARCHITECTURE.md`: actor/data-flow diagram, browser/server boundary, module
  map, and request sequence.
- `SECURITY.md`: credential boundaries, threat assumptions, safe logging,
  vulnerability reporting, and intentionally omitted production features.
- `PRODUCTION_CHECKLIST.md`: durable encrypted token storage, horizontal
  scaling, secret management, HTTPS, secure cookies, observability redaction,
  refresh/recovery policy, rate limiting, CSRF/session defenses, and deployment
  concerns. This is guidance, not a claim that checking boxes automatically
  makes the sample production-ready.
- `TROUBLESHOOTING.md`: redirect mismatch, state failure, PKCE failure,
  `invalid_client`, `invalid_grant`, denial, missing `me:read`, expired access,
  and revocation behavior.
- `src/oauth/README.md`: the canonical reading order and mapping from OAuth
  concepts to source files and tests.
- `src/scaffolding/README.md`: explains why the framework/UI code is incidental
  and where to replace it without changing the OAuth integration.

### Code-comment standard

Comments should be unusually thorough about security intent without narrating
obvious TypeScript syntax.

- Every exported OAuth function and interface has JSDoc describing its role,
  inputs, outputs, credential exposure, and important failure behavior.
- Place "why" comments beside state generation/verification, PKCE generation,
  redirect URI use, authorization-code consumption, token storage, revocation,
  cookie settings, and log redaction.
- Mark security invariants consistently, for example `Security invariant:`.
- Explain what `openid-client` validates or generates for us; do not obscure
  important checks behind a library call with no commentary.
- Link comments to stable Lunch Money documentation or relevant standards only
  where the link adds durable context.
- Avoid comments that duplicate the following line, stale numbered walkthrough
  comments, and claims that library use alone makes the integration secure.
- Tests use descriptive names that read as behavioral documentation.

### Credential storage and application-user binding

The sample must state this requirement in the root README, `ARCHITECTURE.md`,
`SECURITY.md`, `PRODUCTION_CHECKLIST.md`, `src/oauth/README.md`, and beside the
credential-store interface. Repetition is intentional because missing this
boundary can expose one user's Lunch Money data to another application user.

For a confidential application, explain that production code must:

- authenticate its own user independently of Lunch Money OAuth;
- bind the authorization attempt to that authenticated application user's
  server-side session before redirecting to Lunch Money;
- after callback validation, store the resulting Lunch Money credential set
  under a stable, internal application-user identifier;
- never trust a user ID supplied only by callback query parameters, browser
  form fields, or other client-controlled state;
- avoid using email as the primary storage key because email can change and is
  not the application's authorization boundary;
- prevent one application user from reading, refreshing, revoking, or replacing
  another user's Lunch Money credentials;
- decide and document whether one application user may have multiple Lunch
  Money connections or budgeting-account contexts;
- encrypt durable refresh credentials at rest, restrict access to the smallest
  backend surface, and never return them to browser JavaScript; and
- delete or revoke the correct credential set when the application user
  disconnects Lunch Money, signs out, changes accounts, or deletes their
  application account, according to the application's policy.

The initial sample does not implement application login or prescribe a database
schema. It demonstrates the boundary through a small, documented interface such
as `CredentialStore`, whose methods require an opaque `applicationUserId`. Its
in-memory adapter may use one clearly labeled demonstration identity so the app
runs locally, but comments must say that this is not multi-user isolation or
durable storage. Do not show a simplistic production-looking table or ORM model
that developers may copy without considering tenancy, encryption, and key
management.

The callback API should make the ownership chain visible in names and types:

```text
authenticated application user
  -> server-side authorization attempt
  -> verified OAuth callback
  -> Lunch Money credential set
  -> CredentialStore[applicationUserId, connectionId]
```

For the later native sample, explain the related but different boundary:
credentials normally live in the device's secure storage. If the app has its
own user accounts, credentials must be namespaced to the currently authenticated
application user and cleared or switched safely when that user signs out or
changes accounts. Sending native credentials to an application backend changes
the architecture and is outside the direct-native reference.

## 6. Implementation phases

### Phase A: public-repository design and source audit

- Confirm repository name, public visibility, license, maintainer, support
  channel, and dependency-update owner.
- Audit the source demo for credentials, internal hostnames, internal setup
  instructions, personal data, generated artifacts, and unpublished contracts.
- Select only the confidential-web behavior and tests worth carrying forward.
- Record source commit provenance without copying the old Git history.
- Decide whether the minimal UI will be server-rendered or retain the current
  Vite/React UI. Prefer the option that produces the smallest incidental
  dependency surface while keeping the example pleasant to run.

Exit criterion: approved repository brief, source inventory, license decision,
and file map.

### Phase B: framework-independent OAuth core

- Add `openid-client` and implement discovery/configuration through it.
- Extract authorization start, callback validation, token exchange, Lunch Money
  API call, and revocation into `src/oauth/`.
- Retain state and S256 PKCE even for the confidential client.
- Ensure the authorization request omits `scope`.
- Define narrow session/token-store interfaces and safe domain errors.
- Make credential-store operations methods require a stable application-user ID and
  test that one identity cannot retrieve, replace, or revoke another identity's
  credentials.
- Add focused unit tests for success, denial, missing/mismatched state, missing
  code, PKCE/token errors, insufficient `me:read`, malformed responses,
  revocation, and redaction.
- Add the framework-import boundary check.

Exit criterion: the complete OAuth teaching path is understandable and tested
without Hono or a browser.

### Phase C: isolated runnable scaffolding

- Build the Hono adapter under `src/scaffolding/http/`.
- Put in-memory session/token storage under `src/scaffolding/session/`.
- Put all display-only code under `src/scaffolding/presentation/`.
- Use signed, HTTP-only, SameSite session cookies; use `Secure` when HTTPS is in
  use; apply `Cache-Control: no-store` to sensitive flow responses.
- Keep tokens, secrets, authorization codes, PKCE verifiers, cookies, and raw
  upstream error bodies out of browser responses and logs.
- Provide distinct revoke and local-reset actions with accurate wording.
- Ensure startup validates configuration and reports actionable, non-secret
  errors.

Exit criterion: a new developer can configure and run the public flow against
deployed Lunch Money components with one install command and one start command.

### Phase D: documentation-first review

- Write the root and supporting READMEs before polishing presentation code.
- Review the repeated credential ownership/binding explanation with both an
  OAuth implementer and an application-backend developer.
- Conduct a cold-start test with a developer who did not build OAuth support.
- Record every step where that developer needs undocumented knowledge.
- Verify terminology and behavioral claims against `developer-docs`, the
  published OpenAPI contract, and current Developer Portal labels.
- Verify all source links and ensure docs snippets are extracted from or checked
  against tested source.
- Add a direct "Sample application" link from the public OAuth overview,
  authorization, development, and troubleshooting pages after the repository
  URL is stable.

Exit criterion: the test developer can register a new client and complete,
inspect, revoke, and repeat the flow using only public materials.

### Phase E: publication and maintenance

- Initialize the new repository with the reviewed snapshot as its first commit.
- Enable branch protection, dependency updates, secret scanning, and required
  CI checks.
- Publish an initial tagged release and pin exact supported runtime/dependency
  ranges where appropriate.
- Add a scheduled smoke test or documented release smoke procedure against the
  OAuth preview environment without placing credentials in repository logs.
- Assign ownership for dependency updates, OAuth-contract changes, and support
  issue triage.
- Add a release checklist that coordinates sample changes with
  `developer-docs`, the Portal, and server behavior.

Exit criterion: the repository is public, linked from the guides, reproducibly
tested, and has a named maintenance path.

### Phase F: optional refresh step in the confidential walkthrough

The public contract was verified against the local server and public docs before implementation.

- Keep one sample and one walkthrough: always register `me:read`, and optionally
  register immutable `offline_access` before authorization.
- Keep callback handling limited to optional refresh-token storage; isolate the
  refresh lifecycle in `src/oauth/refresh.ts`.
- Demonstrate per-owner/connection exclusion, rotation, complete atomic
  replacement, terminal `invalid_grant`, failed-persistence recovery, grant-aware
  revocation, and reauthorization.
- Clearly label the in-memory store/coordinator as non-durable, unencrypted,
  non-transactional, non-distributed, and unsafe across restarts or instances.
- Defer background scheduling, durable adapter implementation, and
  production-equivalent restart/multi-instance validation to adopters and later
  publication work.

Exit criterion: the optional interactive refresh behavior is implementation-tested,
contract-traceable, and accurately bounded as a teaching pattern.

### Phase G: separate native reference

- Create `lm-oauth-native-expo-example` as a new repository with clean history.
- Carry forward only the direct Expo flow, not the confidential backend handoff.
- Use `expo-auth-session`, the platform authentication browser, PKCE without a
  client secret, and `expo-secure-store`.
- Give the native sample an independent README, application registration path,
  configuration, CI, release, and maintenance owner.
- Verify on iOS and Android, including callback/deep-link behavior and process
  interruption.
- Document device credential ownership and application-account switching
  separately from the confidential server-side storage model.

Exit criterion: the native sample is independently runnable and accurately
described as an Expo reference rather than a generic implementation for every
native stack.

## 7. Validation matrix

Required before the initial public release:

- clean install from a fresh checkout using the documented runtime;
- format, lint, typecheck, unit tests, dependency audit, and production build;
- no framework imports in `src/oauth/`;
- automated assertion that authorization URLs omit `scope` and include state
  plus S256 PKCE;
- callback rejection for missing/mismatched state and missing code;
- client secret and tokens absent from browser payloads, URLs, errors, snapshots,
  and default logs;
- credential-store APIs require an application-user identity, with negative
  tests proving cross-user reads, replacement, and revocation are rejected;
- documentation warns in every designated location that the demo identity and
  in-memory adapter are not production user binding or durable storage;
- successful deployed-environment authorization and `GET /v2/me` call;
- denied-consent and missing-`me:read` paths;
- successful revocation followed by a failing API request with the old token;
- local reset clearly distinguished from Lunch Money revocation;
- README quick start performed from a clean checkout by someone other than the
  author;
- all documentation links and source-code map links validated; and
- secret scanning of the entire new repository history before public release.

Native, refresh, persistent-storage, and production-deployment validation are
not prerequisites for the initial confidential-web teaching release because
those capabilities are explicitly excluded.

## 8. Open decisions

1. Whether each repository lives under the Lunch Money GitHub organization
   immediately or begins privately for review.
2. License and attribution language based on the existing demo's license status.
3. Named maintainer and expected support/upgrade cadence.
4. Minimal presentation choice: server-rendered Hono pages or isolated
   Vite/React scaffolding.
5. Public issuer/environment used by the quick start while OAuth remains an
   invite-only preview.
6. Whether initial readers receive a downloadable template/release archive in
   addition to the GitHub repository.
7. Whether the confidential sample models a `connectionId` from the first
   release or documents it while demonstrating a single Lunch Money connection
   per application user.

None of these decisions changes the central architecture: two independent
samples, with the confidential example centered on a small,
framework-independent `src/oauth/` teaching surface and all incidental runtime
code kept under `src/scaffolding/`.
