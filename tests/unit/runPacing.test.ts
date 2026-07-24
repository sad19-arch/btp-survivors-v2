import { describe, expect, it } from 'vitest'
import { BREATHER_WINDOWS, TERRASSEMENT_BREATHER_WINDOWS, runPacingAt } from '@content/runPacing'
import { ConstructionPhaseId } from '@content/phases'
import { createWaveDirectorState, stepWaveDirector } from '@core/systems/waveDirector'
import { Rng } from '@core/rng'
import { SPAWN_RAMP } from '@content/spawnRamp'
import { EVENT_POOL_DEFAULT } from '@content/waveEvents'

describe('pulsation de la run', () => {
  it('alterne pression et respirations de 12 à 18 secondes', () => {
    expect(BREATHER_WINDOWS.every(([a, b]) => b - a >= 12_000 && b - a <= 18_000)).toBe(true)
    expect(runPacingAt(74_999, false).beat).toBe('pressure')
    expect(runPacingAt(75_000, false)).toEqual({ beat: 'breather', spawnRate: 0 })
    expect(runPacingAt(87_000, false).beat).toBe('pressure')
  })

  it('réduit les renforts tant qu’un boss est vivant', () => {
    expect(runPacingAt(100_000, true)).toEqual({ beat: 'boss', spawnRate: 0.35 })
  })

  it('donne au terrassement son propre cycle creusement / évacuation', () => {
    expect(TERRASSEMENT_BREATHER_WINDOWS.every(([a, b]) => b - a >= 14_000 && b - a <= 18_000)).toBe(true)
    expect(runPacingAt(69_999, false, ConstructionPhaseId.TERRASSEMENT).beat).toBe('pressure')
    expect(runPacingAt(70_000, false, ConstructionPhaseId.TERRASSEMENT)).toEqual({ beat: 'breather', spawnRate: 0 })
    expect(runPacingAt(84_000, false, ConstructionPhaseId.TERRASSEMENT).beat).toBe('pressure')
  })

  it("n'émet ni n'accumule de dette pendant une respiration", () => {
    const state = createWaveDirectorState()
    state.budgetAcc = 3.5
    const beforeEvent = state.nextEventMs
    for (let t = 75_000; t < 87_000; t += 100) {
      const placements = stepWaveDirector(state, {
        dtMs: 100,
        elapsedMs: t,
        center: { x: 1000, y: 1000 },
        ramp: SPAWN_RAMP,
        events: EVENT_POOL_DEFAULT,
        ringRadius: 600,
        rng: new Rng(42),
        spawnRateMultiplier: 0
      })
      expect(placements).toHaveLength(0)
    }
    expect(state.budgetAcc).toBe(3.5)
    expect(state.nextEventMs).toBe(beforeEvent + 12_000)
  })
})
