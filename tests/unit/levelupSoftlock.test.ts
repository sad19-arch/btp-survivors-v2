import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { STEP_MS } from '@core/clock'
import { WEAPONS } from '@content/weapons'
import { PASSIVES } from '@content/passives'

/**
 * Régression : quand l'inventaire du joueur est déjà entièrement maxé (armes de
 * base au niveau max + tous les passifs au niveau max), `rollCards` renvoie 0
 * carte. Avant fix, `checkLevelUp` posait quand même `pendingLevelUp` → écran
 * d'upgrade à 0 carte, temps gelé pour toujours (aucun moyen de le lever).
 * Après fix : le niveau est consommé, mais on NE gèle PAS — le temps continue.
 */
describe('level-up sur inventaire maxé — pas de soft-lock', () => {
  it('0 carte éligible → pendingLevelUp reste null et la scène ne gèle pas', () => {
    const sim = new Simulation({ seed: 42, mode: 'solo' })

    const maxedWeapons = Object.values(WEAPONS)
      .filter((w) => w.maxLevel > 1) // armes de base uniquement (évoluées = maxLevel 1)
      .map((w) => ({ id: w.id, level: w.maxLevel }))
    const maxedPassives = Object.values(PASSIVES).map((p) => ({ id: p.id, level: p.maxLevel }))

    sim.debugGrant({ weapons: maxedWeapons, passives: maxedPassives })
    sim.debugAddXp(1_000_000) // largement au-dessus du palier courant

    sim.advanceTime(STEP_MS)

    const state = sim.getState()
    expect(state.pendingLevelUp).toBeNull()
    expect(state.scene).toBe('game')
  })
})
