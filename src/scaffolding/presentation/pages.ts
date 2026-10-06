import type { LunchMoneyProfile } from '../../oauth/lunch-money-api.js'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Renders the deliberately small, dependency-free demonstration interface. */
export function page(input: {
  activeAccountId?: number
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
  canRefresh: boolean
  connections: Array<{ accountId: number; budgetName: string }>
  message?: string
  profile?: LunchMoneyProfile
  revocation?: { revoked: boolean; oldCredentialRejected: boolean }
  refresh?: { status: string; reason?: string }
}): string {
  const message = input.message
    ? `<p class="notice">${escapeHtml(input.message)}</p>`
    : ''
  const profile = input.profile
    ? `<h2>GET /v2/me</h2><pre>${escapeHtml(JSON.stringify(input.profile, null, 2))}</pre>`
    : '<p>No profile has been loaded in this browser session.</p>'
  const revocation = input.revocation
    ? `<p class="success">Revoked: ${String(input.revocation.revoked)}. Old token rejected: ${String(input.revocation.oldCredentialRejected)}.</p>`
    : ''
  const csrf = `<input type="hidden" name="csrf_token" value="${escapeHtml(input.csrfToken)}">`
  const refresh = input.refresh
    ? `<p class="success">Refresh result: ${escapeHtml(input.refresh.status.replaceAll('_', ' '))}.</p>`
    : ''
  const refreshForm = input.canRefresh
    ? `<form method="post" action="/refresh">${csrf}<button>Refresh access token</button></form>`
    : ''
  const active = input.connections.find(
    (connection) => connection.accountId === input.activeAccountId,
  )
  const duplicateNames = new Set(
    input.connections
      .map((connection) => connection.budgetName)
      .filter(
        (name, index, names) =>
          names.indexOf(name) !== index || names.lastIndexOf(name) !== index,
      ),
  )
  const budgetControl = active
    ? input.connections.length === 1
      ? `<section aria-label="Active budget"><h2>Active budget</h2><p class="success">${escapeHtml(active.budgetName)}</p></section>`
      : `<section aria-label="Active budget"><h2>Active budget</h2><form class="success" method="post" action="/connections/active">${csrf}<select aria-label="Active budget" id="account_id" name="account_id" onchange="this.form.submit()">${input.connections
          .map((connection) => {
            const qualifiers: string[] = []
            if (duplicateNames.has(connection.budgetName)) {
              qualifiers.push(`account ${connection.accountId}`)
            }
            const label = [connection.budgetName, ...qualifiers].join(' · ')
            return `<option value="${connection.accountId}"${connection.accountId === active.accountId ? ' selected' : ''}>${escapeHtml(label)}</option>`
          })
          .join('')}</select></form></section>`
    : '<p>No Lunch Money budget is connected.</p>'
  const connectedActions = active
    ? `<form method="post" action="/me">${csrf}<button>Call /v2/me</button></form>${refreshForm}<form method="post" action="/revoke">${csrf}<button>Disconnect active budget</button></form><form method="post" action="/reset" onsubmit="return confirm('Forget this local credential without revoking access at Lunch Money?')">${csrf}<button class="secondary">Forget local credential only</button></form>`
    : ''
  const connectLabel = active
    ? 'Authorize another budget'
    : 'Connect Lunch Money'
  const processing = input.authorizationProcessing
    ? authorizationProcessingPanel(input.authorizationProcessing)
    : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Lunch Money confidential OAuth example</title><link rel="stylesheet" href="/styles.css"></head><body><main><h1>Lunch Money confidential OAuth example</h1><p>OAuth credentials stay on this Node.js server.</p>${message}${budgetControl}${processing}${refresh}${revocation}${profile}<div class="actions"><form method="post" action="/oauth/start">${csrf}<button>${connectLabel}</button></form>${connectedActions}</div><p class="small">After every authorization, the sample uses /v2/me to identify the Lunch Money user and shows only that user's authorized budgets.</p><p class="small">Local reset deletes only the active budget's local credential. It does not revoke access at Lunch Money.</p></main></body></html>`
}

function authorizationProcessingPanel(input: {
  authorizedBudgetCount: number
  budgetName: string
  lunchMoneyUserName: string
  result:
    | 'connected_new_user'
    | 'added_budget'
    | 'reauthorized_budget'
    | 'returned_user'
    | 'switched_user'
}): string {
  const result = {
    connected_new_user: `Showed ${input.lunchMoneyUserName} and the ${input.budgetName} budget.`,
    added_budget: `Added ${input.budgetName} to ${input.lunchMoneyUserName}'s budget selector.`,
    reauthorized_budget: `Replaced the stored authorization for ${input.budgetName}.`,
    returned_user: `Returned to ${input.lunchMoneyUserName} and restored that user's previously authorized budgets from this sample's server-side memory.`,
    switched_user: `Switched to ${input.lunchMoneyUserName} and hid the previous user's budgets. Their credentials remain in this sample's server-side memory until they are disconnected, forgotten, or the sample is restarted.`,
  }[input.result]
  const budgetCount = `${input.authorizedBudgetCount} authorized ${input.authorizedBudgetCount === 1 ? 'budget' : 'budgets'}`

  return `<details class="teaching-panel" open><summary>How this authorization was processed</summary><ol><li>The authorization server called the registered redirect URI. See the <a href="https://github.com/lunch-money/lm-oauth-confidential-node-example/blob/main/src/scaffolding/http/app.ts" target="_blank" rel="noopener noreferrer"><code>/oauth/callback</code> route</a>.</li><li>The callback validated the saved attempt and exchanged the authorization code for credentials on the server. See <a href="https://github.com/lunch-money/lm-oauth-confidential-node-example/blob/main/src/oauth/callback.ts" target="_blank" rel="noopener noreferrer"><code>completeAuthorization</code></a>.</li><li>The server called <code>GET /v2/me</code> with the access token to identify the Lunch Money user and budget. See <a href="https://github.com/lunch-money/lm-oauth-confidential-node-example/blob/main/src/oauth/lunch-money-api.ts" target="_blank" rel="noopener noreferrer"><code>identifyLunchMoneyConnection</code></a>.</li><li><strong>Result:</strong> ${escapeHtml(result)} The active user now has ${escapeHtml(budgetCount)}.</li></ol><div class="credential-inspection"><p><strong>Inspect the credential response locally</strong></p><p>Set a debugger breakpoint immediately after <code>exchangeCallback()</code> returns in <code>completeAuthorization</code>, then inspect <code>tokenSet</code>. The normalized server-confidential value has this shape:</p><pre><code>{
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scope: string
}</code></pre><p class="small">The values are never sent to this page. Do not print them or add them to browser output. To copy an access token from your local debugger and test it without placing it in shell history, follow the <a href="https://github.com/lunch-money/lm-oauth-confidential-node-example/blob/main/docs/WALKTHROUGH.md" target="_blank" rel="noopener noreferrer">walkthrough</a>.</p></div></details>`
}
