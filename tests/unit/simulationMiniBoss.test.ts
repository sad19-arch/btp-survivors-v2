import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { MINI_BOSS } from '@content/config'

/**
 * Contrôleur « kite » : fuit l'ennemi le plus proche et se recentre près des
 * bords. Le joueur (200 px/s) distance tous les ennemis → survit jusqu'au
 * mini-boss. Choisit toujours la 1re carte aux montées de niveau.
 */
function surviveUntilBoss(sim: Simulation, maxMs: number): { bossAt: number; aliveAtBoss: boolean } {
  let elapsed = 0
  while (elapsed < maxMs) {
    const s = sim.getState()
    if (s.scene === 'gameover') {
      return { bossAt: -1, aliveAtBoss: false }
    }
    if (s.enemies.some((e) => e.isBoss)) {
      return { bossAt: s.elapsedMs, aliveAtBoss: (s.players[0]?.alive ?? false) }
    }
    if (s.pendingLevelUp !== null) {
      sim.chooseUpgrade(0)
      continue
    }
    const p = s.players[0]
    if (p !== undefined) {
      let nx = 0
      let ny = 0
      let bd = Infinity
      for (const e of s.enemies) {
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
        if (d < bd) {
          bd = d
          nx = p.x - e.x
          ny = p.y - e.y
        }
      }
      const cx = 800 - p.x
      const cy = 600 - p.y
      const edge = Math.hypot(cx, cy) > 500 ? 2 : 0
      sim.setInput(1, { move: { x: nx + cx * edge, y: ny + cy * edge }, attack: false })
    }
    sim.advanceTime(100)
    elapsed += 100
  }
  return { bossAt: -1, aliveAtBoss: false }
}

describe('Simulation — mini-boss', () => {
  it('aucun mini-boss avant 5:00', () => {
    const sim = new Simulation({ seed: 42, mode: 'solo' })
    sim.setInput(1, { move: { x: 1, y: 0 }, attack: false })
    // Avance loin mais avant le seuil (le joueur file vers le bord, peu d'enjeu).
    let t = 0
    while (t < MINI_BOSS.atMs - 1000 && sim.getState().scene === 'game') {
      if (sim.getState().pendingLevelUp !== null) {
        sim.chooseUpgrade(0)
        continue
      }
      sim.advanceTime(100)
      t += 100
    }
    expect(sim.getState().enemies.some((e) => e.isBoss)).toBe(false)
  })

  it('le mini-boss apparaît à 5:00, le joueur étant encore en vie', () => {
    const sim = new Simulation({ seed: 42, mode: 'solo' })
    const { bossAt, aliveAtBoss } = surviveUntilBoss(sim, 330_000)
    expect(bossAt).toBeGreaterThanOrEqual(MINI_BOSS.atMs)
    expect(bossAt).toBeLessThan(MINI_BOSS.atMs + 1000)
    expect(aliveAtBoss).toBe(true)
  })
})
