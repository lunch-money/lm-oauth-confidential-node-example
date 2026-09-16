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
 * Prevents two refresh requests from using the same connection's refresh token
 * at the same time.
 *
 * A production implementation must coordinate every server process that can
 * refresh the connection, not just requests handled by one Node.js process.
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
 * Called when a connected user chooses **Refresh access token**. Uses the saved
 * refresh token on the server and replaces the connection's credentials without
 * exposing either the old or new values to the browser.
 *
 * Lunch Money stops accepting the refresh token that was just used, so all new
 * token values must be saved together. If saving them fails, this function does
 * not retry the old token and tells the application to require authorization
 * again.
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
          // Production storage must remember that authorization is required even
          // when deleting the unusable credentials also fails.
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
      // Lunch Money already consumed the old refresh token. Try to delete the
      // unusable credentials and always remember that authorization is required.
      try {
        await store.delete(owner.applicationUserId, owner.connectionId)
      } catch {
        // This process still blocks another refresh from reusing the stale values.
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
