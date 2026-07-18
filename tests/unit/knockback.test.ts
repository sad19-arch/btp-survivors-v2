import { describe, expect, it } from 'vitest'
import { WEAPONS } from '@content/weapons'
import { ENEMIES } from '@content/enemies'
import { BASE_STATS } from '@content/passives'
import { World } from '@core/world'
import { SpatialGrid } from '@core/spatialGrid'
import { collisionSystem } from '@core/systems/collision'
import { hazardSystem } from '@core/systems/hazard'
import {
  applyEnemyHit,
  knockbackSystem,
  KNOCKBACK_MAX_SPEED
} from '@core/systems/knockback'
import { resolveObstacleCollisions } from '@core/systems/obstacleCollision'
import { spawnEnemy } from '@core/systems/spawn'
import { weaponSystem } from '@core/systems/weapon'
import type { EntityId } from '@core/types'
import type { Obstacle } from '@core/siteLayout'

function addEnemy(
  world: World,
  x = 0,
  y = 0,
  knockbackMult = 1,
  hp = 1000
): EntityId {
  const entity = world.spawn()
  world.add(entity, 'position', { x, y })
  world.add(entity, 'velocity', { x: 0, y: 0 })
  world.add(entity, 'health', { hp, maxHp: hp })
  world.add(entity, 'enemy', {
    type: 'paperasse',
    speed: 0,
    isElite: false,
    isBoss: false,
    knockbackMult,
    contactDamage: 0,
    xpValue: 1
  })
  return entity
}

function addPlayer(world: World, weaponId: string, x = 0, y = 0): EntityId {
  const entity = world.spawn()
  world.add(entity, 'position', { x, y })
  world.add(entity, 'velocity', { x: 0, y: 0 })
  world.add(entity, 'health', { hp: 100, maxHp: 100 })
  world.add(entity, 'player', {
    playerId: 1,
    speed: 200,
    vigilance: 100,
    damageMult: 1,
    cooldownMult: 1,
    pickupRadius: 90
  })
  world.add(entity, 'weapons', { slots: [{ id: weaponId, level: 1, cooldownLeftMs: 0 }] })
  world.add(entity, 'stats', { ...BASE_STATS })
  return entity
}

function buildGrid(world: World): SpatialGrid {
  const grid = new SpatialGrid(64)
  for (const entity of world.query('enemy', 'position')) {
    const position = world.get(entity, 'position')
    if (position !== undefined) {
      grid.insert(entity, position.x, position.y)
    }
  }
  return grid
}

function travelDistance(force: number): number {
  const world = new World()
  const enemy = addEnemy(world)
  applyEnemyHit(world, enemy, 0, { knockback: force, direction: { x: 1, y: 0 } })
  for (let i = 0; i < 100 && world.has(enemy, 'knockback'); i++) {
    knockbackSystem(world, 10)
  }
  return world.get(enemy, 'position')?.x ?? 0
}

describe('recul physique central', () => {
  it('applique dégâts, attribution et direction normalisée', () => {
    const world = new World()
    const enemy = addEnemy(world)
    applyEnemyHit(world, enemy, 25, { ownerId: 3, knockback: 170, direction: { x: 3, y: 4 } })

    expect(world.get(enemy, 'health')?.hp).toBe(975)
    expect(world.get(enemy, 'enemy')?.lastHitBy).toBe(3)
    expect(world.get(enemy, 'knockback')).toEqual({ vx: 102, vy: 136 })
  })

  it('utilise +X pour un vecteur nul et supprime une impulsion sous 20 px/s', () => {
    const world = new World()
    const enemy = addEnemy(world)
    applyEnemyHit(world, enemy, 0, { knockback: 19, direction: { x: 0, y: 0 } })
    knockbackSystem(world, 16)
    expect(world.get(enemy, 'position')).toEqual({ x: 0, y: 0 })
    expect(world.get(enemy, 'knockback')).toBeUndefined()
  })

  it('cumule vectoriellement et plafonne la norme à 520 px/s', () => {
    const world = new World()
    const enemy = addEnemy(world)
    applyEnemyHit(world, enemy, 0, { knockback: 400, direction: { x: 1, y: 0 } })
    applyEnemyHit(world, enemy, 0, { knockback: 400, direction: { x: 0, y: 1 } })
    const impulse = world.get(enemy, 'knockback')
    expect(Math.hypot(impulse?.vx ?? 0, impulse?.vy ?? 0)).toBeCloseTo(KNOCKBACK_MAX_SPEED, 8)
    expect(impulse?.vx).toBeCloseTo(impulse?.vy ?? 0, 8)
  })

  it('atteint les distances cibles du cloueur, marteau-piqueur et brouette', () => {
    expect(travelDistance(170)).toBeGreaterThanOrEqual(5)
    expect(travelDistance(170)).toBeLessThanOrEqual(7)
    expect(travelDistance(360)).toBeGreaterThanOrEqual(20)
    expect(travelDistance(360)).toBeLessThanOrEqual(28)
    expect(travelDistance(420)).toBeGreaterThanOrEqual(30)
    expect(travelDistance(420)).toBeLessThanOrEqual(40)
  })

  it.each([
    ['paperasse', false, 1],
    ['inspecteur', false, 1.1],
    ['huissier', false, 0.55],
    ['convoyeur', false, 0.35],
    ['contremaitre', true, 0.12]
  ] as const)('initialise la résistance %s boss=%s à %s', (enemyId, isBoss, expected) => {
    const world = new World()
    const def = ENEMIES[enemyId]
    expect(def).toBeDefined()
    if (def === undefined) {
      return
    }
    spawnEnemy(world, def, { x: 0, y: 0 }, isBoss)
    const entity = [...world.query('enemy')][0]
    expect(entity).toBeDefined()
    if (entity !== undefined) {
      expect(world.get(entity, 'enemy')?.knockbackMult).toBe(expected)
    }
  })

  it('applique le multiplicateur sans modifier la vélocité de l’IA', () => {
    const world = new World()
    const enemy = addEnemy(world, 0, 0, 0.35)
    const velocity = world.get(enemy, 'velocity')
    if (velocity !== undefined) {
      velocity.x = -80
    }
    applyEnemyHit(world, enemy, 0, { knockback: 200, direction: { x: 1, y: 0 } })
    expect(world.get(enemy, 'knockback')?.vx).toBe(70)
    expect(world.get(enemy, 'velocity')).toEqual({ x: -80, y: 0 })
  })
})

describe('transmission du recul par les armes', () => {
  it('conserve la table de forces validée pour les 24 armes', () => {
    const expected = {
      cloueur: 170,
      scie: 90,
      marteau: 360,
      pied_de_biche: 300,
      court_circuit: 140,
      goudron: 0,
      boulons: 170,
      cle_molette: 230,
      extincteur: 260,
      brouette: 420,
      chalumeau: 120,
      mitrailleuse_clous: 95,
      haute_tension: 220,
      coulee_bitume: 0,
      tempete_boulons: 130,
      cle_choc: 320,
      canon_mousse: 380,
      transpalette: 500,
      lance_thermique: 180,
      bonbonne_chantier: 300,
      detonation_chaine: 380,
      tronconneuse_chantier: 130,
      brise_roche: 430,
      barre_a_mine: 400
    }
    expect(Object.fromEntries(Object.entries(WEAPONS).map(([id, def]) => [id, def.knockback]))).toEqual(expected)
  })

  it.each([
    ['marteau', 100, 0, 360],
    ['pied_de_biche', 100, 0, 300],
    ['court_circuit', 80, 0, 140],
    ['extincteur', 80, 0, 260],
    ['chalumeau', 70, 0, 120]
  ] as const)('%s transmet sa force et sa direction attendues', (weaponId, x, y, force) => {
    const world = new World()
    addPlayer(world, weaponId)
    const enemy = addEnemy(world, x, y)
    weaponSystem(world, 16)
    expect(world.get(enemy, 'knockback')?.vx).toBeCloseTo(force, 5)
    expect(world.get(enemy, 'knockback')?.vy).toBeCloseTo(0, 5)
  })

  it('la scie applique un recul radial depuis la lame', () => {
    const world = new World()
    addPlayer(world, 'scie')
    const enemy = addEnemy(world, 104, 8)
    weaponSystem(world, 16)
    const impulse = world.get(enemy, 'knockback')
    expect(impulse).toBeDefined()
    expect(Math.hypot(impulse?.vx ?? 0, impulse?.vy ?? 0)).toBeCloseTo(90, 5)
  })

  it.each([
    ['cloueur', 170],
    ['boulons', 170],
    ['cle_molette', 230],
    ['brouette', 420],
    ['mitrailleuse_clous', 95],
    ['tempete_boulons', 130],
    ['cle_choc', 320],
    ['transpalette', 500]
  ] as const)('%s place sa force fixe dans ses projectiles', (weaponId, force) => {
    const world = new World()
    addPlayer(world, weaponId)
    addEnemy(world, 100, 0)
    weaponSystem(world, 16)
    const projectile = [...world.query('projectile')][0]
    expect(projectile).toBeDefined()
    if (projectile !== undefined) {
      expect(world.get(projectile, 'projectile')?.knockback).toBe(force)
    }
  })

  it.each([
    ['simple', {}],
    ['perforant', { pierce: 2 }],
    ['ricochet', { bounces: 1, hitIds: [] as number[] }],
    ['boomerang', { boomerangOutMs: 100, returning: true }]
  ])('un projectile %s pousse dans sa direction de déplacement', (_label, modifiers) => {
    const world = new World()
    const enemy = addEnemy(world)
    const projectile = world.spawn()
    world.add(projectile, 'position', { x: 0, y: 0 })
    world.add(projectile, 'velocity', { x: -300, y: 0 })
    world.add(projectile, 'projectile', {
      type: 'test',
      damage: 10,
      ownerId: 2,
      lifeMs: 1000,
      radius: 6,
      pierce: 0,
      knockback: 170,
      ...modifiers
    })
    collisionSystem(world, 16, buildGrid(world))
    expect(world.get(enemy, 'knockback')?.vx).toBe(-170)
    expect(world.get(enemy, 'enemy')?.lastHitBy).toBe(2)
  })

  it.each(['goudron', 'coulee_bitume'] as const)('%s inflige ses dégâts sans aucun recul', (weaponId) => {
    const world = new World()
    addPlayer(world, weaponId)
    const enemy = addEnemy(world, 0, 64)
    weaponSystem(world, 16)
    hazardSystem(world, 16)
    expect(world.get(enemy, 'health')?.hp).toBeLessThan(1000)
    expect(world.get(enemy, 'knockback')).toBeUndefined()
    expect(WEAPONS[weaponId]?.knockback).toBe(0)
  })
})

describe('recul et obstacles', () => {
  it('ne traverse pas une structure après la seconde résolution', () => {
    const world = new World()
    const enemy = addEnemy(world, 33, 50)
    const wall: Obstacle = {
      kind: 'segment',
      x: 50,
      y: 0,
      x2: 50,
      y2: 100,
      thickness: 10,
      blocks: 'enemies'
    }
    applyEnemyHit(world, enemy, 0, { knockback: 500, direction: { x: 1, y: 0 } })
    knockbackSystem(world, 16)
    resolveObstacleCollisions(world, [wall])
    expect(world.get(enemy, 'position')?.x).toBeCloseTo(33, 5)
  })
})
