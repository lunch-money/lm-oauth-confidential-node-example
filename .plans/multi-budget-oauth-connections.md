# Multi-budget OAuth connections plan

Status: proposed

Repositories:

- `lunch-money/lm-oauth-confidential-node-example`
- `lunch-money/lm-oauth-native-expo-example`
- `lunch-money/developer-docs`

Source guidance: `developer-docs` commit `8b9d9bc` (`add multi budget documentantion`)

## 1. Objective

Update both maintained OAuth samples and their documentation so they teach that
one Lunch Money user can authorize multiple budgeting accounts for the same
OAuth client. Each authorization produces credentials for one selected Lunch
Money user and budgeting-account pair.

After a successful authorization, the application must call `GET /v2/me`, use
the returned `account_id` to identify the connection, and retain the returned
`id` and `budget_name` as connection metadata. An application user can then
switch among previously authorized budgets locally or authorize another budget.

The work must preserve the samples' existing credential boundaries:

- the confidential sample keeps credentials on its trusted server and binds
  them to the authenticated application user;
- the native sample keeps credentials in platform secure storage and has no
  client secret.

## 2. Locked cross-repository decisions

These decisions are shared contracts. Agents should not independently replace
them without coordinating the change across all three workstreams.

### 2.1 Connection identity

- The durable ownership key is `(applicationUserId, accountId)` in a
  confidential application.
- In the single-user native teaching sample, `accountId` is the local
  connection key.
- `accountId` comes only from the strictly validated `GET /v2/me` response.
- `budgetName` is display metadata, never a key. Duplicate names are valid.
- `lunchMoneyUserId` is retained as metadata identifying the authorizing Lunch
  Money user, but it is not a substitute for `accountId`.
- Access tokens remain opaque and must never be parsed to discover identity.

Use the following conceptual record in both samples, adapted to each storage
boundary:

```ts
interface LunchMoneyConnection {
  accountId: number
  lunchMoneyUserId: number
  budgetName: string
  credentials: CredentialSet
}
```

The confidential store additionally scopes every operation by the authenticated
application user's stable internal ID.

### 2.2 Authorization completion

A successful callback is not complete when the token exchange succeeds. The
application must:

1. exchange the authorization code for credentials;
2. call and strictly validate `GET /v2/me` with the new access token;
3. derive the connection identity from `account_id`;
4. atomically create or replace that account's complete connection record; and
5. make that connection active.

Do not save the credentials under a guessed, browser-supplied, or
pre-authorization connection ID. The confidential authorization attempt still
binds the callback to the initiating application user and browser session, but
it does not decide which budgeting account was selected.

If identification or persistence fails, do not expose credentials or leave an
unidentified usable connection in the normal store. Each sample should use its
existing safe-error conventions and document the recovery behavior.

### 2.3 Reauthorization and additional authorization

- Authorizing a previously unseen `account_id` creates a new connection without
  changing other connections.
- Authorizing an existing `account_id` atomically replaces that connection's
  credential set and metadata; it does not create a duplicate.
- The newly authorized or reauthorized connection becomes active.
- Refreshing a token never changes the connection's account identity.

### 2.4 Active-budget UI

Once at least one connection exists, show a persistent **Active budget** control
using `budget_name` as its primary label.

- With one connection, it may render as a non-dropdown indicator.
- With multiple connections, it becomes a selector listing authorized budgets.
- Selecting an existing budget changes the active local connection and does not
  start OAuth.
- Provide a nearby **Authorize another budget** or **Add budget** action that
  starts OAuth.
- A final “Authorize another budget…” selector item is acceptable, but a
  separate action is preferred for clearer semantics and accessibility.
- Refresh, revoke, local reset/disconnect, API calls, status messages, and shown
  data always apply to the visibly active budget.
- Clear or replace displayed/cached account data when the active budget changes.
- Use `account_id` as selector values. If budget names collide, add a safe,
  non-secret disambiguator only for the colliding entries (for example, the
  numeric account ID).
- After every authorization, treat the validated `/v2/me.id` as the active
  Lunch Money identity, clear presentation state from the previous identity,
  and show only connections authorized by that Lunch Money user. Retain other
  users' connection records in isolated storage, but never mix their budgets in
  one selector.
- Summarize the active identity with its validated display name and authorized
  budget count, for example, “Alex is connected. 2 authorized budgets.”

Revoking or deleting one connection must not alter the other connections. If
the active connection is removed, choose a remaining connection deterministically
or show the disconnected state when none remain.

## 3. Parallel workstreams

All three workstreams may begin after accepting the locked decisions above.

### Workstream A: confidential Node.js sample

Owner: confidential-sample agent

Repository: `lm-oauth-confidential-node-example`

Implementation:

1. Replace the preassigned `ConnectionId` authorization model with an attempt
   bound only to the authenticated application user and application session.
2. Add a connection record and store abstraction that can list, get, atomically
   upsert, and delete connections beneath an application user by `accountId`.
3. Refactor callback completion to exchange, call `/v2/me`, validate, and upsert
   the identified connection as one application operation.
4. Track the active `accountId` in trusted server-side session state. Treat a
   submitted account ID only as a selection request, then verify that it belongs
   to the authenticated application user before loading credentials.
5. Update all resource, refresh, revoke, reset, and reauthorization-required
   paths to operate on the active connection.
6. Update the HTML UI with the Active budget indicator/selector and separate
   Authorize another budget action.
7. Keep the explicit “Call `/v2/me`” teaching action if useful, even though
   `/v2/me` is now also called during authorization completion.
8. Update README, walkthrough, architecture, security guidance, troubleshooting,
   production checklist, and teaching comments.

Required tests:

- callback identity still comes from the consumed server-side attempt;
- authorization calls `/v2/me` before persisting the connection;
- budgets A then B are both retained and B becomes active;
- reauthorizing A replaces A atomically and does not duplicate it;
- selecting B uses B's token without OAuth and cannot select another user's
  connection;
- duplicate budget names remain distinct by `account_id`;
- refreshing, revoking, resetting, and terminal failure affect only the active
  connection;
- removing the active connection selects the documented fallback or leaves no
  active connection;
- failed/malformed `/v2/me` identification does not create a connection.

### Workstream B: native Expo sample

Owner: native-sample agent

Repository: `lm-oauth-native-expo-example`

Implementation:

1. Replace the one fixed credential slot with versioned secure connection
   storage keyed by `accountId`, plus a persisted active-account reference.
2. Keep credentials and refresh lifecycle state isolated per account. Preserve
   the existing atomic complete-set replacement and interrupted-refresh safety
   for each connection.
3. Refactor callback completion to exchange, call `/v2/me`, validate, upsert,
   and activate the identified connection.
4. Expose only safe connection summaries to React state: account ID, budget
   name, Lunch Money user ID if needed, active state, and refresh availability.
   Never expose tokens to presentation state.
5. Add the Active budget indicator/selector and Authorize another budget action.
6. Scope profile reads, refresh, revoke, and local reset to the active account;
   clear the shown profile when switching.
7. Define a safe migration from the existing single-slot storage format. Since
   the old record lacks account identity, either identify it once with `/v2/me`
   before migration or require reauthorization with a clear message. Do not
   invent an account ID.
8. Update README, walkthrough, architecture, security guidance, troubleshooting,
   production checklist, and teaching comments.

Required tests:

- authorization identifies the account before durable save;
- budgets A then B coexist and B becomes active;
- reauthorizing A replaces only A;
- switching connections does not authorize or copy credentials into UI state;
- duplicate names remain distinct;
- refresh interruption and terminal failure are isolated per account;
- revoke and local reset remove only the active connection;
- active-account fallback is deterministic;
- malformed `/v2/me` and legacy-storage migration failures are safe.

### Workstream C: developer documentation

Owner: developer-docs agent

Repository: `developer-docs`

Implementation:

1. Reconcile the documentation introduced in `8b9d9bc` with the final sample
   APIs, screenshots/text, and walkthrough order.
2. State explicitly that `/v2/me` is called immediately after exchange to
   identify the selected budgeting account before normal credential persistence.
3. Describe the active-budget selector and the distinction between switching an
   existing connection and authorizing another budget.
4. Clarify that an internal connection record may have its own database primary
   key, but the stable provider-side identity used for upsert is `account_id`
   beneath the authenticated application user.
5. Replace language that implies an arbitrary pre-authorization connection ID
   determines the selected Lunch Money account.
6. Document duplicate-name handling, per-connection refresh/revocation/recovery,
   cached-data isolation, and reauthorization-as-upsert behavior.
7. Update the generated sample walkthrough only after the corresponding sample
   source documents are final, using the repository's normal generation/check
   process rather than hand-editing generated blocks.

Required documentation checks:

- concepts, authorization-code, native-app, security, token, development, and
  sample-application pages use the same identity model;
- examples never use `budget_name` as a key;
- diagrams show identification/persistence after `/v2/me` where appropriate;
- links and generated content checks pass.

## 4. Coordination checkpoints

### Checkpoint 1: contract confirmation

Before substantial implementation, each agent confirms that its proposed types
and storage APIs implement Section 2. Share any requested contract change with
the other agents before coding against it.

### Checkpoint 2: core behavior available

The sample agents share their public type/function names and the exact UI labels
with the documentation agent. Documentation can proceed in parallel using the
conceptual contract, but generated walkthrough references wait for these names.

### Checkpoint 3: independent verification

Each sample agent runs its own formatting, lint, typecheck, unit/integration
tests, publication checks, and build. The developer-docs agent runs its normal
documentation generation and validation suite.

### Checkpoint 4: cross-repository review

Review the three diffs together for these invariants:

- account identity is learned only from validated `/v2/me`;
- the same account reauthorizes in place;
- multiple accounts remain independent;
- active-budget UI and terminology agree;
- no sample suggests parsing a token, keying by a name, or trusting a browser-
  supplied owner/account ID;
- generated documentation points to code that exists on the target branches.

## 5. Definition of done

- Both samples can authorize two budgets, display and switch the active budget,
  and authorize another budget without losing the first.
- Reauthorizing a budget updates its existing connection.
- Every credential lifecycle action is scoped to the active account.
- Both samples retain their original confidential-versus-native security
  boundaries and pass their full validation suites.
- Developer documentation and sample walkthroughs describe the implemented
  behavior consistently.
- No commits, pushes, or generated-doc source-reference updates are made until
  their normal repository review/authorization steps are followed.

## 6. Explicit non-goals

- Building production authentication or a production database schema for the
  confidential teaching sample.
- Synchronizing native connections across devices.
- Discovering all budgets without individual user authorization.
- Changing an existing token's budgeting-account access by editing local state
  or refreshing it.
- Using budget names as unique identities.
