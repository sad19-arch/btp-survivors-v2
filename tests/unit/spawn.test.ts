import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { Rng } from '@core/rng'
import { spawnWave, spawnBoss } from '@core/systems/spawn'
import { PHASES, ConstructionPhaseId, phasePoolIds } from '@content/phases'
import { ENEMIES, MINI_BOSS_ID } from '@content/enemies'
import { SPAWN } from '@content/config'
import type { ConstructionPhase } from '@content/phases'

function terrainVierge(): ConstructionPhase {
  const phase = PHASES[ConstructionPhaseId.TERRAIN_VIERGE]
  if (phase === undefined) {
    throw new Error('phase terrain_vierge manquante')
  }
  return phase
}

describe('spawnWave (déterministe)', () => {
  it('crée le nombre demandé d\'ennemis, au rayon, avec un type du pool de la phase', () => {
    const w = new World()
    const rng = new Rng(1)
    const phase = terrainVierge()
    const center = { x: 800, y: 600 }
    spawnWave(w, rng, phase, center, 3)

    const enemies = [...w.query('enemy', 'position', 'health')]
    expect(enemies).toHaveLength(3)
    const pool = phasePoolIds(phase)
    for (const e of enemies) {
      const pos = w.get(e, 'position')
      const en = w.get(e, 'enemy')
      const h = w.get(e, 'health')
      expect(h?.hp ?? 0).toBeGreaterThan(0)
      expect(pool).toContain(en?.type)
      const d = Math.hypot((pos?.x ?? 0) - center.x, (pos?.y ?? 0) - center.y)
      expect(d).toBeCloseTo(SPAWN.ringRadius, 0)
    }
  })

  it('produit exactement la même vague pour une même seed', () => {
    const snapshot = (): string[] => {
      const w = new World()
      spawnWave(w, new Rng(5), terrainVierge(), { x: 0, y: 0 }, 4)
      return [...w.query('enemy', 'position')].map((e) => {
        const en = w.get(e, 'enemy')
        const pos = w.get(e, 'position')
        return `${en?.type}@${Math.round(pos?.x ?? 0)},${Math.round(pos?.y ?? 0)}`
      })
    }
    expect(snapshot()).toEqual(snapshot())
  })

  it('spawnBoss pose isBoss + bossRole', () => {
    const w = new World()
    const def = ENEMIES[MINI_BOSS_ID]
    if (def === undefined) {
      throw new Error('def mini-boss manquante')
    }
    spawnBoss(w, def, { x: 800, y: 600 }, 0, 320, 'mid')
    const [e] = [...w.query('enemy')]
    if (e === undefined) {
      throw new Error('aucun ennemi spawné')
    }
    const comp = w.get(e, 'enemy')
    expect(comp?.isBoss).toBe(true)
    expect(comp?.bossRole).toBe('mid')
  })
})
