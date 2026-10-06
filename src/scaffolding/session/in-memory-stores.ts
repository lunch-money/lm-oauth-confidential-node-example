import type {
  AccountId,
  ApplicationUserId,
  AuthorizationAttempt,
  AuthorizationAttemptStore,
  ConnectionIdentity,
  CredentialStore,
  RefreshCoordinator,
  RefreshOwner,
  LunchMoneyConnection,
} from '../../oauth/index.js'

/**
 * Demonstration-only authorization attempt store. Process restarts discard all
 * attempts; multiple instances do not share state.
 */
export class InMemoryAuthorizationAttemptStore implements AuthorizationAttemptStore {
  private readonly attempts = new Map<string, AuthorizationAttempt>()

  constructor(private readonly now: () => number = Date.now) {}

  async save(attempt: AuthorizationAttempt): Promise<void> {
    this.removeExpired()
    if (attempt.expiresAt <= this.now()) return
    this.attempts.set(attempt.state, attempt)
  }

  async consume(state: string): Promise<AuthorizationAttempt | undefined> {
    const attempt = this.attempts.get(state)
    this.attempts.delete(state)
    this.removeExpired()
    // Security invariant: consumption always deletes the value, including expired attempts, so callbacks cannot replay it.
    if (!attempt || attempt.expiresAt <= this.now()) return undefined
    return attempt
  }

  private removeExpired(): void {
    const now = this.now()
    for (const [state, attempt] of this.attempts) {
      if (attempt.expiresAt <= now) this.attempts.delete(state)
    }
  }
}

/**
 * Demonstration-only credential store. It illustrates the ownership API but is
 * neither durable, encrypted, horizontally shared, nor a production tenant
 * boundary. Real applications must supply all of those properties plus key
 * management and lifecycle cleanup.
 */
export class InMemoryCredentialStore implements CredentialStore {
  private readonly values = new Map<string, LunchMoneyConnection>()

  private key(
    applicationUserId: ApplicationUserId,
    identity: ConnectionIdentity,
  ): string {
    return JSON.stringify([
      applicationUserId,
      identity.lunchMoneyUserId,
      identity.accountId,
    ])
  }

  async get(
    applicationUserId: ApplicationUserId,
    identity: ConnectionIdentity,
  ): Promise<LunchMoneyConnection | undefined> {
    return this.values.get(this.key(applicationUserId, identity))
  }

  async list(
    applicationUserId: ApplicationUserId,
  ): Promise<LunchMoneyConnection[]> {
    return [...this.values.entries()]
      .filter(([key]) => key.startsWith(`["${applicationUserId}",`))
      .map(([, connection]) => connection)
  }

  async upsert(
    applicationUserId: ApplicationUserId,
    connection: LunchMoneyConnection,
  ): Promise<void> {
    this.values.set(this.key(applicationUserId, connection), connection)
  }

  async delete(
    applicationUserId: ApplicationUserId,
    identity: ConnectionIdentity,
  ): Promise<boolean> {
    return this.values.delete(this.key(applicationUserId, identity))
  }
}

/**
 * Demonstration-only process-local refresh exclusion. It rejects overlapping
 * work for one owner/connection while allowing independent connections to run.
 * It is not a distributed lock and does not survive a restart.
 */
export class InMemoryRefreshCoordinator implements RefreshCoordinator {
  private readonly active = new Set<string>()
  private readonly reauthorizationRequired = new Set<string>()

  private key(owner: RefreshOwner): string {
    return JSON.stringify([
      owner.applicationUserId,
      owner.lunchMoneyUserId,
      owner.accountId,
    ])
  }

  async runExclusive<T>(
    owner: RefreshOwner,
    operation: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }> {
    const key = this.key(owner)
    if (this.active.has(key)) return { acquired: false }
    this.active.add(key)
    try {
      return { acquired: true, value: await operation() }
    } finally {
      this.active.delete(key)
    }
  }

  requiresReauthorization(owner: RefreshOwner): boolean {
    return this.reauthorizationRequired.has(this.key(owner))
  }

  markReauthorizationRequired(owner: RefreshOwner): void {
    this.reauthorizationRequired.add(this.key(owner))
  }

  clearReauthorizationRequired(owner: RefreshOwner): void {
    this.reauthorizationRequired.delete(this.key(owner))
  }
}

export interface BrowserSession {
  activeAccountId?: AccountId
  activeLunchMoneyUserId?: number
  authorizationProcessing?: {
    authorizedBudgetCount: number
    budgetName: string
    lunchMoneyUserName: string
    result:
      | 'connected_new_user'
      | 'added_budget'
      | 'reauthorized_budget'
      | 'returned_user'
      | 'switched_user'
  }
  csrfToken: string
  message?: string
  profile?: import('../../oauth/lunch-money-api.js').LunchMoneyProfile
  revocation?: { revoked: boolean; oldCredentialRejected: boolean }
  refresh?: import('../../oauth/refresh.js').RefreshResult
}

/** Demonstration-only browser session storage; restart clears it. */
export class InMemoryBrowserSessionStore {
  private readonly values = new Map<string, BrowserSession>()
  get(id: string): BrowserSession | undefined {
    return this.values.get(id)
  }
  create(id: string, csrfToken: string): BrowserSession {
    const value = { csrfToken }
    this.values.set(id, value)
    return value
  }
  delete(id: string): void {
    this.values.delete(id)
  }
}
