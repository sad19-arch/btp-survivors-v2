import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { collisionSystem } from '@core/systems/collision'
import { reapDeadEnemies } from '@core/systems/reap'
import { projectileLifetimeSystem } from '@core/systems/projectile'
import type { EntityId } from '@core/types'

function addEnemy(w: World, x: number, y: number, hp: number, contactDamage = 10): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'enemy', { type: 'paperasse', speed: 50, isElite: false, isBoss: false, contactDamage, xpValue: 5 })
  return e
}

function addProjectile(w: World, x: number, y: number, damage: number, lifeMs = 1000): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'projectile', { type: 'cloueur', damage, ownerId: 1, lifeMs, radius: 6, pierce: 0 })
  return e
}

function addPlayer(w: World, x: number, y: number, hp = 100): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
  return e
}

describe('collisionSystem', () => {
  it('un projectile qui touche un ennemi lui inflige ses dégâts et disparaît', () => {
    const w = new World()
    const enemy = addEnemy(w, 0, 0, 10)
    const proj = addProjectile(w, 0, 0, 6)
    collisionSystem(w, 16)
    expect(w.get(enemy, 'health')?.hp).toBe(4)
    expect(w.alive(proj)).toBe(false)
  })

  it('un ennemi tombé à 0 HP est récolté (mort + gemme)', () => {
    const w = new World()
    const enemy = addEnemy(w, 0, 0, 5)
    addProjectile(w, 0, 0, 6)
    collisionSystem(w, 16)
    expect(w.get(enemy, 'health')?.hp).toBeLessThanOrEqual(0)
    const kills = reapDeadEnemies(w)
    expect(kills).toBe(1)
    expect(w.alive(enemy)).toBe(false)
    // Une gemme d'XP a été lâchée.
    const gems = [...w.query('pickup')]
    expect(gems.length).toBe(1)
  })

  it('n\'affecte pas un ennemi hors de portée du projectile', () => {
    const w = new World()
    const enemy = addEnemy(w, 500, 0, 10)
    const proj = addProjectile(w, 0, 0, 6)
    collisionSystem(w, 16)
    expect(w.get(enemy, 'health')?.hp).toBe(10)
    expect(w.alive(proj)).toBe(true)
  })

  it('un ennemi au contact inflige des dégâts continus au joueur', () => {
    const w = new World()
    const player = addPlayer(w, 0, 0, 100)
    addEnemy(w, 0, 0, 10, 10) // 10 dégâts/seconde
    collisionSystem(w, 1000) // 1 seconde
    expect(w.get(player, 'health')?.hp).toBeCloseTo(90)
  })

  it('ne blesse pas le joueur si l\'ennemi est loin', () => {
    const w = new World()
    const player = addPlayer(w, 0, 0, 100)
    addEnemy(w, 800, 0, 10, 10)
    collisionSystem(w, 1000)
    expect(w.get(player, 'health')?.hp).toBe(100)
  })
})

describe('projectileLifetimeSystem', () => {
  it('décrémente la durée de vie puis supprime le projectile expiré', () => {
    const w = new World()
    const proj = addProjectile(w, 100, 100, 6, 100)
    projectileLifetimeSystem(w, 16)
    expect(w.get(proj, 'projectile')?.lifeMs).toBeCloseTo(84)
    expect(w.alive(proj)).toBe(true)
    projectileLifetimeSystem(w, 200)
    expect(w.alive(proj)).toBe(false)
  })

  it('supprime un projectile sorti des limites du monde', () => {
    const w = new World()
    const proj = addProjectile(w, -100, 100, 6, 1000)
    projectileLifetimeSystem(w, 16)
    expect(w.alive(proj)).toBe(false)
  })
})
