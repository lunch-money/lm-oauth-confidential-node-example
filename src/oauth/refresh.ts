import { OAuthError, RefreshProtocolError } from './errors.js'
import type { CredentialStore } from './tokens.js'
import type {
  ApplicationUserId,
  ConnectionId,
  OAuthProtocolClient,
} from './types.js'

export interface RefreshOwner {
  readonly applicationUserId: ApplicationUserId
  readonly connectionId: ConnectionId
}

/** Safe refresh outcomes; none contains a token or provider response. */
export type RefreshResult =
  | { readonly status: 'refreshed' }
  | { readonly status: 'refresh_not_available' }
  | { readonly status: 'refresh_in_progress' }
  | {
      readonly status: 'reauthorization_required'
      readonly reason: 'invalid_grant' | 'replacement_not_saved'
    }

/**
 * Narrow, replaceable per-connection exclusion boundary.
 *
 * Production implementations need a distributed lock or equivalent operation
 * serialization spanning every process that can refresh the same grant.
 */
export interface RefreshCoordinator {
  runExclusive<T>(
    owner: RefreshOwner,
    operation: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }>
  requiresReauthorization(owner: RefreshOwner): boolean
  markReauthorizationRequired(owner: RefreshOwner): void
  clearReauthorizationRequired(owner: RefreshOwner): void
}

/**
 * Rotates one connection's credentials without exposing them to the browser.
 *
 * A successful provider response is persisted as one complete replacement set.
 * If that write fails, the old refresh token has already been consumed: this
 * function never restores or retries it and instead requires reauthorization.
 */
export async function refreshConnection(
  protocol: OAuthProtocolClient,
  store: CredentialStore,
  coordinator: RefreshCoordinator,
  owner: RefreshOwner,
): Promise<RefreshResult> {
  if (coordinator.requiresReauthorization(owner))
    return {
      status: 'reauthorization_required',
      reason: 'replacement_not_saved',
    }

  const coordinated = await coordinator.runExclusive(owner, async () => {
    const current = await store.get(owner.applicationUserId, owner.connectionId)
    if (!current?.refreshToken)
      return { status: 'refresh_not_available' } as const

    let replacement
    try {
      replacement = await protocol.refresh(current)
    } catch (cause) {
      if (
        cause instanceof RefreshProtocolError &&
        (cause.kind === 'invalid_grant' || cause.kind === 'malformed_response')
      ) {
        // Security invariant: invalid_grant may mean expiry, revocation, or replay;
        // never retry it or reveal which provider condition occurred.
        try {
          await store.delete(owner.applicationUserId, owner.connectionId)
        } catch {
          // A durable production terminal marker must survive a failed cleanup.
        } finally {
          coordinator.markReauthorizationRequired(owner)
        }
        return {
          status: 'reauthorization_required',
          reason: 'invalid_grant',
        } as const
      }
      throw new OAuthError(
        'refresh_temporarily_unavailable',
        'Lunch Money access could not be refreshed. Please try again later.',
        cause,
      )
    }

    try {
      // Security invariant: access token, rotated refresh token, expiration, and
      // scope metadata cross the storage boundary as one complete value.
      await store.replace(
        owner.applicationUserId,
        owner.connectionId,
        replacement,
      )
      return { status: 'refreshed' } as const
    } catch {
      // The provider already consumed the old refresh token. Best-effort deletion
      // prevents reuse; the coordinator also poisons this connection if deletion fails.
      try {
        await store.delete(owner.applicationUserId, owner.connectionId)
      } catch {
        // The exclusion boundary prevents this process from reusing the stale set.
      } finally {
        coordinator.markReauthorizationRequired(owner)
      }
      return {
        status: 'reauthorization_required',
        reason: 'replacement_not_saved',
      } as const
    }
  })

  return coordinated.acquired
    ? coordinated.value
    : { status: 'refresh_in_progress' }
}
