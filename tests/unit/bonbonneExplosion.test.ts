import { describe, expect, it } from 'vitest'
import { WEAPONS } from '@content/weapons'
import type { AuraPulse } from '@core/events'
import { SpatialGrid } from '@core/spatialGrid'
import { collisionSystem } from '@core/systems/collision'
import { weaponSystem } from '@core/systems/weapon'
import type { EntityId } from '@core/types'
import { World } from '@core/world'
import { BASE_STATS } from '@content/passives'

function addEnemy(world: World, x: number, hp = 100): EntityId {
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

function enemyGrid(world: World): SpatialGrid {
  const grid = new SpatialGrid(64)
  for (const enemy of world.query('enemy', 'position')) {
    const pos = world.get(enemy, 'position')
    if (pos !== undefined) {
      grid.insert(enemy, pos.x, pos.y)
    }
  }
  return grid
}

function addProjectile(
  world: World,
  type: 'bonbonne_chantier' | 'detonation_chaine',
  overrides: Record<string, number> = {}
): EntityId {
  const projectile = world.spawn()
  world.add(projectile, 'position', { x: 0, y: 0 })
  world.add(projectile, 'velocity', { x: 100, y: 0 })
  world.add(projectile, 'projectile', {
    type,
    damage: 20,
    ownerId: 1,
    lifeMs: 1000,
    radius: 6,
    pierce: 5,
    hitIds: [],
    explosionRadius: 48,
    explosionDamageMult: 0.5,
    ...overrides
  })
  return projectile
}

describe('Bonbonne de chantier — détonations', () => {
  it('porte des paramètres d’explosion data-driven à tous ses niveaux', () => {
    const levels = WEAPONS.bonbonne_chantier?.levels ?? []

    expect(levels).toHaveLength(8)
    expect(levels[0]?.explosionRadius).toBe(48)
    expect(levels[7]?.explosionRadius).toBe(76)
    expect(levels.every((level) => level.explosionDamageMult === 0.5)).toBe(true)
  })

  it('transmet les paramètres d’explosion au projectile produit par le vrai système d’armes', () => {
    const world = new World()
    const player = world.spawn()
    world.add(player, 'position', { x: 0, y: 0 })
    world.add(player, 'velocity', { x: 0, y: 0 })
    world.add(player, 'health', { hp: 100, maxHp: 100 })
    world.add(player, 'player', {
      playerId: 1,
      speed: 200,
      vigilance: 100,
      damageMult: 1,
      cooldownMult: 1,
      pickupRadius: 90,
      facing: { x: 1, y: 0 }
    })
    world.add(player, 'weapons', {
      slots: [{ id: 'bonbonne_chantier', level: 1, cooldownLeftMs: 0 }]
    })
    world.add(player, 'stats', { ...BASE_STATS })

    weaponSystem(world, 16)

    const projectileId = [...world.query('projectile')][0]
    expect(projectileId).toBeDefined()
    const projectile = projectileId === undefined ? undefined : world.get(projectileId, 'projectile')
    expect(projectile?.explosionRadius).toBe(48)
    expect(projectile?.explosionDamageMult).toBe(0.5)
  })

  it('inflige le plein impact à la cible et des dégâts de zone une seule fois aux voisins', () => {
    const world = new World()
    const projectile = addProjectile(world, 'bonbonne_chantier')
    const direct = addEnemy(world, 0)
    const nearby = addEnemy(world, 40)
    const outside = addEnemy(world, 100)
    const pulses: AuraPulse[] = []

    collisionSystem(world, 16, enemyGrid(world), pulses)

    expect(world.get(direct, 'health')?.hp).toBe(80)
    expect(world.get(nearby, 'health')?.hp).toBe(90)
    expect(world.get(outside, 'health')?.hp).toBe(100)
    expect(world.get(projectile, 'projectile')?.hitIds).toEqual([direct, nearby])
    expect(pulses).toEqual([
      { x: 0, y: 0, radius: 48, kind: 'explosion', weaponId: 'bonbonne_chantier' }
    ])
  })

  it('l’évolution propage deux détonations secondaires sans doubler les dégâts', () => {
    const world = new World()
    addProjectile(world, 'detonation_chaine', {
      damage: 62,
      explosionRadius: 96,
      chainExplosions: 2,
      chainRange: 160
    })
    const direct = addEnemy(world, 0)
    const first = addEnemy(world, 80)
    const second = addEnemy(world, 176)
    const third = addEnemy(world, 272)
    const outside = addEnemy(world, 440)
    const pulses: AuraPulse[] = []

    collisionSystem(world, 16, enemyGrid(world), pulses)

    expect(world.get(direct, 'health')?.hp).toBe(38)
    expect(world.get(first, 'health')?.hp).toBe(69)
    expect(world.get(second, 'health')?.hp).toBe(69)
    expect(world.get(third, 'health')?.hp).toBe(69)
    expect(world.get(outside, 'health')?.hp).toBe(100)
    expect(pulses.map((pulse) => pulse.x)).toEqual([0, 80, 176])
    expect(pulses.every((pulse) => pulse.kind === 'explosion')).toBe(true)
  })

  it('choisit la cible de chaîne par distance puis par id pour rester déterministe', () => {
    const world = new World()
    addProjectile(world, 'detonation_chaine', {
      explosionRadius: 10,
      chainExplosions: 1,
      chainRange: 100
    })
    const direct = addEnemy(world, 0)
    const lowerId = addEnemy(world, 60)
    const higherId = addEnemy(world, -60)
    const pulses: AuraPulse[] = []

    collisionSystem(world, 16, enemyGrid(world), pulses)

    expect(world.get(direct, 'health')?.hp).toBe(80)
    expect(world.get(lowerId, 'health')?.hp).toBe(90)
    expect(world.get(higherId, 'health')?.hp).toBe(100)
    expect(pulses.map((pulse) => pulse.x)).toEqual([0, 60])
  })

  it('borne les VFX de détonation d’un même pas sans borner les dégâts', () => {
    const world = new World()
    const direct = addEnemy(world, 0, 2_000)
    for (let i = 0; i < 20; i++) {
      addProjectile(world, 'detonation_chaine', {
        chainExplosions: 2,
        chainRange: 160
      })
    }
    const pulses: AuraPulse[] = []

    collisionSystem(world, 16, enemyGrid(world), pulses)

    expect(world.get(direct, 'health')?.hp).toBe(1_600)
    expect(pulses).toHaveLength(16)
  })

  it('ne chaîne pas vers un candidat de grille situé hors de la portée exacte', () => {
    const world = new World()
    addProjectile(world, 'detonation_chaine', {
      explosionRadius: 10,
      chainExplosions: 1,
      chainRange: 60
    })
    addEnemy(world, 0)
    const outside = addEnemy(world, 61)
    const pulses: AuraPulse[] = []

    collisionSystem(world, 16, enemyGrid(world), pulses)

    expect(world.get(outside, 'health')?.hp).toBe(100)
    expect(pulses).toHaveLength(1)
  })
})
