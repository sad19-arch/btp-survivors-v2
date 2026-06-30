import { describe, it, expect } from 'vitest'
import { spawnParamsAt, type SpawnRampStep } from '@content/spawnRamp'

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
