import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { MID_BOSS_WAVES } from '@content/config'

/** Premier palier de mid-boss : 5:00. */
const FIRST_MID_BOSS_MS = MID_BOSS_WAVES.atMs[0] ?? 300_000

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
    // Avance loin mais avant le seuil du premier palier (5:00).
    let t = 0
    while (t < FIRST_MID_BOSS_MS - 1000 && sim.getState().scene === 'game') {
      if (sim.getState().pendingLevelUp !== null) {
        sim.chooseUpgrade(0)
        continue
      }
      sim.advanceTime(100)
      t += 100
    }
    expect(sim.getState().enemies.some((e) => e.isBoss)).toBe(false)
  })

  it('le mini-boss apparaît à 5:00 quand le joueur survit jusque-là', () => {
    // Avec l'équilibrage « arc long », un kiter survit au climax sur la plupart
    // des seeds. On cherche une run survivante et on vérifie le seuil d'apparition.
    let found = false
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = new Simulation({ seed, mode: 'solo' })
      const { bossAt, aliveAtBoss } = surviveUntilBoss(sim, 330_000)
      if (bossAt >= 0) {
        expect(bossAt).toBeGreaterThanOrEqual(FIRST_MID_BOSS_MS)
        expect(bossAt).toBeLessThan(FIRST_MID_BOSS_MS + 1000)
        expect(aliveAtBoss).toBe(true)
        found = true
        break
      }
    }
    expect(found).toBe(true) // au moins une run habile atteint le premier climax
  })
})
