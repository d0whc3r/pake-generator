import { describe, expect, it } from 'vitest'
import { parseValue } from '../src/commands/add'

describe('parseValue (--set clave=valor)', () => {
  it('convierte true y false a booleanos', () => {
    expect(parseValue('true')).toBe(true)
    expect(parseValue('false')).toBe(false)
  })

  it('convierte enteros y decimales a numeros', () => {
    expect(parseValue('1200')).toBe(1200)
    expect(parseValue('0.75')).toBe(0.75)
    expect(parseValue('-3')).toBe(-3)
  })

  it('deja el resto como string', () => {
    expect(parseValue('1.0.0')).toBe('1.0.0')
    expect(parseValue('dark')).toBe('dark')
    expect(parseValue('truestory')).toBe('truestory')
  })
})
