import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { WORLD } from '@content/config'
import type { PlayerState } from '@core/types'

/**
 * Régression du bug « le joueur sort du monde et disparaît hors-champ » :
 * on pilote le vrai jeu via le seam (setInput/advanceTime) et on asserte sur
 * l'état renvoyé (getState), jamais sur les pixels.
 */

/** Tient une direction pendant `ms` puis renvoie l'état du joueur 1. */
function runHolding(seed: number, move: { x: number; y: number }, ms: number): PlayerState {
  const sim = new Simulation({ seed, mode: 'solo' })
  sim.setInput(1, { move, attack: false })
  sim.advanceTime(ms)
  const p = sim.getState().players[0]
  expect(p).toBeDefined()
  if (p === undefined) {
    throw new Error('joueur 1 absent')
  }
  return p
}

describe('Simulation — le joueur reste borné au monde (régression hors-champ)', () => {
  it('tenir une direction 60 s ne fait pas sortir le joueur à droite', () => {
    // Sans bornage, x vaudrait ~12800 (200 px/s × 60 s + centre).
    const p = runHolding(42, { x: 1, y: 0 }, 60_000)
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.x).toBeLessThanOrEqual(WORLD.width)
  })

  it('borne aussi en diagonale (coin bas-droite)', () => {
    const p = runHolding(7, { x: 1, y: 1 }, 120_000)
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.y).toBeGreaterThanOrEqual(0)
    expect(p.x).toBeLessThanOrEqual(WORLD.width)
    expect(p.y).toBeLessThanOrEqual(WORLD.height)
  })

  it('borne aussi vers le coin haut-gauche (origine)', () => {
    const p = runHolding(7, { x: -1, y: -1 }, 120_000)
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.y).toBeGreaterThanOrEqual(0)
    expect(p.x).toBeLessThanOrEqual(WORLD.width)
    expect(p.y).toBeLessThanOrEqual(WORLD.height)
  })
})
