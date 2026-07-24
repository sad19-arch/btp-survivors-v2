import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'

describe('Simulation — ennemis & spawn', () => {
  it('contient immédiatement la vague d’ouverture standard', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    const enemies = sim.getState().enemies
    expect(enemies).toHaveLength(1)
    expect(enemies[0]?.type).toBe('paperasse')
  })

  it('les ennemis se rapprochent du joueur avec le temps', () => {
    const sim = new Simulation({ seed: 2, mode: 'solo' })
    // Avance jusqu'à la 1re vague (robuste à la rampe de spawn : l'intervalle
    // de départ est data-driven). L'ennemi apparaît sur l'anneau (hors portée
    // des armes), donc il ne peut pas être tué dans la courte fenêtre suivante.
    let before = sim.getState()
    for (let t = 0; t < 8000 && before.enemies.length === 0; t += 200) {
      sim.advanceTime(200)
      before = sim.getState()
    }
    const p0 = before.players[0]
    const e0 = before.enemies[0]
    expect(p0).toBeDefined()
    expect(e0).toBeDefined()
    const d0 = Math.hypot((e0?.x ?? 0) - (p0?.x ?? 0), (e0?.y ?? 0) - (p0?.y ?? 0))

    sim.advanceTime(300) // fenêtre courte : l'ennemi traqué survit et se rapproche
    const after = sim.getState()
    const e1 = after.enemies.find((en) => en.id === e0?.id)
    const p1 = after.players[0]
    expect(e1).toBeDefined()
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
