import { type Command, Config } from '@oclif/core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Add from '../src/commands/add'
import Build from '../src/commands/build'
import Bump from '../src/commands/bump'
import Install from '../src/commands/install'
import List from '../src/commands/list'
import Remove from '../src/commands/remove'
import Uninstall from '../src/commands/uninstall'
import Update from '../src/commands/update'
import { buildApp, installApp, uninstallApp } from '../src/lib/pake'

// Los comandos usan las rutas por defecto de core (apps/, dist/state.json del
// repo). Las redirigimos a un directorio temporal y sustituimos la capa de
// pake por mocks: aqui probamos la orquestacion del CLI, no a pake.
const holder = vi.hoisted(() => ({ apps: '', dist: '', state: '' }))

vi.mock('../src/lib/core', async (importActual) => {
  const actual = await importActual<typeof import('../src/lib/core')>()
  return {
    ...actual,
    appFile: (id: string) => actual.appFile(id, holder.apps),
    get APPS_DIR() {
      return holder.apps
    },
    bumpAppVersion: (id: string, release: string, log: (msg: string) => void) =>
      actual.bumpAppVersion(id, release, log, holder.apps),
    get DIST_DIR() {
      return holder.dist
    },
    listAppIds: () => actual.listAppIds(holder.apps),
    readApp: (id: string) => actual.readApp(id, holder.apps),
    readState: () => actual.readState(holder.state),
    selectApps: (ids: string[]) => actual.selectApps(ids, holder.apps),
    get STATE_FILE() {
      return holder.state
    },
    writeApp: (app: Parameters<typeof actual.writeApp>[0]) => actual.writeApp(app, holder.apps),
    writeState: (state: Parameters<typeof actual.writeState>[0]) =>
      actual.writeState(state, holder.state),
  }
})

vi.mock('../src/lib/pake', () => ({
  buildApp: vi.fn(),
  installApp: vi.fn(),
  pakeCliVersion: vi.fn(() => '0.0.0'),
  uninstallApp: vi.fn(),
}))

const buildMock = vi.mocked(buildApp)
const installMock = vi.mocked(installApp)
const uninstallMock = vi.mocked(uninstallApp)

let config: Config
let tmp: string

beforeAll(async () => {
  config = await Config.load(process.cwd())
})

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pake-cmd-'))
  holder.apps = path.join(tmp, 'apps')
  holder.dist = path.join(tmp, 'dist')
  holder.state = path.join(holder.dist, 'state.json')
  fs.mkdirSync(holder.apps, { recursive: true })
  fs.mkdirSync(holder.dist, { recursive: true })
  vi.clearAllMocks()
})

afterEach(() => {
  fs.rmSync(tmp, { force: true, recursive: true })
})

interface Captured {
  logs: string[]
  warns: string[]
}

type CommandClass = new (argv: string[], config: Config) => Command

async function runCommand(CommandClass: CommandClass, argv: string[]): Promise<Captured> {
  const cmd = new CommandClass(argv, config)
  const captured: Captured = { logs: [], warns: [] }
  vi.spyOn(cmd, 'log').mockImplementation((msg = '') => {
    captured.logs.push(msg)
  })
  vi.spyOn(cmd, 'warn').mockImplementation((input) => {
    captured.warns.push(String(input))
    return input
  })
  await cmd.run()
  return captured
}

function seedApp(id: string, extra: Record<string, unknown> = {}): void {
  fs.writeFileSync(
    path.join(holder.apps, `${id}.json`),
    `${JSON.stringify({ name: id, url: `https://${id}.com`, ...extra }, null, 2)}\n`,
  )
}

function readSeededApp(id: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(holder.apps, `${id}.json`), 'utf8'))
}

describe('add', () => {
  it('crea apps/<id>.json con schema, identifier y version por defecto', async () => {
    const { logs } = await runCommand(Add, ['https://demo.com', '--name', 'My Demo'])

    expect(readSeededApp('my-demo')).toEqual({
      $schema: expect.stringContaining('pake.schema.json'),
      appVersion: '1.0.0',
      identifier: 'com.pake.mydemo',
      name: 'My Demo',
      url: 'https://demo.com',
    })
    expect(logs[0]).toContain('registrada como apps/my-demo.json (v1.0.0)')
    expect(logs[1]).toContain('pnpm pake install my-demo')
  })

  it('respeta --id, --identifier, --version y los --set con tipos', async () => {
    await runCommand(Add, [
      'https://x.com',
      '--name',
      'X',
      '--id',
      'custom',
      '--identifier',
      'com.ejemplo.x',
      '--version',
      '2.1.0',
      '--set',
      'width=1200',
      '--set',
      'hideTitleBar=true',
      '--set',
      'theme=dark',
    ])

    expect(readSeededApp('custom')).toMatchObject({
      appVersion: '2.1.0',
      hideTitleBar: true,
      identifier: 'com.ejemplo.x',
      theme: 'dark',
      width: 1200,
    })
  })

  it('falla si la version no es x.y.z', async () => {
    await expect(
      runCommand(Add, ['https://demo.com', '--name', 'Demo', '--version', '1.0']),
    ).rejects.toThrow('version no valida')
  })

  it('falla si --set no tiene formato clave=valor', async () => {
    await expect(
      runCommand(Add, ['https://demo.com', '--name', 'Demo', '--set', 'solo-clave']),
    ).rejects.toThrow('no tiene formato clave=valor')
  })

  it('falla si el id ya esta registrado', async () => {
    seedApp('demo')
    await expect(
      runCommand(Add, ['https://demo.com', '--name', 'Demo', '--id', 'demo']),
    ).rejects.toThrow('ya existe la app "demo"')
  })
})

describe('list', () => {
  it('avisa cuando no hay apps registradas', async () => {
    const { logs } = await runCommand(List, [])
    expect(logs[0]).toContain('No hay apps registradas')
  })

  it('muestra id, version de la config y version del ultimo build', async () => {
    seedApp('slack', { appVersion: '1.2.3', name: 'Slack' })
    seedApp('figma', { name: 'Figma' })
    fs.writeFileSync(
      holder.state,
      JSON.stringify({ slack: { builtAt: 'x', bundle: 'Slack.app', version: '1.2.3' } }),
    )

    const { logs } = await runCommand(List, [])
    expect(logs[0]).toContain('ID')
    expect(logs[1]).toContain('figma')
    expect(logs[1]).toContain('1.0.0')
    expect(logs[1]).toContain('-')
    expect(logs[2]).toContain('slack')
    expect(logs[2]).toContain('1.2.3')
    expect(logs[2]).toContain('Slack (https://slack.com)')
  })
})

describe('bump', () => {
  it('sube la appVersion del JSON y lo anuncia', async () => {
    seedApp('demo', { appVersion: '1.0.0' })
    const { logs } = await runCommand(Bump, ['demo', 'minor'])
    expect(readSeededApp('demo').appVersion).toBe('1.1.0')
    expect(logs).toEqual(['OK demo: v1.0.0 -> v1.1.0'])
  })

  it('usa patch por defecto', async () => {
    seedApp('demo', { appVersion: '1.0.0' })
    await runCommand(Bump, ['demo'])
    expect(readSeededApp('demo').appVersion).toBe('1.0.1')
  })

  it('falla si la app no existe', async () => {
    await expect(runCommand(Bump, ['fantasma'])).rejects.toThrow('no existe la app')
  })
})

describe('build', () => {
  it('compila solo los ids indicados', async () => {
    seedApp('slack')
    seedApp('figma')
    await runCommand(Build, ['slack'])
    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(buildMock.mock.calls[0][0].id).toBe('slack')
  })

  it('sin ids compila todas las apps registradas', async () => {
    seedApp('slack')
    seedApp('figma')
    await runCommand(Build, [])
    expect(buildMock.mock.calls.map(([app]) => app.id)).toEqual(['figma', 'slack'])
  })

  it('propaga --debug a buildApp', async () => {
    seedApp('slack')
    await runCommand(Build, ['slack', '--debug'])
    expect(buildMock.mock.calls[0][1]).toMatchObject({ debug: true })
  })

  it('falla si no hay apps registradas', async () => {
    await expect(runCommand(Build, [])).rejects.toThrow('no hay apps en apps/')
  })
})

describe('install', () => {
  it('instala solo los ids indicados', async () => {
    seedApp('slack')
    seedApp('figma')
    await runCommand(Install, ['slack,figma'])
    expect(installMock.mock.calls.map(([app]) => app.id)).toEqual(['slack', 'figma'])
  })

  it('sin ids instala todas y propaga --debug', async () => {
    seedApp('slack')
    await runCommand(Install, ['--debug'])
    expect(installMock).toHaveBeenCalledTimes(1)
    expect(installMock.mock.calls[0][1]).toMatchObject({ debug: true })
  })
})

describe('uninstall', () => {
  it('exige al menos un id', async () => {
    await expect(runCommand(Uninstall, [''])).rejects.toThrow('indica al menos un id')
    expect(uninstallMock).not.toHaveBeenCalled()
  })

  it('desinstala los ids indicados', async () => {
    seedApp('slack')
    seedApp('figma')
    await runCommand(Uninstall, ['slack,figma'])
    expect(uninstallMock.mock.calls.map(([app]) => app.id)).toEqual(['slack', 'figma'])
  })
})

describe('update', () => {
  it('exige al menos un id', async () => {
    await expect(runCommand(Update, [''])).rejects.toThrow('indica al menos un id')
  })

  it('hace bump y luego instala la version ya actualizada', async () => {
    seedApp('demo', { appVersion: '1.2.3' })
    const { logs } = await runCommand(Update, ['demo', '--release', 'major'])

    expect(readSeededApp('demo').appVersion).toBe('2.0.0')
    expect(installMock).toHaveBeenCalledTimes(1)
    expect(installMock.mock.calls[0][0]).toMatchObject({ appVersion: '2.0.0', id: 'demo' })
    expect(logs[0]).toContain('OK demo: v1.2.3 -> v2.0.0')
  })
})

describe('remove', () => {
  it('elimina el JSON, el dist y la entrada de estado sin tocar /Applications', async () => {
    seedApp('demo')
    fs.mkdirSync(path.join(holder.dist, 'demo'), { recursive: true })
    fs.writeFileSync(
      holder.state,
      JSON.stringify({ demo: { builtAt: 'x', bundle: 'Demo.app', version: '1.0.0' } }),
    )

    const { logs } = await runCommand(Remove, ['demo'])

    expect(fs.existsSync(path.join(holder.apps, 'demo.json'))).toBe(false)
    expect(fs.existsSync(path.join(holder.dist, 'demo'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(holder.state, 'utf8'))).toEqual({})
    expect(uninstallMock).not.toHaveBeenCalled()
    expect(logs.at(-1)).toContain('eliminada del registro')
  })

  it('con --uninstall desinstala el .app antes de borrar', async () => {
    seedApp('demo')
    await runCommand(Remove, ['demo', '--uninstall'])
    expect(uninstallMock).toHaveBeenCalledTimes(1)
    expect(uninstallMock.mock.calls[0][0].id).toBe('demo')
  })

  it('falla si la app no existe', async () => {
    await expect(runCommand(Remove, ['fantasma'])).rejects.toThrow('no existe la app')
  })
})
