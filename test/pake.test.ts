import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appFile, PAKE_BIN, readState } from '../src/lib/core'
import {
  buildApp,
  injectArgs,
  installApp,
  pakeCliVersion,
  resolveBundle,
  uninstallApp,
} from '../src/lib/pake'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))

const spawnMock = vi.mocked(spawnSync)

const app = { appVersion: '2.0.0', id: 'demo', name: 'Demo', url: 'https://demo.com' }

function ok(result: Record<string, unknown> = {}) {
  return { error: undefined, status: 0, stdout: '', ...result } as ReturnType<typeof spawnSync>
}

function pakeSuccess(outputs: { format: string; path: string }[]) {
  return ok({ stdout: JSON.stringify({ ok: true, outputs }) })
}

let tmp: string
let distDir: string
let stateFile: string
let applicationsDir: string
const silent = () => {}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pake-lib-'))
  distDir = path.join(tmp, 'dist')
  stateFile = path.join(distDir, 'state.json')
  applicationsDir = path.join(tmp, 'Applications')
  fs.mkdirSync(distDir, { recursive: true })
  fs.mkdirSync(applicationsDir, { recursive: true })
  spawnMock.mockReturnValue(ok())
})

afterEach(() => {
  fs.rmSync(tmp, { force: true, recursive: true })
  spawnMock.mockReset()
})

describe('pakeCliVersion', () => {
  it('returns the installed pake-cli version', () => {
    expect(pakeCliVersion()).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('resolveBundle', () => {
  it('prefers a direct .app from the outputs', () => {
    expect(resolveBundle('/tmp/out', [{ format: 'app', path: '/tmp/out/Demo.app' }])).toBe(
      '/tmp/out/Demo.app',
    )
  })

  it('prefers the direct .app even when there is also a .dmg', () => {
    const outputs = [
      { format: 'dmg', path: '/tmp/out/demo.dmg' },
      { format: 'app', path: '/tmp/out/Demo.app' },
    ]
    expect(resolveBundle('/tmp/out', outputs)).toBe('/tmp/out/Demo.app')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('looks for a .app in the directory when there are no outputs', () => {
    const outDir = path.join(tmp, 'out')
    fs.mkdirSync(path.join(outDir, 'Demo.app'), { recursive: true })
    expect(resolveBundle(outDir, [])).toBe(path.join(outDir, 'Demo.app'))
  })

  it('throws when there is no .app at all', () => {
    expect(() => resolveBundle(path.join(tmp, 'empty'), [])).toThrow('no .app found in')
  })

  it('extracts the .app from a .dmg by mounting it with hdiutil', () => {
    const outDir = path.join(tmp, 'dmg')
    fs.mkdirSync(outDir, { recursive: true })
    spawnMock.mockImplementation(((cmd: string, args: string[]) => {
      if (cmd === 'hdiutil' && args[0] === 'attach') {
        const mountPoint = args[args.indexOf('-mountpoint') + 1]
        fs.mkdirSync(path.join(mountPoint, 'Demo.app'), { recursive: true })
      }
      return ok()
    }) as typeof spawnSync)

    const bundle = resolveBundle(outDir, [{ format: 'dmg', path: path.join(outDir, 'demo.dmg') }])
    expect(bundle).toBe(path.join(outDir, 'Demo.app'))
    expect(fs.existsSync(path.join(outDir, '.mnt'))).toBe(false)
  })

  it('throws when the .dmg cannot be mounted', () => {
    const outDir = path.join(tmp, 'dmg-mount-failure')
    fs.mkdirSync(outDir, { recursive: true })
    spawnMock.mockImplementation((cmd: string) => (cmd === 'hdiutil' ? ok({ status: 1 }) : ok()))

    expect(() =>
      resolveBundle(outDir, [{ format: 'dmg', path: path.join(outDir, 'demo.dmg') }]),
    ).toThrow('could not mount')
  })

  it('throws when the .dmg contains no .app', () => {
    const outDir = path.join(tmp, 'dmg-empty')
    fs.mkdirSync(outDir, { recursive: true })

    expect(() =>
      resolveBundle(outDir, [{ format: 'dmg', path: path.join(outDir, 'demo.dmg') }]),
    ).toThrow('no .app found inside')
  })

  it('throws when copying the .app out of the .dmg fails', () => {
    const outDir = path.join(tmp, 'dmg-ditto')
    fs.mkdirSync(outDir, { recursive: true })
    spawnMock.mockImplementation(((cmd: string, args: string[]) => {
      if (cmd === 'hdiutil' && args[0] === 'attach') {
        const mountPoint = args[args.indexOf('-mountpoint') + 1]
        fs.mkdirSync(path.join(mountPoint, 'Demo.app'), { recursive: true })
      }
      return cmd === 'ditto' ? ok({ status: 1 }) : ok()
    }) as typeof spawnSync)

    expect(() =>
      resolveBundle(outDir, [{ format: 'dmg', path: path.join(outDir, 'demo.dmg') }]),
    ).toThrow('could not extract')
  })
})

describe('injectArgs', () => {
  it('returns an empty list when the app injects nothing', () => {
    expect(injectArgs(app)).toEqual([])
  })

  it('resolves each name against apps/inject/', () => {
    const dir = path.join(tmp, 'inject')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'one.js'), '')
    fs.writeFileSync(path.join(dir, 'two.js'), '')

    expect(injectArgs({ ...app, inject: ['one.js', 'two.js'] }, dir)).toEqual([
      '--inject',
      path.join(dir, 'one.js'),
      '--inject',
      path.join(dir, 'two.js'),
    ])
  })

  it('throws when the snippet does not exist', () => {
    expect(() => injectArgs({ ...app, inject: ['missing.js'] }, path.join(tmp, 'inject'))).toThrow(
      'injects "missing.js" but',
    )
  })

  it('throws when inject is not a list of strings', () => {
    expect(() => injectArgs({ ...app, inject: 'one.js' })).toThrow('must be a list of file names')
  })
})

describe('buildApp', () => {
  it('invokes pake with the url, the config, the version and --json in dist/<id>', () => {
    const bundlePath = path.join(distDir, 'demo', 'Demo.app')
    spawnMock.mockReturnValue(pakeSuccess([{ format: 'app', path: bundlePath }]))

    buildApp(app, { distDir, log: silent, stateFile })
    const [cmd, args, options] = spawnMock.mock.calls[0] as [string, string[], { cwd: string }]
    expect(cmd).toBe(PAKE_BIN)
    expect(args).toEqual([
      'https://demo.com',
      '--config',
      appFile('demo'),
      '--app-version',
      '2.0.0',
      '--json',
    ])
    expect(options.cwd).toBe(path.join(distDir, 'demo'))
  })

  it('uses 1.0.0 as the version when the app defines no appVersion', () => {
    const bundlePath = path.join(distDir, 'demo', 'Demo.app')
    spawnMock.mockReturnValue(pakeSuccess([{ format: 'app', path: bundlePath }]))

    buildApp(
      { id: 'demo', name: 'Demo', url: 'https://demo.com' },
      { distDir, log: silent, stateFile },
    )
    const [, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(args).toContain('1.0.0')
    expect(readState(stateFile).demo?.version).toBe('1.0.0')
  })

  it('saves the state and returns the bundle when the build succeeds', () => {
    const bundlePath = path.join(distDir, 'demo', 'Demo.app')
    spawnMock.mockReturnValue(pakeSuccess([{ format: 'app', path: bundlePath }]))

    const bundle = buildApp(app, { distDir, log: silent, stateFile })
    expect(bundle).toBe(bundlePath)
    expect(readState(stateFile).demo).toMatchObject({ bundle: 'Demo.app', version: '2.0.0' })
  })

  it('throws when pake returns ok:false with a code and a hint', () => {
    spawnMock.mockReturnValue(
      ok({
        stdout: JSON.stringify({
          error: { code: 'INVALID_URL', hint: 'check the url', message: 'bad url' },
          ok: false,
        }),
      }),
    )
    expect(() => buildApp(app, { distDir, log: silent, stateFile })).toThrow(
      'build of "demo" failed [INVALID_URL]: bad url (check the url)',
    )
  })

  it('throws a generic error when pake returns ok:false with no detail', () => {
    spawnMock.mockReturnValue(ok({ stdout: JSON.stringify({ ok: false }) }))
    expect(() => buildApp(app, { distDir, log: silent, stateFile })).toThrow(
      'build of "demo" failed [UNEXPECTED]: unknown',
    )
  })

  it('does not save state when the build fails', () => {
    spawnMock.mockReturnValue(ok({ stdout: JSON.stringify({ ok: false }) }))
    expect(() => buildApp(app, { distDir, log: silent, stateFile })).toThrow()
    expect(readState(stateFile)).toEqual({})
  })

  it('throws when the pake output is not JSON', () => {
    spawnMock.mockReturnValue(ok({ stdout: 'everything broken' }))
    expect(() => buildApp(app, { distDir, log: silent, stateFile })).toThrow(
      'unexpected pake output',
    )
  })

  it('throws when pake cannot be run', () => {
    spawnMock.mockReturnValue({ error: new Error('ENOENT'), status: null } as never)
    expect(() => buildApp(app, { distDir, log: silent, stateFile })).toThrow('could not run pake')
  })

  it('passes --debug to pake when debug=true', () => {
    const bundlePath = path.join(distDir, 'demo', 'Demo.app')
    spawnMock.mockReturnValue(pakeSuccess([{ format: 'app', path: bundlePath }]))

    buildApp(app, { debug: true, distDir, log: silent, stateFile })
    const [, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(args).toContain('--debug')
  })
})

describe('installApp', () => {
  it('reuses the existing build when the version matches', () => {
    const outDir = path.join(distDir, 'demo')
    fs.mkdirSync(path.join(outDir, 'Demo.app'), { recursive: true })
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ demo: { builtAt: 'x', bundle: 'Demo.app', version: '2.0.0' } }),
    )

    const messages: string[] = []
    installApp(app, { applicationsDir, distDir, log: (msg) => messages.push(msg), stateFile })

    const commands = spawnMock.mock.calls.map(([cmd]) => cmd)
    expect(commands).not.toContain('pake')
    expect(commands).toContain('ditto')
    expect(messages.at(-1)).toContain('installed at')
  })

  it('builds before installing when there is no build of the current version', () => {
    const bundlePath = path.join(distDir, 'demo', 'Demo.app')
    spawnMock.mockImplementation((cmd: string) =>
      cmd.endsWith('pake') ? pakeSuccess([{ format: 'app', path: bundlePath }]) : ok(),
    )

    const messages: string[] = []
    installApp(app, { applicationsDir, distDir, log: (msg) => messages.push(msg), stateFile })
    expect(messages[0]).toContain('no build for v2.0.0')
    expect(messages.at(-1)).toContain('installed at')
  })

  it('rebuilds when the bundle recorded in the state is gone from disk', () => {
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ demo: { builtAt: 'x', bundle: 'Demo.app', version: '2.0.0' } }),
    )
    const bundlePath = path.join(distDir, 'demo', 'Demo.app')
    spawnMock.mockImplementation((cmd: string) =>
      cmd.endsWith('pake') ? pakeSuccess([{ format: 'app', path: bundlePath }]) : ok(),
    )

    const messages: string[] = []
    installApp(app, { applicationsDir, distDir, log: (msg) => messages.push(msg), stateFile })
    expect(messages[0]).toContain('no build for v2.0.0')
  })

  it('replaces the previous .app and clears the quarantine', () => {
    const outDir = path.join(distDir, 'demo')
    fs.mkdirSync(path.join(outDir, 'Demo.app'), { recursive: true })
    const target = path.join(applicationsDir, 'Demo.app')
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, 'old'), 'previous version')
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ demo: { builtAt: 'x', bundle: 'Demo.app', version: '2.0.0' } }),
    )

    installApp(app, { applicationsDir, distDir, log: silent, stateFile })

    expect(fs.existsSync(path.join(target, 'old'))).toBe(false)
    const commands = spawnMock.mock.calls.map(([cmd]) => cmd)
    expect(commands).not.toContain('pake')
    expect(commands).toContain('ditto')
    expect(commands).toContain('xattr')
    const [, xattrArgs] = spawnMock.mock.calls.find(([cmd]) => cmd === 'xattr') as [
      string,
      string[],
    ]
    expect(xattrArgs).toEqual(['-dr', 'com.apple.quarantine', target])
  })

  it('throws when ditto fails copying to /Applications', () => {
    const outDir = path.join(distDir, 'demo')
    fs.mkdirSync(path.join(outDir, 'Demo.app'), { recursive: true })
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ demo: { builtAt: 'x', bundle: 'Demo.app', version: '2.0.0' } }),
    )
    spawnMock.mockImplementation((cmd: string) => (cmd === 'ditto' ? ok({ status: 1 }) : ok()))

    expect(() => installApp(app, { applicationsDir, distDir, log: silent, stateFile })).toThrow(
      'could not copy',
    )
  })
})

describe('uninstallApp', () => {
  it('removes the installed .app using the bundle from the state', () => {
    fs.mkdirSync(path.join(applicationsDir, 'Demo.app'), { recursive: true })
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ demo: { builtAt: 'x', bundle: 'Demo.app', version: '2.0.0' } }),
    )

    const messages: string[] = []
    uninstallApp(app, (msg) => messages.push(msg), { applicationsDir, stateFile })
    expect(fs.existsSync(path.join(applicationsDir, 'Demo.app'))).toBe(false)
    expect(messages.at(-1)).toContain('removed')
  })

  it('falls back to <Name>.app as the target when there is no build state', () => {
    fs.mkdirSync(path.join(applicationsDir, 'Demo.app'), { recursive: true })

    const messages: string[] = []
    uninstallApp(app, (msg) => messages.push(msg), { applicationsDir, stateFile })
    expect(fs.existsSync(path.join(applicationsDir, 'Demo.app'))).toBe(false)
    expect(messages.at(-1)).toContain('removed')
  })

  it('warns when nothing is installed', () => {
    const messages: string[] = []
    uninstallApp(app, (msg) => messages.push(msg), { applicationsDir, stateFile })
    expect(messages.at(-1)).toContain('nothing installed')
  })
})
