import { describe, it, expect } from 'vitest'
import { runOne } from '../../tools/sim/runOne'

describe('runOne (déterministe)', () => {
  it('même seed + même bot ⇒ résultat identique', () => {
    const a = runOne(42, 'kite', { durationSec: 60 })
    const b = runOne(42, 'kite', { durationSec: 60 })
    expect(a.survivalMs).toBe(b.survivalMs)
    expect(a.finalLevel).toBe(b.finalLevel)
    expect(a.samples.map((s) => s.enemies)).toEqual(b.samples.map((s) => s.enemies))
  })

  it('produit des échantillons et des invariants sains sur une courte run', () => {
    const r = runOne(7, 'kite', { durationSec: 60, sampleEveryMs: 10000 })
    expect(r.samples.length).toBeGreaterThan(0)
    expect(r.nanSeen).toBe(false)
    expect(r.minHp).toBeGreaterThanOrEqual(0)
    expect(r.samples[0]?.hpPct).toBeCloseTo(100, 0) // plein HP au départ
  })
})
