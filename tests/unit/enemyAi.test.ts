import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { enemyAiSystem } from '@core/systems/enemyAi'
import type { EntityId } from '@core/types'

function addPlayer(w: World, x: number, y: number, playerId = 1): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', { playerId, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
  return e
}

function addEnemy(w: World, x: number, y: number, speed: number): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 10, maxHp: 10 })
  w.add(e, 'enemy', { type: 'paperasse', speed, isElite: false, isBoss: false, contactDamage: 5, xpValue: 5 })
  return e
}

describe('enemyAiSystem', () => {
  it('oriente la vélocité vers le joueur, à la vitesse de l\'ennemi', () => {
    const w = new World()
    addPlayer(w, 0, 0)
    const enemy = addEnemy(w, 100, 0, 50)
    enemyAiSystem(w)
    const vel = w.get(enemy, 'velocity')
    expect(vel?.x ?? 0).toBeLessThan(0) // va vers la gauche (vers le joueur)
    expect(vel?.y ?? 1).toBeCloseTo(0)
    expect(Math.hypot(vel?.x ?? 0, vel?.y ?? 0)).toBeCloseTo(50)
  })

  it('ignore un joueur à terre quand un autre joueur est vivant', () => {
    const w = new World()
    addPlayer(w, -10, 0) // proche mais...
    // rend ce joueur mort
    const deadId = w.query('player').next().value as EntityId
    const deadHealth = w.get(deadId, 'health')
    if (deadHealth !== undefined) {
      deadHealth.hp = 0
    }
    addPlayer(w, 200, 0) // vivant, plus loin
    const enemy = addEnemy(w, 0, 0, 60)
    enemyAiSystem(w)
    const vel = w.get(enemy, 'velocity')
    expect(vel?.x ?? 0).toBeGreaterThan(0) // va à droite vers le joueur vivant
  })

  it('met la vélocité à zéro si aucun joueur vivant', () => {
    const w = new World()
    const enemy = addEnemy(w, 50, 50, 40)
    enemyAiSystem(w)
    const vel = w.get(enemy, 'velocity')
    expect(vel).toEqual({ x: 0, y: 0 })
  })

  it('répartit équitablement les ennemis entre trois joueurs vivants à distance égale', () => {
    const w = new World()
    addPlayer(w, -100, 0, 1)
    addPlayer(w, 100, 0, 2)
    addPlayer(w, 0, -100, 3)
    const enemies = Array.from({ length: 6 }, () => addEnemy(w, 0, 0, 50))

    enemyAiSystem(w)

    const directions = enemies.map((enemy) => w.get(enemy, 'velocity') ?? { x: 0, y: 0 })
    expect(directions.filter((velocity) => velocity.x < -1).length).toBe(2)
    expect(directions.filter((velocity) => velocity.x > 1).length).toBe(2)
    expect(directions.filter((velocity) => velocity.y < -1).length).toBe(2)
    expect(enemies.map((enemy) => w.get(enemy, 'enemy')?.targetPlayerId)).toEqual([1, 2, 3, 1, 2, 3])
  })

  it('réaffecte la charge d’un joueur à terre entre les survivants', () => {
    const w = new World()
    addPlayer(w, -100, 0, 1)
    const player2 = addPlayer(w, 100, 0, 2)
    addPlayer(w, 0, -100, 3)
    const enemies = Array.from({ length: 6 }, () => addEnemy(w, 0, 0, 50))
    enemyAiSystem(w)

    const health2 = w.get(player2, 'health')
    if (health2 === undefined) {
      throw new Error('PV J2 manquants')
    }
    health2.hp = 0
    enemyAiSystem(w)

    const assignments = enemies.map((enemy) => w.get(enemy, 'enemy')?.targetPlayerId)
    expect(assignments).not.toContain(2)
    expect(assignments.filter((playerId) => playerId === 1).length).toBe(3)
    expect(assignments.filter((playerId) => playerId === 3).length).toBe(3)
  })
})
