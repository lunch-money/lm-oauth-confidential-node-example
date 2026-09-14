import type { LunchMoneyProfile } from '../../oauth/lunch-money-api.js'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Renders the deliberately small, dependency-free demonstration interface. */
export function page(input: {
  csrfToken: string
  canRefresh: boolean
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Lunch Money confidential OAuth example</title><link rel="stylesheet" href="/styles.css"></head><body><main><h1>Lunch Money confidential OAuth example</h1><p>OAuth credentials stay on this Node.js server.</p>${message}${refresh}${revocation}${profile}<div class="actions"><form method="post" action="/oauth/start">${csrf}<button>Connect Lunch Money</button></form><form method="post" action="/me">${csrf}<button>Call /v2/me</button></form>${refreshForm}<form method="post" action="/revoke">${csrf}<button>Revoke and verify</button></form><form method="post" action="/reset">${csrf}<button class="secondary">Local reset only</button></form></div><p class="small">Local reset deletes this sample's local credential. It does not revoke access at Lunch Money.</p></main></body></html>`
}
