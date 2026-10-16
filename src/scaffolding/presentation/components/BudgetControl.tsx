import type { ConnectionSummary } from '../page-model.js'

export function BudgetControl({
  activeAccountId,
  connections,
  csrfToken,
}: {
  readonly activeAccountId: number | undefined
  readonly connections: readonly ConnectionSummary[]
  readonly csrfToken: string
}): React.JSX.Element {
  const active = connections.find(
    (connection) => connection.accountId === activeAccountId,
  )
  if (!active) return <p>No Lunch Money budget is connected.</p>
  if (connections.length === 1) {
    return (
      <section aria-label="Active budget">
        <h2>Active budget</h2>
        <p className="success">{active.budgetName}</p>
      </section>
    )
  }

  const duplicateNames = new Set(
    connections
      .map((connection) => connection.budgetName)
      .filter(
        (name, index, names) =>
          names.indexOf(name) !== index || names.lastIndexOf(name) !== index,
      ),
  )

  return (
    <section aria-label="Active budget">
      <h2>Active budget</h2>
      <form
        className="success budget-selector"
        method="post"
        action="/connections/active"
      >
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <label htmlFor="account_id">Authorized budget</label>
        <select
          id="account_id"
          name="account_id"
          defaultValue={active.accountId}
        >
          {connections.map((connection) => {
            const label = duplicateNames.has(connection.budgetName)
              ? `${connection.budgetName} · account ${connection.accountId}`
              : connection.budgetName
            return (
              <option key={connection.accountId} value={connection.accountId}>
                {label}
              </option>
            )
          })}
        </select>
        <button type="submit">Switch active budget</button>
      </form>
    </section>
  )
}
