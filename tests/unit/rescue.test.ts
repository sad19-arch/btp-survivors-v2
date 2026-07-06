import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { RESCUE, WORLD } from '@content/config'

function bootSim(seed = 42): Simulation {
  return new Simulation({ mode: 'solo', seed })
}

describe('prisonniers ×5', () => {
  it('RESCUE expose 5 prisonniers, soin 30 %, distances larges', () => {
    expect(RESCUE.count).toBe(5)
    expect(RESCUE.healFraction).toBeCloseTo(0.30)
    expect(RESCUE.distMin).toBeGreaterThanOrEqual(1200)
  })

  it('spawn 5 prisonniers éparpillés (déterministe) hors du centre', () => {
    const a = bootSim(7).getState().prisoners
    const b = bootSim(7).getState().prisoners
    expect(a.length).toBe(5)
    expect(a).toEqual(b) // déterminisme
    const cx = WORLD.width / 2, cy = WORLD.height / 2
    for (const p of a) {
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeGreaterThanOrEqual(RESCUE.distMin - 1)
    }
    // secteurs distincts : deux prisonniers ne partagent pas le même angle grossier
    const sectors = a.map((p) => Math.round(((Math.atan2(p.y - cy, p.x - cx) + Math.PI) / (2 * Math.PI)) * 5))
    expect(new Set(sectors).size).toBeGreaterThanOrEqual(4)
  })

  it('getState().rescue = { total:5, rescued:0 } au départ', () => {
    expect(bootSim(1).getState().rescue).toEqual({ total: 5, rescued: 0 })
  })
})
