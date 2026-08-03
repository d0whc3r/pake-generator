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
  it('lowercases and joins with hyphens', () => {
    expect(slugify('Notion Calendar')).toBe('notion-calendar')
  })

  it('strips accents and diacritics', () => {
    expect(slugify('Café Naïve')).toBe('cafe-naive')
  })

  it('drops non-alphanumeric characters and leftover hyphens', () => {
    expect(slugify('  --WhatsApp Web!!  ')).toBe('whatsapp-web')
  })

  it('returns an empty string when there is nothing usable', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('isValidVersion', () => {
  it('accepts x.y.z versions', () => {
    expect(isValidVersion('1.0.0')).toBe(true)
    expect(isValidVersion('0.12.34')).toBe(true)
  })

  it('rejects malformed versions', () => {
    expect(isValidVersion('1.0')).toBe(false)
    expect(isValidVersion('v1.0.0')).toBe(false)
    expect(isValidVersion('1.0.0-beta')).toBe(false)
  })
})

describe('bumpVersion', () => {
  it('bumps patch, minor and major', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
  })

  it('accepts an explicit version', () => {
    expect(bumpVersion('1.2.3', '4.5.6')).toBe('4.5.6')
  })

  it('throws on an invalid release', () => {
    expect(() => bumpVersion('1.2.3', 'huge')).toThrow('invalid release')
  })
})

describe('parseIds', () => {
  it('returns an empty list without an argument', () => {
    expect(parseIds(undefined)).toEqual([])
    expect(parseIds('')).toEqual([])
  })

  it('splits on commas and trims whitespace', () => {
    expect(parseIds('telegram, slack ,,figma')).toEqual(['telegram', 'slack', 'figma'])
  })
})

describe('appVersion', () => {
  it('falls back to 1.0.0 when there is no appVersion', () => {
    expect(appVersion({ name: 'App', url: 'https://example.com' })).toBe('1.0.0')
  })

  it('honors the appVersion that is set', () => {
    expect(appVersion({ appVersion: '2.3.4', name: 'App', url: 'https://example.com' })).toBe(
      '2.3.4',
    )
  })
})

describe('readApp', () => {
  it('throws when the app does not exist', () => {
    expect(() => readApp('app-that-does-not-exist')).toThrow('does not exist in apps/')
  })
})

describe('run', () => {
  it('returns true when the command succeeds', () => {
    expect(run('true', [])).toBe(true)
  })

  it('returns false when the command fails', () => {
    expect(run('false', [])).toBe(false)
  })

  it('throws when the command does not exist', () => {
    expect(() => run('command-that-does-not-exist-xyz', [])).toThrow('could not run')
  })
})

describe('app registry (fs)', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pake-apps-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { force: true, recursive: true })
  })

  it('writeApp + readApp round-trip and do not store the id in the JSON', () => {
    writeApp({ id: 'demo', name: 'Demo', url: 'https://demo.com', width: 1200 }, dir)
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'demo.json'), 'utf8'))
    expect(raw).toEqual({ name: 'Demo', url: 'https://demo.com', width: 1200 })

    const app = readApp('demo', dir)
    expect(app).toEqual({ id: 'demo', name: 'Demo', url: 'https://demo.com', width: 1200 })
  })

  it('listAppIds returns sorted ids and ignores non-JSON files', () => {
    writeApp({ id: 'slack', name: 'Slack', url: 'https://slack.com' }, dir)
    writeApp({ id: 'figma', name: 'Figma', url: 'https://figma.com' }, dir)
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not an app')
    expect(listAppIds(dir)).toEqual(['figma', 'slack'])
  })

  it('listAppIds returns an empty list when the directory does not exist', () => {
    expect(listAppIds(path.join(dir, 'missing'))).toEqual([])
  })

  it('selectApps returns the apps requested by id', () => {
    writeApp({ id: 'slack', name: 'Slack', url: 'https://slack.com' }, dir)
    writeApp({ id: 'figma', name: 'Figma', url: 'https://figma.com' }, dir)
    expect(selectApps(['figma'], dir).map((app) => app.id)).toEqual(['figma'])
  })

  it('selectApps without ids returns all of them', () => {
    writeApp({ id: 'slack', name: 'Slack', url: 'https://slack.com' }, dir)
    writeApp({ id: 'figma', name: 'Figma', url: 'https://figma.com' }, dir)
    expect(selectApps([], dir).map((app) => app.id)).toEqual(['figma', 'slack'])
  })

  it('selectApps without ids throws when the registry is empty', () => {
    expect(() => selectApps([], dir)).toThrow('no apps in apps/')
  })

  it('selectApps propagates the error when an id does not exist', () => {
    writeApp({ id: 'slack', name: 'Slack', url: 'https://slack.com' }, dir)
    expect(() => selectApps(['slack', 'ghost'], dir)).toThrow('app "ghost" does not exist')
  })

  it('writeApp creates the target directory when it does not exist', () => {
    const nested = path.join(dir, 'new', 'apps')
    writeApp({ id: 'demo', name: 'Demo', url: 'https://demo.com' }, nested)
    expect(fs.existsSync(path.join(nested, 'demo.json'))).toBe(true)
  })

  it('bumpAppVersion updates the JSON and logs it', () => {
    writeApp({ appVersion: '1.2.3', id: 'demo', name: 'Demo', url: 'https://demo.com' }, dir)
    const messages: string[] = []
    const app = bumpAppVersion('demo', 'minor', (msg) => messages.push(msg), dir)
    expect(app.appVersion).toBe('1.3.0')
    expect(readApp('demo', dir).appVersion).toBe('1.3.0')
    expect(messages).toEqual(['OK demo: v1.2.3 -> v1.3.0'])
  })

  it('bumpAppVersion accepts an explicit version', () => {
    writeApp({ appVersion: '1.2.3', id: 'demo', name: 'Demo', url: 'https://demo.com' }, dir)
    const app = bumpAppVersion('demo', '3.0.0', () => {}, dir)
    expect(app.appVersion).toBe('3.0.0')
  })
})

describe('build state (fs)', () => {
  let file: string

  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pake-state-')), 'state.json')
  })

  afterEach(() => {
    fs.rmSync(path.dirname(file), { force: true, recursive: true })
  })

  it('readState returns an empty object when the file does not exist', () => {
    expect(readState(file)).toEqual({})
  })

  it('writeState + readState round-trip creating the directory', () => {
    const state = {
      demo: { builtAt: '2026-08-03T00:00:00.000Z', bundle: 'Demo.app', version: '1.0.0' },
    }
    writeState(state, file)
    expect(readState(file)).toEqual(state)
  })
})
