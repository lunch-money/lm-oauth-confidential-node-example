function CsrfInput({ token }: { readonly token: string }): React.JSX.Element {
  return <input type="hidden" name="csrf_token" value={token} />
}

export function ConnectionActions({
  connected,
  canRefresh,
  csrfToken,
}: {
  readonly connected: boolean
  readonly canRefresh: boolean
  readonly csrfToken: string
}): React.JSX.Element {
  return (
    <div className="actions">
      <form method="post" action="/oauth/start">
        <CsrfInput token={csrfToken} />
        <button>
          {connected ? 'Authorize another budget' : 'Connect Lunch Money'}
        </button>
      </form>
      {connected ? (
        <>
          <form method="post" action="/me">
            <CsrfInput token={csrfToken} />
            <button>Call /v2/me</button>
          </form>
          {canRefresh ? (
            <form method="post" action="/refresh">
              <CsrfInput token={csrfToken} />
              <button>Refresh access token</button>
            </form>
          ) : null}
          <form method="post" action="/revoke">
            <CsrfInput token={csrfToken} />
            <button>Disconnect active budget</button>
          </form>
          <form method="get" action="/reset/confirm">
            <button className="secondary">Forget local credential only</button>
          </form>
        </>
      ) : null}
    </div>
  )
}
