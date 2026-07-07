import { describe, it, expect } from 'vitest'
import { CULT_DEATH_QUOTE, DEATH_QUOTES, selectDeathQuote } from '@content/deathQuotes'

// ---------------------------------------------------------------------------
// Règle culte (>80 % de progression)
// ---------------------------------------------------------------------------
describe('selectDeathQuote — règle culte >80 %', () => {
  it('retourne CULT_DEATH_QUOTE à 81 % de progression (0.81 × 1200 s)', () => {
    const result = selectDeathQuote({
      elapsedSeconds: 0.81 * 1200,
      stageDurationSeconds: 1200,
      roll: 0.5,
    })
    expect(result).toBe(CULT_DEATH_QUOTE)
  })

  it('ne retourne PAS CULT_DEATH_QUOTE à 79 % de progression (0.79 × 1200 s)', () => {
    const result = selectDeathQuote({
      elapsedSeconds: 0.79 * 1200,
      stageDurationSeconds: 1200,
      roll: 0.5,
    })
    expect(result).not.toBe(CULT_DEATH_QUOTE)
    // À 948 s = 15.8 min → palier '15_18'
    expect(DEATH_QUOTES['15_18'].includes(result)).toBe(true)
  })

  it('retourne CULT_DEATH_QUOTE exactement à progressRatio=1 (fin de stage)', () => {
    const result = selectDeathQuote({
      elapsedSeconds: 1200,
      stageDurationSeconds: 1200,
      roll: 0.0,
    })
    expect(result).toBe(CULT_DEATH_QUOTE)
  })
})

// ---------------------------------------------------------------------------
// Frontières de paliers temporels
// stageDurationSeconds très grand pour que progressRatio reste < 0.8
// ---------------------------------------------------------------------------
const BIG = 100_000

describe('selectDeathQuote — frontières de paliers', () => {
  it('59 s → pool 0_1', () => {
    const r = selectDeathQuote({ elapsedSeconds: 59, stageDurationSeconds: BIG, roll: 0.5 })
    expect(DEATH_QUOTES['0_1'].includes(r)).toBe(true)
  })

  it('61 s → pool 1_3', () => {
    const r = selectDeathQuote({ elapsedSeconds: 61, stageDurationSeconds: BIG, roll: 0.5 })
    expect(DEATH_QUOTES['1_3'].includes(r)).toBe(true)
  })

  it('179 s → pool 1_3', () => {
    const r = selectDeathQuote({ elapsedSeconds: 179, stageDurationSeconds: BIG, roll: 0.5 })
    expect(DEATH_QUOTES['1_3'].includes(r)).toBe(true)
  })

  it('181 s → pool 3_5', () => {
    const r = selectDeathQuote({ elapsedSeconds: 181, stageDurationSeconds: BIG, roll: 0.5 })
    expect(DEATH_QUOTES['3_5'].includes(r)).toBe(true)
  })

  it('299 s → pool 3_5', () => {
    const r = selectDeathQuote({ elapsedSeconds: 299, stageDurationSeconds: BIG, roll: 0.5 })
    expect(DEATH_QUOTES['3_5'].includes(r)).toBe(true)
  })

  it('301 s → pool 5_10', () => {
    const r = selectDeathQuote({ elapsedSeconds: 301, stageDurationSeconds: BIG, roll: 0.5 })
    expect(DEATH_QUOTES['5_10'].includes(r)).toBe(true)
  })

  it('599 s → pool 5_10', () => {
    const r = selectDeathQuote({ elapsedSeconds: 599, stageDurationSeconds: BIG, roll: 0.5 })
    expect(DEATH_QUOTES['5_10'].includes(r)).toBe(true)
  })

  it('601 s → pool 10_15', () => {
    const r = selectDeathQuote({ elapsedSeconds: 601, stageDurationSeconds: BIG, roll: 0.5 })
    expect(DEATH_QUOTES['10_15'].includes(r)).toBe(true)
  })

  it('899 s → pool 10_15', () => {
    const r = selectDeathQuote({ elapsedSeconds: 899, stageDurationSeconds: BIG, roll: 0.5 })
    expect(DEATH_QUOTES['10_15'].includes(r)).toBe(true)
  })

  it('901 s → pool 15_18', () => {
    const r = selectDeathQuote({ elapsedSeconds: 901, stageDurationSeconds: BIG, roll: 0.5 })
    expect(DEATH_QUOTES['15_18'].includes(r)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Roll extrêmes
// ---------------------------------------------------------------------------
describe('selectDeathQuote — roll extrêmes', () => {
  it('roll=0 → 1er élément du pool', () => {
    const pool = DEATH_QUOTES['0_1']
    const r = selectDeathQuote({ elapsedSeconds: 30, stageDurationSeconds: BIG, roll: 0 })
    expect(r).toBe(pool[0])
  })

  it('roll=0.999 → dernier élément du pool', () => {
    const pool = DEATH_QUOTES['0_1']
    const r = selectDeathQuote({ elapsedSeconds: 30, stageDurationSeconds: BIG, roll: 0.999 })
    expect(r).toBe(pool[pool.length - 1])
  })
})

// ---------------------------------------------------------------------------
// Déterminisme
// ---------------------------------------------------------------------------
describe('selectDeathQuote — déterminisme', () => {
  it('mêmes args → même résultat (appels répétés)', () => {
    const args = { elapsedSeconds: 250, stageDurationSeconds: BIG, roll: 0.42 }
    const r1 = selectDeathQuote(args)
    const r2 = selectDeathQuote(args)
    expect(r1).toBe(r2)
  })
})

// ---------------------------------------------------------------------------
// Taille des pools (garde-fou count)
// ---------------------------------------------------------------------------
describe('DEATH_QUOTES — taille des pools', () => {
  it('pool 0_1 contient 12 phrases', () => {
    expect(DEATH_QUOTES['0_1'].length).toBe(12)
  })
  it('pool 1_3 contient 12 phrases', () => {
    expect(DEATH_QUOTES['1_3'].length).toBe(12)
  })
  it('pool 3_5 contient 12 phrases', () => {
    expect(DEATH_QUOTES['3_5'].length).toBe(12)
  })
  it('pool 5_10 contient 15 phrases', () => {
    expect(DEATH_QUOTES['5_10'].length).toBe(15)
  })
  it('pool 10_15 contient 15 phrases', () => {
    expect(DEATH_QUOTES['10_15'].length).toBe(15)
  })
  it('pool 15_18 contient 15 phrases', () => {
    expect(DEATH_QUOTES['15_18'].length).toBe(15)
  })
})
