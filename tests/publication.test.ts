import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const forbiddenPreviewHosts = [
  ['api-alpha', 'lunchmoney', 'dev'].join('.'),
  ['alpha', 'lunchmoney', 'dev'].join('.'),
  ['alpha', 'lunchmoney', 'app'].join('.'),
  ['oauth-preview', 'lunchmoney', 'dev'].join('.'),
]

function isPrivateEnvFile(file: string): boolean {
  const base = file.split('/').pop() ?? file
  return /^\.env(?:\.|$)/.test(base) && base !== '.env.example'
}

describe('public repository content', () => {
  it('does not publish Lunch Money preview hostnames', () => {
    const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .filter((file) => !isPrivateEnvFile(file))

    const matches = trackedFiles.flatMap((file) => {
      const contents = readFileSync(file, 'utf8')
      return forbiddenPreviewHosts
        .filter((hostname) => contents.includes(hostname))
        .map((hostname) => `${file}: ${hostname}`)
    })

    expect(matches).toEqual([])
  })

  it('ships placeholder .env.example settings without live values', () => {
    const contents = readFileSync('.env.example', 'utf8')
    const assignment = (name: string): string => {
      const match = contents.match(new RegExp(`^${name}=(.*)$`, 'm'))
      expect(match, `${name} must be present in .env.example`).toBeTruthy()
      return match?.[1] ?? ''
    }

    expect(assignment('OAUTH_CLIENT_ID')).toBe('YOUR_CLIENT_ID')
    expect(assignment('OAUTH_CLIENT_SECRET')).toBe('YOUR_CLIENT_SECRET')
    expect(assignment('OAUTH_REDIRECT_URI')).toBe(
      'http://localhost:4002/oauth/callback',
    )
    expect(assignment('LUNCH_MONEY_API_BASE_URL')).toBe('YOUR_API_BASE_URL')
    expect(contents).toMatch(/^# PORT=/m)
    expect(contents).toMatch(/^# SESSION_SECRET=/m)
  })
})
