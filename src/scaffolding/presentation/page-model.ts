export interface ConnectionSummary {
  readonly accountId: number
  readonly budgetName: string
}

export interface ProfileView {
  readonly name: string
  readonly email: string
  readonly id: number
  readonly account_id: number
  readonly budget_name: string
  readonly primary_currency: string
  readonly api_key_label: string | null
}

export interface AuthorizationProcessingView {
  readonly authorizedBudgetCount: number
  readonly budgetName: string
  readonly lunchMoneyUserName: string
  readonly open: boolean
  readonly result:
    | 'connected_new_user'
    | 'added_budget'
    | 'reauthorized_budget'
    | 'returned_user'
    | 'switched_user'
}

/** Values that the HTTP layer has approved for server-rendered browser output. */
export interface PageModel {
  readonly activeAccountId?: number
  readonly authorizationProcessing?: AuthorizationProcessingView
  readonly canRefresh: boolean
  readonly connections: readonly ConnectionSummary[]
  readonly csrfToken: string
  readonly message?: string
  readonly profile?: ProfileView
  readonly revocation?: {
    readonly revoked: boolean
    readonly oldCredentialRejected: boolean
  }
  readonly refresh?: { readonly status: string; readonly reason?: string }
}

export interface ResetConfirmationModel {
  readonly budgetName: string
  readonly csrfToken: string
}
