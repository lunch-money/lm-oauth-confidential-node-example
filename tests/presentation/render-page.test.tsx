import { describe, expect, it } from 'vitest'
import {
  renderPage,
  renderResetConfirmation,
} from '../../src/scaffolding/presentation/render-page.js'

describe('static page rendering', () => {
  it('renders a complete static document and escapes every displayed value', () => {
    const html = renderPage({
      activeAccountId: 84,
      canRefresh: false,
      connections: [{ accountId: 84, budgetName: '<script>budget</script>' }],
      csrfToken: 'csrf"><script>token</script>',
      message: '<img src=x onerror=alert(1)>',
      profile: {
        name: '<script>name</script>',
        email: 'demo@example.com',
        id: 42,
        account_id: 84,
        budget_name: '<b>budget</b>',
        primary_currency: 'usd',
        api_key_label: null,
      },
    })
    expect(html).toMatch(/^<!doctype html><html lang="en">/)
    expect(html).toContain('&lt;script&gt;budget&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;script&gt;name&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('react-dom')
    expect(html).not.toContain('__next')
  })

  it('shows only allowlisted profile fields', () => {
    const unexpected = {
      name: 'Demo User',
      email: 'demo@example.com',
      id: 42,
      account_id: 84,
      budget_name: 'Household',
      primary_currency: 'usd',
      api_key_label: null,
      server_only_addition: 'must-not-render',
      accessToken: 'secret-access-token',
      refreshToken: 'secret-refresh-token',
    }
    const html = renderPage({
      activeAccountId: 84,
      canRefresh: false,
      connections: [{ accountId: 84, budgetName: 'Household' }],
      csrfToken: 'csrf',
      profile: {
        name: unexpected.name,
        email: unexpected.email,
        id: unexpected.id,
        account_id: unexpected.account_id,
        budget_name: unexpected.budget_name,
        primary_currency: unexpected.primary_currency,
        api_key_label: unexpected.api_key_label,
      },
    })
    expect(html).toContain('&quot;account_id&quot;: 84')
    expect(html).not.toContain('server_only_addition')
    expect(html).not.toContain('must-not-render')
    expect(html).not.toContain('secret-access-token')
    expect(html).not.toContain('secret-refresh-token')
  })

  it('renders reset as a separate confirmation page with a CSRF-protected POST', () => {
    const html = renderResetConfirmation({
      budgetName: '<Household>',
      csrfToken: 'csrf-value',
    })
    expect(html).toContain('Forget local credential?')
    expect(html).toContain('&lt;Household&gt;')
    expect(html).toContain('action="/reset" method="post"')
    expect(html).toContain('name="csrf_token" value="csrf-value"')
    expect(html).toContain('href="/"')
    expect(html).not.toContain('onsubmit=')
  })
})
