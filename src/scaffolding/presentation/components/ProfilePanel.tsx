import type { ProfileView } from '../page-model.js'

export function ProfilePanel({
  profile,
}: {
  readonly profile: ProfileView | undefined
}): React.JSX.Element {
  if (!profile)
    return <p>No profile has been loaded in this browser session.</p>

  return (
    <>
      <h2>GET /v2/me</h2>
      <pre>{JSON.stringify(profile, null, 2)}</pre>
    </>
  )
}
