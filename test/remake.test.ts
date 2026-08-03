import { type Command, Config } from '@oclif/core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Remake from '../src/commands/remake'
import { run } from '../src/lib/core'
import { buildApp, installApp, pakeCliVersion } from '../src/lib/pake'

// Same strategy as commands.test.ts: a temporary registry and a mocked pake
// layer. On top of that, `run` is mocked so the "pnpm add pake-cli@latest"
// never actually runs.
const holder = vi.hoisted(() => ({ apps: '', state: '' }))

vi.mock('../src/lib/core', async (importActual) => {
  const actual = await importActual<typeof import('../src/lib/core')>()
  return {
    ...actual,
    bumpAppVersion: (id: string, release: string, log: (msg: string) => void) =>
      actual.bumpAppVersion(id, release, log, holder.apps),
    readApp: (id: string) => actual.readApp(id, holder.apps),
    run: vi.fn(() => true),
    selectApps: (ids: string[]) => actual.selectApps(ids, holder.apps),
  }
})

vi.mock('../src/lib/pake', () => ({
  buildApp: vi.fn(),
  installApp: vi.fn(),
  pakeCliVersion: vi.fn(() => '3.0.0'),
  uninstallApp: vi.fn(),
}))

const runMock = vi.mocked(run)
const buildMock = vi.mocked(buildApp)
const installMock = vi.mocked(installApp)
const versionMock = vi.mocked(pakeCliVersion)

let config: Config
let tmp: string

beforeAll(async () => {
  config = await Config.load(process.cwd())
})

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pake-remake-'))
  holder.apps = path.join(tmp, 'apps')
  holder.state = path.join(tmp, 'state.json')
  fs.mkdirSync(holder.apps, { recursive: true })
  vi.clearAllMocks()
  runMock.mockReturnValue(true)
  versionMock.mockReturnValue('3.0.0')
})

afterEach(() => {
  fs.rmSync(tmp, { force: true, recursive: true })
})

interface Captured {
  logs: string[]
  warns: string[]
}

async function runRemake(argv: string[]): Promise<Captured> {
  const cmd: Command = new Remake(argv, config)
  const captured: Captured = { logs: [], warns: [] }
  vi.spyOn(cmd, 'log').mockImplementation((msg = '') => {
    captured.logs.push(msg)
  })
  vi.spyOn(cmd, 'warn').mockImplementation((input) => {
    captured.warns.push(String(input))
    return input
  })
  try {
    await cmd.run()
  } catch (error) {
    throw Object.assign(error as Error, { captured })
  }
  return captured
}

function seedApp(id: string, appVersion = '1.0.0'): void {
  fs.writeFileSync(
    path.join(holder.apps, `${id}.json`),
    `${JSON.stringify({ appVersion, name: id, url: `https://${id}.com` }, null, 2)}\n`,
  )
}

function seededVersion(id: string): string {
  return JSON.parse(fs.readFileSync(path.join(holder.apps, `${id}.json`), 'utf8')).appVersion
}

describe('remake', () => {
  it('updates pake-cli, bumps and builds every app', async () => {
    seedApp('slack')
    seedApp('figma')
    versionMock.mockReturnValueOnce('3.0.0').mockReturnValue('3.1.0')

    const { logs } = await runRemake([])

    expect(runMock).toHaveBeenCalledWith(
      'pnpm',
      ['add', '-D', 'pake-cli@latest'],
      expect.objectContaining({ cwd: expect.any(String) }),
    )
    expect(logs).toContain('OK pake-cli: v3.0.0 -> v3.1.0')
    expect(buildMock.mock.calls.map(([app]) => app.id)).toEqual(['figma', 'slack'])
    expect(installMock).not.toHaveBeenCalled()
    expect(seededVersion('slack')).toBe('1.0.1')
    expect(logs.at(-1)).toBe('\nSummary: 2 OK (figma, slack)')
  })

  it('detects when pake-cli was already on the latest version', async () => {
    seedApp('slack')
    const { logs } = await runRemake(['slack'])
    expect(logs).toContain('OK pake-cli was already at v3.0.0')
  })

  it('with --no-upgrade it does not run pnpm', async () => {
    seedApp('slack')
    await runRemake(['slack', '--no-upgrade'])
    expect(runMock).not.toHaveBeenCalled()
    expect(buildMock).toHaveBeenCalledTimes(1)
  })

  it('fails when pake-cli cannot be updated and leaves the apps untouched', async () => {
    seedApp('slack')
    runMock.mockReturnValue(false)
    await expect(runRemake(['slack'])).rejects.toThrow('could not update pake-cli')
    expect(buildMock).not.toHaveBeenCalled()
    expect(seededVersion('slack')).toBe('1.0.0')
  })

  it('with --no-bump it builds without touching the version', async () => {
    seedApp('slack')
    await runRemake(['slack', '--no-upgrade', '--no-bump'])
    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(seededVersion('slack')).toBe('1.0.0')
  })

  it('with --install it installs instead of only building', async () => {
    seedApp('slack')
    await runRemake(['slack', '--no-upgrade', '--install'])
    expect(installMock).toHaveBeenCalledTimes(1)
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('honors --release for the bump', async () => {
    seedApp('slack', '1.2.3')
    await runRemake(['slack', '--no-upgrade', '--release', 'minor'])
    expect(seededVersion('slack')).toBe('1.3.0')
  })

  it('carries on with the rest when one app fails and sums up the failures', async () => {
    seedApp('slack')
    seedApp('figma')
    buildMock.mockImplementation((app) => {
      if (app.id === 'slack') {
        throw new Error('boom')
      }
      return '/tmp/Figma.app'
    })

    const failure = (await runRemake(['--no-upgrade']).catch(
      (error: unknown) => error,
    )) as Error & {
      captured: Captured
    }
    expect(failure.message).toContain('1 app(s) failed: slack')
    expect(failure.captured.warns).toEqual(['slack: boom'])
    expect(failure.captured.logs).toContain('\nSummary: 1 OK (figma)')
    expect(buildMock).toHaveBeenCalledTimes(2)
  })
})
