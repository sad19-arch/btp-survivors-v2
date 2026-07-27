import { describe, expect, it } from 'vitest'
import type { AuraPulse } from '@core/events'
import { SpatialGrid } from '@core/spatialGrid'
import { collisionSystem } from '@core/systems/collision'
import { World } from '@core/world'

function addEnemy(world: World, x: number, hp = 100): number {
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

function addBolt(world: World, type = 'boulons'): number {
  const projectile = world.spawn()
  world.add(projectile, 'position', { x: 0, y: 0 })
  world.add(projectile, 'velocity', { x: 470, y: 0 })
  world.add(projectile, 'projectile', {
    type,
    damage: 8,
    ownerId: 1,
    lifeMs: 1000,
    radius: 6,
    pierce: 0,
    bounces: 3,
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

describe('feedback des Boulons ricochets', () => {
  it.each(['boulons', 'tempete_boulons'])(
    '%s émet un flash uniquement quand une cible de rebond est trouvée',
    (type) => {
      const world = new World()
      const projectile = addBolt(world, type)
      addEnemy(world, 0)
      addEnemy(world, 100)
      const pulses: AuraPulse[] = []

      collisionSystem(world, 16, grid(world), pulses)

      expect(world.get(projectile, 'projectile')?.bounces).toBe(2)
      expect(world.get(projectile, 'velocity')?.x).toBeGreaterThan(0)
      expect(pulses).toEqual([{
        x: 0,
        y: 0,
        radius: 6,
        kind: 'ricochet_hit',
        weaponId: type,
        ownerId: 1
      }])
    }
  )

  it('n’émet aucun flash de rebond lorsqu’aucune cible suivante n’existe', () => {
    const world = new World()
    addBolt(world)
    addEnemy(world, 0)
    const pulses: AuraPulse[] = []

    collisionSystem(world, 16, grid(world), pulses)

    expect(pulses).toEqual([])
  })

  it('borne les flashes sans borner les impacts ni les redirections', () => {
    const world = new World()
    const first = addEnemy(world, 0, 1_000)
    addEnemy(world, 100, 1_000)
    const projectiles = Array.from({ length: 20 }, () => addBolt(world, 'tempete_boulons'))
    const pulses: AuraPulse[] = []

    collisionSystem(world, 16, grid(world), pulses)

    expect(world.get(first, 'health')?.hp).toBe(840)
    expect(projectiles.every((projectile) =>
      world.get(projectile, 'projectile')?.bounces === 2
    )).toBe(true)
    expect(pulses).toHaveLength(12)
  })
})
