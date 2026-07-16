import { describe, it, expect, beforeEach } from 'vitest'
import { readHiScore, writeHiScore } from '@/ui/hiscore'

describe('hiscore', () => {
  beforeEach(() => localStorage.clear())

  it('lit 0 par défaut', () => {
    expect(readHiScore()).toBe(0)
  })

  it('écrit puis relit', () => {
    writeHiScore(28900)
    expect(readHiScore()).toBe(28900)
  })

  it('ignore une valeur négative / non finie', () => {
    writeHiScore(-5)
    expect(readHiScore()).toBe(0)
    writeHiScore(Number.NaN)
    expect(readHiScore()).toBe(0)
  })

  it('tronque à l\'entier', () => {
    writeHiScore(1234.9)
    expect(readHiScore()).toBe(1234)
  })
})
