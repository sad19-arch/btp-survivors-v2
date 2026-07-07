import { describe, it, expect } from 'vitest'
import { formatTime, formatNumber } from '@/ui/format'

describe('formatTime', () => {
  it('formate 1 002 000 ms en "16:42"', () => {
    expect(formatTime(1_002_000)).toBe('16:42')
  })

  it('formate 42 000 ms en "0:42"', () => {
    expect(formatTime(42_000)).toBe('0:42')
  })

  it('formate 0 ms en "0:00"', () => {
    expect(formatTime(0)).toBe('0:00')
  })
})

describe('formatNumber', () => {
  it('formate 1 248 en "1 248"', () => {
    expect(formatNumber(1_248)).toBe('1 248')
  })

  it('formate 37 en "37"', () => {
    expect(formatNumber(37)).toBe('37')
  })

  it('formate 1 234 567 en "1 234 567"', () => {
    expect(formatNumber(1_234_567)).toBe('1 234 567')
  })

  it('formate 0 en "0"', () => {
    expect(formatNumber(0)).toBe('0')
  })
})
