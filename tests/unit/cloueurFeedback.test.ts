import { describe, expect, it } from 'vitest'
import type { AuraPulse } from '@core/events'
import { SpatialGrid } from '@core/spatialGrid'
import { collisionSystem } from '@core/systems/collision'
import { World } from '@core/world'

function addEnemy(world: World, x = 0, hp = 100): number {
  const enemy = world.spawn()
  world.add(enemy, 'position', { x, y: 0 })
  world.add(enemy, 'velocity', { x: 0, y: 0 })
  world.add(enemy, 'health', { hp, maxHp: hp })
  world.add(enemy, 'enemy', {
    type: 'paperasse',
    speed: 0,
    isElite: false,
    isBoss: false,
    contactDamage: 0,
    xpValue: 1
  })
  return enemy
}

function addNail(world: World, type = 'cloueur'): number {
  const projectile = world.spawn()
  world.add(projectile, 'position', { x: 0, y: 0 })
  world.add(projectile, 'velocity', { x: 500, y: 0 })
  world.add(projectile, 'projectile', {
    type,
    damage: 8,
    ownerId: 1,
    lifeMs: 1000,
    radius: 6,
    pierce: 0,
    hitIds: []
  })
  return projectile
}

function grid(world: World): SpatialGrid {
  const result = new SpatialGrid(64)
  for (const enemy of world.query('enemy', 'position')) {
    const pos = world.get(enemy, 'position')
    if (pos !== undefined) {
      result.insert(enemy, pos.x, pos.y)
    }
  }
  return result
}

describe('feedback spécialisé du Cloueur', () => {
  it.each(['cloueur', 'mitrailleuse_clous'])(
    '%s émet un impact sur la victime réellement touchée',
    (type) => {
      const world = new World()
      addNail(world, type)
      const enemy = addEnemy(world, 0)
      const pulses: AuraPulse[] = []

      collisionSystem(world, 16, grid(world), pulses)

      expect(world.get(enemy, 'health')?.hp).toBe(92)
      expect(pulses).toEqual([{
        x: 0,
        y: 0,
        radius: 6,
        kind: 'projectile_hit',
        weaponId: type,
        ownerId: 1
      }])
    }
  )

  it('borne les sparks sans borner les dégâts de la Mitrailleuse', () => {
    const world = new World()
    const enemy = addEnemy(world, 0, 1_000)
    for (let i = 0; i < 20; i++) {
      addNail(world, 'mitrailleuse_clous')
    }
    const pulses: AuraPulse[] = []

    collisionSystem(world, 16, grid(world), pulses)

    expect(world.get(enemy, 'health')?.hp).toBe(840)
    expect(pulses).toHaveLength(16)
  })
})
