import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const forbiddenPreviewHosts = [
  ['api-alpha', 'lunchmoney', 'dev'].join('.'),
  ['alpha', 'lunchmoney', 'dev'].join('.'),
  ['alpha', 'lunchmoney', 'app'].join('.'),
  ['oauth-preview', 'lunchmoney', 'dev'].join('.'),
]

describe('public repository content', () => {
  it('does not publish Lunch Money preview hostnames', () => {
    const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .filter((file) => !/(^|\/)\.env(?:\.|$)/.test(file))

    const matches = trackedFiles.flatMap((file) => {
      const contents = readFileSync(file, 'utf8')
      return forbiddenPreviewHosts
        .filter((hostname) => contents.includes(hostname))
        .map((hostname) => `${file}: ${hostname}`)
    })

    expect(matches).toEqual([])
  })
})
