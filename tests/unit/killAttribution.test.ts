/**
 * Tests d'attribution des kills par joueur (Task 15).
 *
 * Stratégie : 2 joueurs en mode 'coop', arme cloueur (projectile) pour chaque
 * joueur. On utilise le World + systèmes directement pour rester déterministe
 * (pas de Simulation + RNG aléatoire de spawn).
 *
 * Invariants vérifiés :
 *   - getState().players[0].kills === N (kills J1)
 *   - getState().players[1].kills === M (kills J2)
 *   - players[0].kills + players[1].kills <= score (score = total morts, certains peuvent
 *     être non attribués si tués par contact ennemi→joueur seul — ici aucun contact donc égal)
 */

import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { World } from '@core/world'
import { collisionSystem } from '@core/systems/collision'
import { reapDeadEnemies } from '@core/systems/reap'
import { SpatialGrid } from '@core/spatialGrid'
import type { EntityId } from '@core/types'

// --- helpers bas niveau (World direct) ----------------------------------------

function buildGrid(w: World): SpatialGrid {
  const g = new SpatialGrid(64)
  for (const e of w.query('enemy', 'position')) {
    const p = w.get(e, 'position')
    if (p !== undefined) {
      g.insert(e, p.x, p.y)
    }
  }
  return g
}

function addEnemy(w: World, x: number, y: number, hp: number): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'enemy', {
    type: 'paperasse',
    speed: 50,
    isElite: false,
    isBoss: false,
    contactDamage: 1,
    xpValue: 5
  })
  return e
}

function addProjectile(w: World, x: number, y: number, damage: number, ownerId: number): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'projectile', { type: 'cloueur', damage, ownerId, lifeMs: 1000, radius: 8, pierce: 0 })
  return e
}

// --- tests bas niveau (World direct) -------------------------------------------

describe('reapDeadEnemies — attribution lastHitBy', () => {
  it('retourne total=0 et killsByPlayer vide si aucun mort', () => {
    const w = new World()
    addEnemy(w, 0, 0, 10)
    const result = reapDeadEnemies(w)
    expect(result.total).toBe(0)
    expect(result.killsByPlayer.size).toBe(0)
  })

  it('attribue le kill au joueur 1 quand son projectile tue un ennemi', () => {
    const w = new World()
    const enemy = addEnemy(w, 0, 0, 5)
    addProjectile(w, 0, 0, 10, 1) // ownerId=1 → last hit by J1
    collisionSystem(w, 16, buildGrid(w))
    // L'ennemi doit être mort (hp <= 0).
    expect(w.get(enemy, 'health')?.hp).toBeLessThanOrEqual(0)
    const result = reapDeadEnemies(w)
    expect(result.total).toBe(1)
    expect(result.killsByPlayer.get(1)).toBe(1)
    expect(result.killsByPlayer.get(2)).toBeUndefined()
  })

  it('attribue le kill au joueur 2 quand son projectile tue un ennemi', () => {
    const w = new World()
    const enemy = addEnemy(w, 0, 0, 5)
    addProjectile(w, 0, 0, 10, 2) // ownerId=2 → last hit by J2
    collisionSystem(w, 16, buildGrid(w))
    expect(w.get(enemy, 'health')?.hp).toBeLessThanOrEqual(0)
    const result = reapDeadEnemies(w)
    expect(result.total).toBe(1)
    expect(result.killsByPlayer.get(2)).toBe(1)
    expect(result.killsByPlayer.get(1)).toBeUndefined()
  })

  it('attribue correctement N kills à J1 et M kills à J2', () => {
    const N = 3
    const M = 2
    const w = new World()

    // N ennemis pour J1 (pos x=0..N-1)
    for (let i = 0; i < N; i++) {
      addEnemy(w, i * 50, 0, 5)
      addProjectile(w, i * 50, 0, 10, 1)
    }
    // M ennemis pour J2 (pos y=100..100+M-1 pour ne pas chevaucher)
    for (let i = 0; i < M; i++) {
      addEnemy(w, i * 50, 100, 5)
      addProjectile(w, i * 50, 100, 10, 2)
    }
    collisionSystem(w, 16, buildGrid(w))
    const result = reapDeadEnemies(w)
    expect(result.total).toBe(N + M)
    expect(result.killsByPlayer.get(1)).toBe(N)
    expect(result.killsByPlayer.get(2)).toBe(M)
  })

  it('ennemi tué sans lastHitBy compte dans total mais pas dans killsByPlayer', () => {
    const w = new World()
    // Ennemi qui n'a reçu aucun dégât de joueur (hp forcé à 0 directement).
    const enemy = addEnemy(w, 0, 0, 5)
    const h = w.get(enemy, 'health')
    if (h !== undefined) {
      h.hp = 0
    }
    // Pas de lastHitBy → non attribué.
    const result = reapDeadEnemies(w)
    expect(result.total).toBe(1)
    expect(result.killsByPlayer.size).toBe(0)
  })
})

// --- tests via Simulation (vue getState) ----------------------------------------

describe('Simulation — kills par joueur dans getState (2 joueurs)', () => {
  it('getState().players[i].kills vaut 0 au départ', () => {
    const sim = new Simulation({ seed: 42, mode: 'coop' })
    const st = sim.getState()
    expect(st.players.length).toBe(2)
    expect(st.players[0]?.kills).toBe(0)
    expect(st.players[1]?.kills).toBe(0)
  })

  it('kills par joueur exposés dans getState après avance (déterministe)', () => {
    const run = (): { kills0: number; kills1: number; score: number } => {
      const sim = new Simulation({ seed: 7, mode: 'coop' })
      sim.setInput(1, { move: { x: 1, y: 0 }, attack: true })
      sim.setInput(2, { move: { x: -1, y: 0 }, attack: true })
      sim.advanceTime(20000)
      const st = sim.getState()
      return {
        kills0: st.players[0]?.kills ?? -1,
        kills1: st.players[1]?.kills ?? -1,
        score: st.score
      }
    }
    const r1 = run()
    const r2 = run()
    // Déterminisme : deux runs identiques donnent les mêmes valeurs.
    expect(r1).toEqual(r2)
    // Invariant : somme des kills attribués <= score total.
    expect(r1.kills0 + r1.kills1).toBeLessThanOrEqual(r1.score)
    // Au moins un kill a été attribué (le jeu a avancé assez longtemps).
    expect(r1.kills0 + r1.kills1).toBeGreaterThan(0)
  })

  it('solo : kills du joueur 1 = score global (tous les kills sont attribués)', () => {
    const sim = new Simulation({ seed: 3, mode: 'solo' })
    sim.setInput(1, { move: { x: 0, y: 0 }, attack: true })
    sim.advanceTime(15000)
    const st = sim.getState()
    const p1 = st.players[0]
    // En solo tous les kills viennent du joueur 1 → kills = score.
    expect(p1?.kills).toBe(st.score)
  })
})
