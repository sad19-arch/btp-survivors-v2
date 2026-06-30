import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'

describe('Simulation — ennemis & spawn', () => {
  it('ne contient aucun ennemi au démarrage puis en fait apparaître', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    expect(sim.getState().enemies).toHaveLength(0)
    sim.advanceTime(3000)
    expect(sim.getState().enemies.length).toBeGreaterThan(0)
  })

  it('les ennemis se rapprochent du joueur avec le temps', () => {
    const sim = new Simulation({ seed: 2, mode: 'solo' })
    sim.advanceTime(1100) // ~1 vague
    const before = sim.getState()
    const p0 = before.players[0]
    const e0 = before.enemies[0]
    expect(p0).toBeDefined()
    expect(e0).toBeDefined()
    const d0 = Math.hypot((e0?.x ?? 0) - (p0?.x ?? 0), (e0?.y ?? 0) - (p0?.y ?? 0))

    sim.advanceTime(1000)
    const after = sim.getState()
    const e1 = after.enemies.find((en) => en.id === e0?.id)
    const p1 = after.players[0]
    const d1 = Math.hypot((e1?.x ?? 0) - (p1?.x ?? 0), (e1?.y ?? 0) - (p1?.y ?? 0))
    expect(d1).toBeLessThan(d0)
  })

  it('reste déterministe (même seed ⇒ même état avec ennemis)', () => {
    const run = (): unknown => {
      const sim = new Simulation({ seed: 9, mode: 'solo' })
      sim.advanceTime(3000)
      return sim.getState()
    }
    expect(run()).toEqual(run())
  })
})
