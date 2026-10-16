import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Page } from '../../src/scaffolding/presentation/Page.js'
import type { PageModel } from '../../src/scaffolding/presentation/page-model.js'

const baseModel: PageModel = {
  canRefresh: false,
  connections: [],
  csrfToken: 'csrf-value',
}

function render(model: PageModel): string {
  return renderToStaticMarkup(<Page model={model} />)
}

describe('Page', () => {
  it('renders a disconnected page with only the authorization action', () => {
    const html = render(baseModel)
    expect(html).toContain('No Lunch Money budget is connected.')
    expect(html).toContain('Connect Lunch Money')
    expect(html).not.toContain('Call /v2/me')
    expect(html).not.toContain('Refresh access token')
  })

  it('renders one connected budget and every applicable server action', () => {
    const html = render({
      ...baseModel,
      activeAccountId: 84,
      canRefresh: true,
      connections: [{ accountId: 84, budgetName: 'Household' }],
    })
    expect(html).toContain('<h2>Active budget</h2>')
    expect(html).toContain('Household')
    expect(html).toContain('Call /v2/me')
    expect(html).toContain('Refresh access token')
    expect(html).toContain('Disconnect active budget')
    expect(html).toContain('action="/reset/confirm"')
    expect(html).not.toContain('action="/connections/active"')
  })

  it('renders an explicit budget-switch submit control and qualifies duplicate names', () => {
    const html = render({
      ...baseModel,
      activeAccountId: 91,
      connections: [
        { accountId: 84, budgetName: 'Shared' },
        { accountId: 91, budgetName: 'Shared' },
      ],
    })
    expect(html).toContain('action="/connections/active"')
    expect(html).toContain('Switch active budget')
    expect(html).toContain('Shared · account 84')
    expect(html).toContain('Shared · account 91')
    expect(html).not.toContain('onchange=')
  })

  it('renders processing, refresh, revocation, and open or collapsed details', () => {
    const openHtml = render({
      ...baseModel,
      activeAccountId: 84,
      connections: [{ accountId: 84, budgetName: 'Household' }],
      authorizationProcessing: {
        authorizedBudgetCount: 1,
        budgetName: 'Household',
        lunchMoneyUserName: 'Demo User',
        open: true,
        result: 'connected_new_user',
      },
      refresh: { status: 'refreshed' },
      revocation: { revoked: true, oldCredentialRejected: true },
    })
    expect(openHtml).toContain('<details class="teaching-panel" open="">')
    expect(openHtml).toContain('Refresh result: refreshed.')
    expect(openHtml).toContain('Revoked: true. Old token rejected: true.')

    const collapsedHtml = render({
      ...baseModel,
      authorizationProcessing: {
        authorizedBudgetCount: 2,
        budgetName: 'Savings',
        lunchMoneyUserName: 'Demo User',
        open: false,
        result: 'added_budget',
      },
    })
    expect(collapsedHtml).toContain('<details class="teaching-panel">')
    expect(collapsedHtml).not.toContain('open=""')
  })

  it('puts the session CSRF token in every state-changing form', () => {
    const html = render({
      ...baseModel,
      activeAccountId: 91,
      canRefresh: true,
      connections: [
        { accountId: 84, budgetName: 'Household' },
        { accountId: 91, budgetName: 'Savings' },
      ],
    })
    const postForms = [
      ...html.matchAll(/<form[^>]*method="post"[^>]*>[\s\S]*?<\/form>/g),
    ]
    expect(postForms).toHaveLength(5)
    for (const form of postForms) {
      expect(form[0]).toContain('name="csrf_token" value="csrf-value"')
    }
  })
})
