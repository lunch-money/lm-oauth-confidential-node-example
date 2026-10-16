import { AuthorizationDetails } from './components/AuthorizationDetails.js'
import { BudgetControl } from './components/BudgetControl.js'
import { ConnectionActions } from './components/ConnectionActions.js'
import { ProfilePanel } from './components/ProfilePanel.js'
import type { PageModel, ResetConfirmationModel } from './page-model.js'

function Document({
  children,
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <title>Lunch Money confidential OAuth example</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}

export function Page({
  model,
}: {
  readonly model: PageModel
}): React.JSX.Element {
  const connected = model.connections.some(
    (connection) => connection.accountId === model.activeAccountId,
  )
  return (
    <Document>
      <h1>Lunch Money confidential OAuth example</h1>
      <p>OAuth credentials stay on this Node.js server.</p>
      {model.message ? <p className="notice">{model.message}</p> : null}
      <BudgetControl
        activeAccountId={model.activeAccountId}
        connections={model.connections}
        csrfToken={model.csrfToken}
      />
      {model.authorizationProcessing ? (
        <AuthorizationDetails input={model.authorizationProcessing} />
      ) : null}
      {model.refresh ? (
        <p className="success">
          Refresh result: {model.refresh.status.replaceAll('_', ' ')}.
        </p>
      ) : null}
      {model.revocation ? (
        <p className="success">
          Revoked: {String(model.revocation.revoked)}. Old token rejected:{' '}
          {String(model.revocation.oldCredentialRejected)}.
        </p>
      ) : null}
      <ProfilePanel profile={model.profile} />
      <ConnectionActions
        connected={connected}
        canRefresh={model.canRefresh}
        csrfToken={model.csrfToken}
      />
      <p className="small">
        After every authorization, the sample uses /v2/me to identify the Lunch
        Money user and shows only that user&apos;s authorized budgets.
      </p>
      <p className="small">
        Local reset deletes only the active budget&apos;s local credential. It
        does not revoke access at Lunch Money.
      </p>
    </Document>
  )
}

export function ResetConfirmationPage({
  model,
}: {
  readonly model: ResetConfirmationModel
}): React.JSX.Element {
  return (
    <Document>
      <h1>Forget local credential?</h1>
      <p>
        This removes <strong>{model.budgetName}</strong> from this sample&apos;s
        server memory. It does not revoke access at Lunch Money.
      </p>
      <div className="actions">
        <form method="post" action="/reset">
          <input type="hidden" name="csrf_token" value={model.csrfToken} />
          <button className="secondary">Forget local credential</button>
        </form>
        <a className="button-link" href="/">
          Cancel
        </a>
      </div>
    </Document>
  )
}
