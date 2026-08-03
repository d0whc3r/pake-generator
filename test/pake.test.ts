import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readState } from '../src/lib/core'
import { buildApp, installApp, pakeCliVersion, resolveBundle, uninstallApp } from '../src/lib/pake'

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
  it('devuelve la version de pake-cli instalada', () => {
    expect(pakeCliVersion()).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('resolveBundle', () => {
  it('prefiere un .app directo de los outputs', () => {
    expect(resolveBundle('/tmp/out', [{ format: 'app', path: '/tmp/out/Demo.app' }])).toBe(
      '/tmp/out/Demo.app',
    )
  })

  it('busca un .app en el directorio si no hay outputs', () => {
    const outDir = path.join(tmp, 'out')
    fs.mkdirSync(path.join(outDir, 'Demo.app'), { recursive: true })
    expect(resolveBundle(outDir, [])).toBe(path.join(outDir, 'Demo.app'))
  })

  it('lanza error si no hay ningun .app', () => {
    expect(() => resolveBundle(path.join(tmp, 'vacio'), [])).toThrow('no se encontro ningun .app')
  })

  it('extrae el .app de un .dmg montandolo con hdiutil', () => {
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

  it('lanza error si no se puede montar el .dmg', () => {
    const outDir = path.join(tmp, 'dmg-fallo')
    fs.mkdirSync(outDir, { recursive: true })
    spawnMock.mockImplementation((cmd: string) => (cmd === 'hdiutil' ? ok({ status: 1 }) : ok()))

    expect(() =>
      resolveBundle(outDir, [{ format: 'dmg', path: path.join(outDir, 'demo.dmg') }]),
    ).toThrow('no se pudo montar')
  })

  it('lanza error si el .dmg no contiene ningun .app', () => {
    const outDir = path.join(tmp, 'dmg-vacio')
    fs.mkdirSync(outDir, { recursive: true })

    expect(() =>
      resolveBundle(outDir, [{ format: 'dmg', path: path.join(outDir, 'demo.dmg') }]),
    ).toThrow('no se encontro ningun .app dentro')
  })

  it('lanza error si falla la copia del .app fuera del .dmg', () => {
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
    ).toThrow('no se pudo extraer')
  })
})

describe('buildApp', () => {
  it('guarda el estado y devuelve el bundle cuando el build va bien', () => {
    const bundlePath = path.join(distDir, 'demo', 'Demo.app')
    spawnMock.mockReturnValue(pakeSuccess([{ format: 'app', path: bundlePath }]))

    const bundle = buildApp(app, { distDir, log: silent, stateFile })
    expect(bundle).toBe(bundlePath)
    expect(readState(stateFile).demo).toMatchObject({ bundle: 'Demo.app', version: '2.0.0' })
  })

  it('lanza error si pake devuelve ok:false con codigo y pista', () => {
    spawnMock.mockReturnValue(
      ok({
        stdout: JSON.stringify({
          error: { code: 'INVALID_URL', hint: 'revisa la url', message: 'url mala' },
          ok: false,
        }),
      }),
    )
    expect(() => buildApp(app, { distDir, log: silent, stateFile })).toThrow(
      'fallo el build de "demo" [INVALID_URL]: url mala (revisa la url)',
    )
  })

  it('lanza error si la salida de pake no es JSON', () => {
    spawnMock.mockReturnValue(ok({ stdout: 'todo roto' }))
    expect(() => buildApp(app, { distDir, log: silent, stateFile })).toThrow(
      'salida inesperada de pake',
    )
  })

  it('lanza error si no se puede ejecutar pake', () => {
    spawnMock.mockReturnValue({ error: new Error('ENOENT'), status: null } as never)
    expect(() => buildApp(app, { distDir, log: silent, stateFile })).toThrow(
      'no se pudo ejecutar pake',
    )
  })

  it('pasa --debug a pake cuando debug=true', () => {
    const bundlePath = path.join(distDir, 'demo', 'Demo.app')
    spawnMock.mockReturnValue(pakeSuccess([{ format: 'app', path: bundlePath }]))

    buildApp(app, { debug: true, distDir, log: silent, stateFile })
    const [, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(args).toContain('--debug')
  })
})

describe('installApp', () => {
  it('reutiliza el build existente si coincide la version', () => {
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
    expect(messages.at(-1)).toContain('instalada en')
  })

  it('compila antes de instalar si no hay build de la version actual', () => {
    const bundlePath = path.join(distDir, 'demo', 'Demo.app')
    spawnMock.mockImplementation((cmd: string) =>
      cmd.endsWith('pake') ? pakeSuccess([{ format: 'app', path: bundlePath }]) : ok(),
    )

    const messages: string[] = []
    installApp(app, { applicationsDir, distDir, log: (msg) => messages.push(msg), stateFile })
    expect(messages[0]).toContain('no hay build de la v2.0.0')
    expect(messages.at(-1)).toContain('instalada en')
  })

  it('lanza error si ditto falla al copiar a /Applications', () => {
    const outDir = path.join(distDir, 'demo')
    fs.mkdirSync(path.join(outDir, 'Demo.app'), { recursive: true })
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ demo: { builtAt: 'x', bundle: 'Demo.app', version: '2.0.0' } }),
    )
    spawnMock.mockImplementation((cmd: string) => (cmd === 'ditto' ? ok({ status: 1 }) : ok()))

    expect(() => installApp(app, { applicationsDir, distDir, log: silent, stateFile })).toThrow(
      'no se pudo copiar',
    )
  })
})

describe('uninstallApp', () => {
  it('elimina el .app instalado usando el bundle del estado', () => {
    fs.mkdirSync(path.join(applicationsDir, 'Demo.app'), { recursive: true })
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ demo: { builtAt: 'x', bundle: 'Demo.app', version: '2.0.0' } }),
    )

    const messages: string[] = []
    uninstallApp(app, (msg) => messages.push(msg), { applicationsDir, stateFile })
    expect(fs.existsSync(path.join(applicationsDir, 'Demo.app'))).toBe(false)
    expect(messages.at(-1)).toContain('eliminada')
  })

  it('avisa si no hay nada instalado', () => {
    const messages: string[] = []
    uninstallApp(app, (msg) => messages.push(msg), { applicationsDir, stateFile })
    expect(messages.at(-1)).toContain('no hay nada instalado')
  })
})
