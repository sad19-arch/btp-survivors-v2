import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { World } from '@core/world'
import { allPlayersDead } from '@core/systems/gameRules'

describe('Simulation — combat', () => {
  it('équipe le joueur de l\'arme de départ', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    expect(sim.getState().players[0]?.weapons).toContain('cloueur')
  })

  it('tue des ennemis avec le temps et fait monter le score', () => {
    // TUN-2 : les ennemis apparaissent hors écran (~1040 px) et « viennent du
    // monde » → le premier contact/kill arrive plus tard qu'avant. On vérifie
    // l'INTENTION (le combat produit du score au fil du temps) sur une fenêtre
    // large plutôt qu'un seuil serré. La cadence early précise est du ressort du
    // re-tune SPAWN_RAMP (TUN-3) + du playtest, pas de ce test unitaire.
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    let score = 0
    for (let i = 0; i < 30 && score === 0; i++) {
      sim.advanceTime(1000)
      score = sim.getState().score
    }
    expect(score).toBeGreaterThan(0)
  })

  it('fait apparaître des projectiles quand des cibles sont à portée', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    let sawProjectile = false
    for (let i = 0; i < 120; i++) {
      sim.advanceTime(50)
      if (sim.getState().projectiles.length > 0) {
        sawProjectile = true
        break
      }
    }
    expect(sawProjectile).toBe(true)
  })

  it('reste déterministe avec le combat complet', () => {
    const run = (): unknown => {
      const sim = new Simulation({ seed: 11, mode: 'solo' })
      sim.advanceTime(5000)
      return sim.getState()
    }
    expect(run()).toEqual(run())
  })
})

describe('allPlayersDead', () => {
  it('faux si au moins un joueur est vivant, vrai si tous morts', () => {
    const w = new World()
    const p = w.spawn()
    w.add(p, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
    w.add(p, 'health', { hp: 10, maxHp: 10 })
    expect(allPlayersDead(w)).toBe(false)
    const h = w.get(p, 'health')
    if (h !== undefined) {
      h.hp = 0
    }
    expect(allPlayersDead(w)).toBe(true)
  })

  it('faux s\'il n\'y a aucun joueur', () => {
    expect(allPlayersDead(new World())).toBe(false)
  })
})
