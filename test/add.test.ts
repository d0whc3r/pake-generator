import { describe, expect, it } from 'vitest'
import { parseValue } from '../src/commands/add'

describe('parseValue (--set key=value)', () => {
  it('converts true and false to booleans', () => {
    expect(parseValue('true')).toBe(true)
    expect(parseValue('false')).toBe(false)
  })

  it('converts integers and decimals to numbers', () => {
    expect(parseValue('1200')).toBe(1200)
    expect(parseValue('0.75')).toBe(0.75)
    expect(parseValue('-3')).toBe(-3)
  })

  it('leaves everything else as a string', () => {
    expect(parseValue('1.0.0')).toBe('1.0.0')
    expect(parseValue('dark')).toBe('dark')
    expect(parseValue('truestory')).toBe('truestory')
  })
})
