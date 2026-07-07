import { describe, it, expect } from 'vitest'
import { SPAWN_RAMP, spawnParamsAt, difficultyScaleAt } from '@content/spawnRamp'

describe('arc de spawn — 20 min', () => {
  it('la rampe couvre au moins 19:45 (1185 s)', () => {
    const last = SPAWN_RAMP.at(-1)
    expect(last).toBeDefined()
    expect(last?.fromSec).toBeGreaterThanOrEqual(1185)
  })

  it('la rampe couvre toujours 10:30 (600 s)', () => {
    const last = SPAWN_RAMP.at(-1)
    expect(last).toBeDefined()
    expect(last?.fromSec).toBeGreaterThanOrEqual(600)
  })

  it('densité forte en phase de puissance (6:00) : au moins 3/vague', () => {
    const p = spawnParamsAt(SPAWN_RAMP, 360_000)
    expect(p.countPerWave).toBeGreaterThanOrEqual(3)
  })

  it('densité croissante en milieu de run (15:00) : au moins 10/vague', () => {
    const p = spawnParamsAt(SPAWN_RAMP, 900_000)
    expect(p.countPerWave).toBeGreaterThanOrEqual(10)
  })

  it('densité maximum en fin de run (19:00) : au moins 16/vague', () => {
    const p = spawnParamsAt(SPAWN_RAMP, 1140_000)
    expect(p.countPerWave).toBeGreaterThanOrEqual(16)
  })

  it('PV doux en puissance (6:00) puis montée en fin (20:00)', () => {
    const at6min   = difficultyScaleAt(360_000).hp   // 6:00  → ~1.42
    const at12min  = difficultyScaleAt(720_000).hp   // 12:00 → ~2.04
    const at20min  = difficultyScaleAt(1_200_000).hp // 20:00 → ~4.5
    expect(at6min).toBeLessThan(2.0)        // les ennemis fondent encore
    expect(at12min).toBeGreaterThan(at6min) // montée soutenue
    expect(at20min).toBeGreaterThan(at12min * 1.5) // coup de fouet final
  })

  it('difficultyScaleAt(1_200_000) > difficultyScaleAt(600_000)', () => {
    expect(difficultyScaleAt(1_200_000).hp).toBeGreaterThan(difficultyScaleAt(600_000).hp)
  })
})
