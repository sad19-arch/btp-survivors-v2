import { describe, it, expect } from 'vitest'
import { spawnParamsAt, SPAWN_RAMP, type SpawnRampStep } from '@content/spawnRamp'

const RAMP: SpawnRampStep[] = [
  { fromSec: 0, intervalMs: 1400, countPerWave: 1 },
  { fromSec: 60, intervalMs: 1000, countPerWave: 2 },
  { fromSec: 300, intervalMs: 600, countPerWave: 3 }
]

describe('spawnParamsAt', () => {
  it('renvoie le palier dont fromSec est le plus grand ≤ t', () => {
    expect(spawnParamsAt(RAMP, 0)).toEqual({ intervalMs: 1400, countPerWave: 1 })
    expect(spawnParamsAt(RAMP, 59_000)).toEqual({ intervalMs: 1400, countPerWave: 1 })
    expect(spawnParamsAt(RAMP, 60_000)).toEqual({ intervalMs: 1000, countPerWave: 2 })
    expect(spawnParamsAt(RAMP, 5 * 60_000)).toEqual({ intervalMs: 600, countPerWave: 3 })
  })
  it('avant le premier palier, retombe sur le premier', () => {
    expect(spawnParamsAt([{ fromSec: 10, intervalMs: 800, countPerWave: 1 }], 0))
      .toEqual({ intervalMs: 800, countPerWave: 1 })
  })
  it('lève une erreur sur une rampe vide (pas de défaut silencieux)', () => {
    expect(() => spawnParamsAt([], 0)).toThrow()
  })
})

// La vraie rampe de prod doit rester MONOTONE : la pression ne redescend jamais
// (intervalle non-croissant, count non-décroissant) et les seuils sont ordonnés.
// Garde-fou du rythme early J8 (0-100s comprimé) et de tout futur tuning.
describe('SPAWN_RAMP (rampe de prod) — monotonie', () => {
  it('fromSec croissant, intervalMs non-croissant, countPerWave non-décroissant', () => {
    for (let i = 1; i < SPAWN_RAMP.length; i++) {
      const prev = SPAWN_RAMP[i - 1]
      const cur = SPAWN_RAMP[i]
      if (prev === undefined || cur === undefined) {
        continue
      }
      expect(cur.fromSec, `palier ${i} fromSec`).toBeGreaterThan(prev.fromSec)
      expect(cur.intervalMs, `palier ${i} intervalMs`).toBeLessThanOrEqual(prev.intervalMs)
      expect(cur.countPerWave, `palier ${i} countPerWave`).toBeGreaterThanOrEqual(prev.countPerWave)
    }
  })
})
