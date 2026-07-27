import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { spawnBoss } from '@core/systems/spawn'
import { reapDeadEnemies } from '@core/systems/reap'
import { World } from '@core/world'
import { ENEMIES, MINI_BOSS_ID } from '@content/enemies'
import type { EnemyDef } from '@content/enemies'

function miniBossDef(): EnemyDef {
  const def = ENEMIES[MINI_BOSS_ID]
  if (def === undefined) {
    throw new Error('def mini-boss manquante')
  }
  return def
}

function firstEnemy(w: World): number {
  const [e] = [...w.query('enemy')]
  if (e === undefined) {
    throw new Error('aucun ennemi spawné')
  }
  return e
}

describe('reap — coffre à la mort du boss de mi-parcours', () => {
  it('un boss mid mort lâche un pickup coffre', () => {
    const w = new World()
    spawnBoss(w, miniBossDef(), { x: 100, y: 100 }, 0, 0, 'mid')
    const boss = firstEnemy(w)
    const health = w.get(boss, 'health')
    if (health === undefined) {
      throw new Error('boss sans composant health')
    }
    health.hp = 0
    reapDeadEnemies(w)
    const coffres = [...w.query('pickup')].filter((e) => w.get(e, 'pickup')?.type === 'coffre')
    expect(coffres.length).toBe(1)
  })

  it('un boss final mort NE lâche PAS de coffre', () => {
    const w = new World()
    spawnBoss(w, miniBossDef(), { x: 100, y: 100 }, 0, 0, 'final')
    const boss = firstEnemy(w)
    const health = w.get(boss, 'health')
    if (health === undefined) {
      throw new Error('boss sans composant health')
    }
    health.hp = 0
    reapDeadEnemies(w)
    const coffres = [...w.query('pickup')].filter((e) => w.get(e, 'pickup')?.type === 'coffre')
    expect(coffres.length).toBe(0)
  })
})

describe('simulation — split de boss', () => {
  it("la victoire n'arrive PAS avant le boss final (~20:00)", () => {
    // Le boss mid à 5:00 ne doit pas déclencher la victoire.
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    // Avant tout spawn de boss, on est forcément en 'game' : aucun boss final
    // n'a spawné -> updateWin ne peut pas déclencher la victoire.
    expect(sim.getState().scene).toBe('game')
  })

  it('debugSpawnBoss("mid") : tuer le boss mid ne gagne PAS, et laisse un coffre', () => {
    const sim = new Simulation({ seed: 7, mode: 'solo' })
    sim.debugSpawnBoss('mid')
    // Cette spécification vérifie la transition de mort, pas le DPS du build :
    // elle ne doit pas devenir rouge quand les PV du boss sont rééquilibrés.
    sim.debugKillBoss('mid')
    sim.advanceTime(100)
    const finalState = sim.getState()
    expect(finalState.enemies.some((e) => e.bossRole === 'mid')).toBe(false)
    expect(finalState.pickups.some((pickup) => pickup.type === 'coffre')).toBe(true)
    expect(finalState.scene).toBe('game')
  })

  it('debugSpawnBoss("final") : tuer le boss final déclenche la victoire', () => {
    const sim = new Simulation({ seed: 7, mode: 'solo' })
    sim.debugSpawnBoss('final')
    sim.debugKillBoss('final')
    sim.advanceTime(100)
    expect(sim.getState().scene).toBe('won')
  })
})

describe('simulation — bossRole exposé dans la vue (getState)', () => {
  it('debugSpawnBoss("final") → enemies[].bossRole === "final"', () => {
    const sim = new Simulation({ seed: 7, mode: 'solo' })
    sim.debugSpawnBoss('final')
    const boss = sim.getState().enemies.find((e) => e.isBoss)
    expect(boss?.bossRole).toBe('final')
  })

  it('debugSpawnBoss("mid") → enemies[].bossRole === "mid"', () => {
    const sim = new Simulation({ seed: 7, mode: 'solo' })
    sim.debugSpawnBoss('mid')
    const boss = sim.getState().enemies.find((e) => e.isBoss)
    expect(boss?.bossRole).toBe('mid')
  })
})
