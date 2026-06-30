import { describe, it, expect } from 'vitest'
import { Rng } from '@core/rng'

describe('Rng (déterminisme)', () => {
  it('produit la même séquence pour une même seed', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    const seqA = Array.from({ length: 100 }, () => a.next())
    const seqB = Array.from({ length: 100 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produit des séquences différentes pour des seeds différentes', () => {
    const a = new Rng(1)
    const b = new Rng(2)
    expect(a.next()).not.toBe(b.next())
  })

  it('next() reste dans [0, 1)', () => {
    const r = new Rng(123)
    for (let i = 0; i < 1000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int(min, max) reste dans les bornes inclusives', () => {
    const r = new Rng(7)
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 9)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(9)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('snapshot/restore rétablit exactement l\'état', () => {
    const r = new Rng(99)
    r.next()
    r.next()
    const snap = r.snapshot()
    const expected = [r.next(), r.next(), r.next()]
    r.restore(snap)
    const actual = [r.next(), r.next(), r.next()]
    expect(actual).toEqual(expected)
  })

  it('pick lève une erreur sur tableau vide', () => {
    const r = new Rng(1)
    expect(() => r.pick([])).toThrow()
  })
})
