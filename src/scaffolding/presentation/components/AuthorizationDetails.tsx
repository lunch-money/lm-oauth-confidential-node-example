import type { AuthorizationProcessingView } from '../page-model.js'

const sourceRoot =
  'https://github.com/lunch-money/lm-oauth-confidential-node-example/blob/main/'

export function AuthorizationDetails({
  input,
}: {
  readonly input: AuthorizationProcessingView
}): React.JSX.Element {
  const result = {
    connected_new_user: `Showed ${input.lunchMoneyUserName} and the ${input.budgetName} budget.`,
    added_budget: `Added ${input.budgetName} to ${input.lunchMoneyUserName}'s budget selector.`,
    reauthorized_budget: `Replaced the stored authorization for ${input.budgetName}.`,
    returned_user: `Returned to ${input.lunchMoneyUserName} and restored that user's previously authorized budgets from this sample's server-side memory.`,
    switched_user: `Switched to ${input.lunchMoneyUserName} and hid the previous user's budgets. Their credentials remain in this sample's server-side memory until they are disconnected, forgotten, or the sample is restarted.`,
  }[input.result]
  const budgetCount = `${input.authorizedBudgetCount} authorized ${input.authorizedBudgetCount === 1 ? 'budget' : 'budgets'}`

  return (
    <details className="teaching-panel" open={input.open}>
      <summary>How this authorization was processed</summary>
      <ol>
        <li>
          The authorization server called the registered redirect URI. See the{' '}
          <a
            href={`${sourceRoot}src/scaffolding/http/app.ts`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <code>/oauth/callback</code> route
          </a>
          .
        </li>
        <li>
          The callback checked the saved attempt and exchanged the authorization
          code for credentials on the server. See{' '}
          <a
            href={`${sourceRoot}src/oauth/callback.ts`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <code>completeAuthorization</code>
          </a>
          .
        </li>
        <li>
          The server called <code>GET /v2/me</code> with the access token to
          identify the Lunch Money user and budget. See{' '}
          <a
            href={`${sourceRoot}src/oauth/lunch-money-api.ts`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <code>identifyLunchMoneyConnection</code>
          </a>
          .
        </li>
        <li>
          <strong>Result:</strong> {result} The active user now has{' '}
          {budgetCount}.
        </li>
      </ol>
      <div className="credential-inspection">
        <p>
          <strong>Inspect the credential response locally</strong>
        </p>
        <p>
          Set a debugger breakpoint immediately after{' '}
          <code>exchangeCallback()</code> returns in{' '}
          <code>completeAuthorization</code>, then inspect <code>tokenSet</code>
          . This server-only credential value has this shape:
        </p>
        <pre>
          <code>{`{
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scope: string
}`}</code>
        </pre>
        <p className="small">
          The values are never sent to this page. Do not print them or add them
          to browser output. To copy an access token from your local debugger
          and test it without placing it in shell history, follow the{' '}
          <a
            href={`${sourceRoot}docs/WALKTHROUGH.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            walkthrough
          </a>
          .
        </p>
      </div>
    </details>
  )
}
