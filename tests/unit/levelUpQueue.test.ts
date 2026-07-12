import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { STEP_MS } from '@core/clock'
import { PROGRESSION } from '@content/config'

/**
 * Vérifie que la file de choix (choiceQueue) se comporte de façon iso par rapport
 * à l'ancien champ scalaire pendingLevelUp :
 * - 2 paliers XP bankés → 1er pendingLevelUp visible, temps gelé.
 * - après chooseUpgrade(0) → 2e pendingLevelUp visible, temps toujours gelé.
 * - après chooseUpgrade(0) → null, temps dégelé.
 */
describe('file de choix (choiceQueue)', () => {
  it('2 paliers XP bankes → file s enchaîne sans soft-lock', () => {
    const sim = new Simulation({ seed: 42, mode: 'solo' })

    // XP juste suffisante pour 2 paliers (calculée depuis PROGRESSION, robuste au tuning
    // de growth) : firstThreshold + ceil(firstThreshold × growth), sans atteindre le 3e.
    const twoLevels = PROGRESSION.firstThreshold + Math.ceil(PROGRESSION.firstThreshold * PROGRESSION.growth)
    sim.debugAddXp(twoLevels)
    sim.advanceTime(STEP_MS)

    // Premier choix visible
    const st1 = sim.getState()
    expect(st1.pendingLevelUp).not.toBeNull()
    expect(st1.pendingLevelUp?.choices.length).toBeGreaterThan(0)

    // Le temps doit être gelé (la scène reste 'game' mais la sim est frozen)
    const elapsedBefore = st1.elapsedMs
    sim.advanceTime(STEP_MS * 10)
    expect(sim.getState().elapsedMs).toBe(elapsedBefore)

    // Choix du premier palier → le second doit apparaître immédiatement
    sim.chooseUpgrade(0)
    const st2 = sim.getState()
    expect(st2.pendingLevelUp).not.toBeNull()
    expect(st2.pendingLevelUp?.choices.length).toBeGreaterThan(0)

    // Toujours gelé
    sim.advanceTime(STEP_MS * 10)
    expect(sim.getState().elapsedMs).toBe(elapsedBefore)

    // Choix du second palier → file vide, temps dégelé
    sim.chooseUpgrade(0)
    const st3 = sim.getState()
    expect(st3.pendingLevelUp).toBeNull()

    // Le temps avance maintenant
    sim.advanceTime(STEP_MS)
    expect(sim.getState().elapsedMs).toBeGreaterThan(elapsedBefore)
  })
})
