import { describe, it, expect } from 'vitest'
import { SPAWN_RAMP, spawnParamsAt, difficultyScaleAt } from '@content/spawnRamp'

describe('arc de spawn découplé', () => {
  it('la rampe couvre au moins 10:30 (630 s)', () => {
    const last = SPAWN_RAMP.at(-1)
    expect(last).toBeDefined()
    expect(last?.fromSec).toBeGreaterThanOrEqual(600)
  })
  it('densité forte en phase de puissance (6:00) : au moins 3/vague', () => {
    const p = spawnParamsAt(SPAWN_RAMP, 360_000)
    expect(p.countPerWave).toBeGreaterThanOrEqual(3)
  })
  it('PV doux en puissance (6:00) puis mur en fin (11:00)', () => {
    const mid = difficultyScaleAt(360_000).hp // 6:00
    const end = difficultyScaleAt(660_000).hp // 11:00
    expect(mid).toBeLessThan(2.0) // les ennemis fondent encore
    expect(end).toBeGreaterThan(mid * 1.5) // saut net = climax
  })
})
