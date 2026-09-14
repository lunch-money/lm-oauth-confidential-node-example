import type {
  ApplicationUserId,
  AuthorizationAttempt,
  AuthorizationAttemptStore,
  ConnectionId,
  CredentialSet,
  CredentialStore,
  RefreshCoordinator,
  RefreshOwner,
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
  private readonly values = new Map<string, CredentialSet>()

  private key(
    applicationUserId: ApplicationUserId,
    connectionId: ConnectionId,
  ): string {
    return JSON.stringify([applicationUserId, connectionId])
  }

  async get(
    applicationUserId: ApplicationUserId,
    connectionId: ConnectionId,
  ): Promise<CredentialSet | undefined> {
    return this.values.get(this.key(applicationUserId, connectionId))
  }

  async replace(
    applicationUserId: ApplicationUserId,
    connectionId: ConnectionId,
    credentials: CredentialSet,
  ): Promise<void> {
    this.values.set(this.key(applicationUserId, connectionId), credentials)
  }

  async delete(
    applicationUserId: ApplicationUserId,
    connectionId: ConnectionId,
  ): Promise<boolean> {
    return this.values.delete(this.key(applicationUserId, connectionId))
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
    return JSON.stringify([owner.applicationUserId, owner.connectionId])
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
