import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const runCli = (args: string[]) => {
  try {
    return {
      code: 0,
      stderr: execFileSync('node', ['--import', 'tsx', 'src/cli.ts', ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    }
  } catch (error) {
    const err = error as { status?: number; stderr?: Buffer | string }
    return { code: err.status ?? 1, stderr: String(err.stderr ?? '') }
  }
}

describe('cli error output', () => {
  it('unknown command prints a friendly message without a stack trace', () => {
    const { stderr, code } = runCli(['comando-invalido'])
    expect(stderr).toContain('command comando-invalido not found')
    expect(stderr).not.toMatch(/^\s+at /m)
    expect(code).toBe(2)
  })

  it('unknown flag prints a friendly message without a stack trace', () => {
    const { stderr } = runCli(['add', '--flag-inexistente'])
    expect(stderr).toContain('Nonexistent flag: --flag-inexistente')
    expect(stderr).not.toMatch(/^\s+at /m)
  })
})
