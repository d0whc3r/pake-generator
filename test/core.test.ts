import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appVersion,
  bumpAppVersion,
  bumpVersion,
  isValidVersion,
  listAppIds,
  parseIds,
  readApp,
  readState,
  run,
  selectApps,
  slugify,
  writeApp,
  writeState,
} from '../src/lib/core'

describe('slugify', () => {
  it('pasa a minusculas y une con guiones', () => {
    expect(slugify('Notion Calendar')).toBe('notion-calendar')
  })

  it('elimina acentos y diacriticos', () => {
    expect(slugify('Fígaro Niño')).toBe('figaro-nino')
  })

  it('quita caracteres no alfanumericos y guiones sobrantes', () => {
    expect(slugify('  --WhatsApp Web!!  ')).toBe('whatsapp-web')
  })

  it('devuelve cadena vacia si no hay nada aprovechable', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('isValidVersion', () => {
  it('acepta versiones x.y.z', () => {
    expect(isValidVersion('1.0.0')).toBe(true)
    expect(isValidVersion('0.12.34')).toBe(true)
  })

  it('rechaza formatos incorrectos', () => {
    expect(isValidVersion('1.0')).toBe(false)
    expect(isValidVersion('v1.0.0')).toBe(false)
    expect(isValidVersion('1.0.0-beta')).toBe(false)
  })
})

describe('bumpVersion', () => {
  it('sube patch, minor y major', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
  })

  it('acepta una version explicita', () => {
    expect(bumpVersion('1.2.3', '4.5.6')).toBe('4.5.6')
  })

  it('lanza error con un release no valido', () => {
    expect(() => bumpVersion('1.2.3', 'huge')).toThrow('release no valido')
  })
})

describe('parseIds', () => {
  it('devuelve lista vacia sin argumento', () => {
    expect(parseIds(undefined)).toEqual([])
    expect(parseIds('')).toEqual([])
  })

  it('separa por comas y recorta espacios', () => {
    expect(parseIds('telegram, slack ,,figma')).toEqual(['telegram', 'slack', 'figma'])
  })
})

describe('appVersion', () => {
  it('usa 1.0.0 si no hay appVersion', () => {
    expect(appVersion({ name: 'App', url: 'https://ejemplo.com' })).toBe('1.0.0')
  })

  it('respeta la appVersion definida', () => {
    expect(appVersion({ appVersion: '2.3.4', name: 'App', url: 'https://ejemplo.com' })).toBe(
      '2.3.4',
    )
  })
})

describe('readApp', () => {
  it('lanza error si la app no existe', () => {
    expect(() => readApp('app-que-no-existe')).toThrow('no existe la app')
  })
})

describe('run', () => {
  it('devuelve true si el comando termina con exito', () => {
    expect(run('true', [])).toBe(true)
  })

  it('devuelve false si el comando falla', () => {
    expect(run('false', [])).toBe(false)
  })

  it('lanza error si el comando no existe', () => {
    expect(() => run('comando-que-no-existe-xyz', [])).toThrow('no se pudo ejecutar')
  })
})

describe('registro de apps (fs)', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pake-apps-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { force: true, recursive: true })
  })

  it('writeApp + readApp hacen round-trip y no guardan el id en el JSON', () => {
    writeApp({ id: 'demo', name: 'Demo', url: 'https://demo.com', width: 1200 }, dir)
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'demo.json'), 'utf8'))
    expect(raw).toEqual({ name: 'Demo', url: 'https://demo.com', width: 1200 })

    const app = readApp('demo', dir)
    expect(app).toEqual({ id: 'demo', name: 'Demo', url: 'https://demo.com', width: 1200 })
  })

  it('listAppIds devuelve ids ordenados e ignora archivos que no son JSON', () => {
    writeApp({ id: 'slack', name: 'Slack', url: 'https://slack.com' }, dir)
    writeApp({ id: 'figma', name: 'Figma', url: 'https://figma.com' }, dir)
    fs.writeFileSync(path.join(dir, 'notas.txt'), 'no es una app')
    expect(listAppIds(dir)).toEqual(['figma', 'slack'])
  })

  it('listAppIds devuelve lista vacia si el directorio no existe', () => {
    expect(listAppIds(path.join(dir, 'no-existe'))).toEqual([])
  })

  it('selectApps devuelve las apps pedidas por id', () => {
    writeApp({ id: 'slack', name: 'Slack', url: 'https://slack.com' }, dir)
    writeApp({ id: 'figma', name: 'Figma', url: 'https://figma.com' }, dir)
    expect(selectApps(['figma'], dir).map((app) => app.id)).toEqual(['figma'])
  })

  it('selectApps sin ids devuelve todas', () => {
    writeApp({ id: 'slack', name: 'Slack', url: 'https://slack.com' }, dir)
    writeApp({ id: 'figma', name: 'Figma', url: 'https://figma.com' }, dir)
    expect(selectApps([], dir).map((app) => app.id)).toEqual(['figma', 'slack'])
  })

  it('selectApps sin ids lanza error si el registro esta vacio', () => {
    expect(() => selectApps([], dir)).toThrow('no hay apps en apps/')
  })

  it('selectApps propaga el error si un id no existe', () => {
    writeApp({ id: 'slack', name: 'Slack', url: 'https://slack.com' }, dir)
    expect(() => selectApps(['slack', 'fantasma'], dir)).toThrow('no existe la app "fantasma"')
  })

  it('writeApp crea el directorio de destino si no existe', () => {
    const nested = path.join(dir, 'nuevo', 'apps')
    writeApp({ id: 'demo', name: 'Demo', url: 'https://demo.com' }, nested)
    expect(fs.existsSync(path.join(nested, 'demo.json'))).toBe(true)
  })

  it('bumpAppVersion actualiza el JSON y lo registra en el log', () => {
    writeApp({ appVersion: '1.2.3', id: 'demo', name: 'Demo', url: 'https://demo.com' }, dir)
    const messages: string[] = []
    const app = bumpAppVersion('demo', 'minor', (msg) => messages.push(msg), dir)
    expect(app.appVersion).toBe('1.3.0')
    expect(readApp('demo', dir).appVersion).toBe('1.3.0')
    expect(messages).toEqual(['OK demo: v1.2.3 -> v1.3.0'])
  })

  it('bumpAppVersion acepta una version explicita', () => {
    writeApp({ appVersion: '1.2.3', id: 'demo', name: 'Demo', url: 'https://demo.com' }, dir)
    const app = bumpAppVersion('demo', '3.0.0', () => {}, dir)
    expect(app.appVersion).toBe('3.0.0')
  })
})

describe('estado de builds (fs)', () => {
  let file: string

  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pake-state-')), 'state.json')
  })

  afterEach(() => {
    fs.rmSync(path.dirname(file), { force: true, recursive: true })
  })

  it('readState devuelve objeto vacio si no existe el archivo', () => {
    expect(readState(file)).toEqual({})
  })

  it('writeState + readState hacen round-trip creando el directorio', () => {
    const state = {
      demo: { builtAt: '2026-08-03T00:00:00.000Z', bundle: 'Demo.app', version: '1.0.0' },
    }
    writeState(state, file)
    expect(readState(file)).toEqual(state)
  })
})
