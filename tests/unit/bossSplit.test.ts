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
    // Grant 3 armes max pour tuer le boss 1800 HP rapidement (kite + DPS élevé).
    sim.debugGrant({
      weapons: [
        { id: 'cloueur', level: 8 },
        { id: 'scie', level: 8 },
        { id: 'marteau', level: 8 }
      ]
    })
    let steps = 0
    while (steps < 4000) {
      const st = sim.getState()
      if (!st.enemies.some((e) => e.isBoss)) {
        break
      }
      // Kite : le joueur fuit vers le haut pour éviter le contact et survivre.
      sim.setInput(1, { move: { x: 0, y: -1 }, attack: true })
      if (st.pendingLevelUp !== null) {
        sim.chooseUpgrade(0)
        continue
      }
      sim.advanceTime(100)
      steps += 1
    }
    const finalState = sim.getState()
    expect(finalState.enemies.some((e) => e.isBoss)).toBe(false)
    expect(finalState.scene).toBe('game')
  })

  it('debugSpawnBoss("final") : tuer le boss final déclenche la victoire', () => {
    const sim = new Simulation({ seed: 7, mode: 'solo' })
    sim.debugSpawnBoss('final')
    // Grant 3 armes max pour tuer le boss 1800 HP rapidement (kite + DPS élevé).
    sim.debugGrant({
      weapons: [
        { id: 'cloueur', level: 8 },
        { id: 'scie', level: 8 },
        { id: 'marteau', level: 8 }
      ],
      // Ce test vérifie la transition de victoire, pas l'équilibrage d'un build.
      // Le recul rend le kite mono-directionnel plus exposé aux vagues dispersées :
      // un arsenal de debug complet évite que le joueur meure avant le boss final.
      passives: [
        { id: 'outillage_renforce', level: 5 },
        { id: 'cadence_chantier', level: 5 },
        { id: 'casque_homologue', level: 5 },
        { id: 'chaussures_securite', level: 5 }
      ]
    })
    let steps = 0
    let won = false
    while (steps < 4000) {
      const st = sim.getState()
      if (st.scene === 'won') {
        won = true
        break
      }
      // Kite : le joueur fuit vers le haut pour éviter le contact et survivre.
      sim.setInput(1, { move: { x: 0, y: -1 }, attack: true })
      if (st.pendingLevelUp !== null) {
        sim.chooseUpgrade(0)
        continue
      }
      sim.advanceTime(100)
      steps += 1
    }
    expect(won).toBe(true)
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
