import { describe, expect, it } from 'vitest'

import {
  appVersion,
  bumpVersion,
  isValidVersion,
  parseIds,
  readApp,
  run,
  slugify,
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
})
