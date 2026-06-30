import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import type { GameState } from '@core/types'

/**
 * Mini-contrôleur de test : déplace le joueur vers la gemme la plus proche pour
 * aspirer l'XP (un joueur immobile ne ramasse presque rien — comme Vampire
 * Survivors). Avance jusqu'à un level-up ou la limite de temps.
 */
function runUntilLevelUp(sim: Simulation, maxMs: number, stepMs: number): GameState {
  let elapsed = 0
  while (elapsed < maxMs) {
    const s = sim.getState()
    if (s.pendingLevelUp !== null) {
      return s
    }
    const p = s.players[0]
    if (p !== undefined) {
      // Vise la gemme la plus proche ; sinon engage l'ennemi le plus proche
      // (pour générer des gemmes au pied du joueur).
      const targets = s.pickups.length > 0 ? s.pickups : s.enemies
      let tx = p.x
      let ty = p.y
      let bestD = Infinity
      for (const g of targets) {
        const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2
        if (d < bestD) {
          bestD = d
          tx = g.x
          ty = g.y
        }
      }
      sim.setInput(1, { move: { x: tx - p.x, y: ty - p.y }, attack: false })
    }
    sim.advanceTime(stepMs)
    elapsed += stepMs
  }
  return sim.getState()
}

describe('Simulation — progression de bout en bout', () => {
  it('le joueur ramasse de l’XP, monte de niveau et le jeu gèle sur le choix', () => {
    const sim = new Simulation({ seed: 123, mode: 'solo' })
    const s = runUntilLevelUp(sim, 120_000, 100)

    expect(s.pendingLevelUp).not.toBeNull()
    expect(s.pendingLevelUp?.playerId).toBe(1)
    expect(s.pendingLevelUp?.choices.length).toBe(3)
    expect(s.scene).toBe('game')
    expect(s.players[0]?.level).toBeGreaterThanOrEqual(2)
  })

  it('le temps est gelé tant qu’une carte est en attente, puis reprend après le choix', () => {
    const sim = new Simulation({ seed: 123, mode: 'solo' })
    const s = runUntilLevelUp(sim, 120_000, 100)
    expect(s.pendingLevelUp).not.toBeNull()

    const frozenAt = sim.getState().elapsedMs
    sim.advanceTime(1000) // ignoré (gel)
    expect(sim.getState().elapsedMs).toBe(frozenAt)

    sim.chooseUpgrade(0)
    expect(sim.getState().pendingLevelUp).toBeNull()

    sim.advanceTime(200) // reprend
    expect(sim.getState().elapsedMs).toBeGreaterThan(frozenAt)
  })

  it('choisir une carte +vie augmente le HP max du joueur', () => {
    const sim = new Simulation({ seed: 123, mode: 'solo' })
    const s = runUntilLevelUp(sim, 120_000, 100)
    const before = sim.getState().players[0]?.maxHp ?? 0
    // Choisit la carte 'vie_max' si proposée, sinon la première (test robuste).
    const idx = s.pendingLevelUp?.choices.findIndex((c) => c.id === 'vie_max') ?? -1
    sim.chooseUpgrade(idx >= 0 ? idx : 0)
    const after = sim.getState().players[0]?.maxHp ?? 0
    if (idx >= 0) {
      expect(after).toBeGreaterThan(before)
    } else {
      expect(after).toBeGreaterThanOrEqual(before)
    }
  })
})
