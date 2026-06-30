import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { enemyAiSystem } from '@core/systems/enemyAi'
import type { EntityId } from '@core/types'

function addPlayer(w: World, x: number, y: number): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
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

  it('vise le joueur VIVANT le plus proche', () => {
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
})
