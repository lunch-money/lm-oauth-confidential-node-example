import { readFile, readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('OAuth teaching boundary', () => {
  it('does not import web frameworks, presentation, HTML, or cookie libraries', async () => {
    const directory = new URL('../../src/oauth/', import.meta.url)
    const files = (await readdir(directory)).filter((name) =>
      name.endsWith('.ts'),
    )
    const source = (
      await Promise.all(
        files.map((name) => readFile(new URL(name, directory), 'utf8')),
      )
    ).join('\n')
    expect(source).not.toMatch(
      /from ['"](?:hono|react|vite|tailwindcss|[^'"]*cookie)/,
    )
    expect(source).not.toContain('../scaffolding/')
    expect(source).not.toMatch(/<html|<!doctype/i)
  })
})
