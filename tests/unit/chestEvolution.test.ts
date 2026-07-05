import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import type { EvolvedEvent } from '@core/events'
import type { PlayerState } from '@core/types'

/** Récupère le joueur 1 (tranche solo) ou lève, pour éviter les assertions non-null dans les tests. */
function player1(sim: Simulation): PlayerState {
  const p = sim.getState().players[0]
  if (p === undefined) {
    throw new Error('joueur 1 introuvable')
  }
  return p
}

describe('coffre → évolution', () => {
  it('cloueur max + air comprimé + coffre ramassé → mitrailleuse_clous', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    sim.debugGrant?.({ weapons: [{ id: 'cloueur', level: 8 }], passives: [{ id: 'air_comprime', level: 1 }] })
    let evolved = ''
    let evolvedPlayerId = -1
    sim.events.addEventListener('evolved', (e) => {
      evolved = (e as EvolvedEvent).weaponId
      evolvedPlayerId = (e as EvolvedEvent).playerId
    })
    sim.debugSpawnChestOnPlayer?.()
    sim.advanceTime(200)
    expect(evolved).toBe('mitrailleuse_clous')
    expect(player1(sim).weapons).toContain('mitrailleuse_clous')
    // Solo : ramasseur unique possible = joueur 1 (comportement inchangé après le fix coop).
    expect(evolvedPlayerId).toBe(1)
  })

  it('coffre ramassé sans évolution éligible → bonus de soin borné à maxHp', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    const before = player1(sim)
    expect(before.hp).toBe(before.maxHp)
    sim.debugSpawnChestOnPlayer?.()
    sim.advanceTime(200)
    const after = player1(sim)
    expect(after.hp).toBe(after.maxHp) // déjà au max → borné, pas de dépassement
  })

  it('ne crédite aucune XP au ramassage du coffre', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    const xpBefore = player1(sim).xp
    sim.debugSpawnChestOnPlayer?.()
    sim.advanceTime(200)
    const xpAfter = player1(sim).xp
    expect(xpAfter).toBe(xpBefore)
  })

  it('coop : coffre ramassé par le joueur 2 fait évoluer SON arme, pas celle du joueur 1', () => {
    const sim = new Simulation({ seed: 1, mode: 'coop' })
    sim.debugGrant?.({ weapons: [{ id: 'cloueur', level: 8 }], passives: [{ id: 'air_comprime', level: 1 }] }, 2)
    sim.debugSpawnChestOnPlayer?.(2)
    for (let i = 0; i < 50 && !sim.getState().players[1]?.weapons.includes('mitrailleuse_clous'); i++) {
      sim.advanceTime(200)
    }
    const state = sim.getState()
    const p1 = state.players[0]
    const p2 = state.players[1]
    if (p1 === undefined || p2 === undefined) {
      throw new Error('joueurs coop introuvables')
    }
    expect(p2.weapons).toContain('mitrailleuse_clous')
    expect(p1.weapons).not.toContain('mitrailleuse_clous')
  })
})
