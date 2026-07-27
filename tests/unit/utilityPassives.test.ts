import { describe, expect, it } from 'vitest'
import { effectiveWeaponStats } from '@content/effectiveStats'
import {
  BASE_STATS,
  aggregatePassives,
  utilityPassiveEffects
} from '@content/passives'
import { WEAPONS, weaponStatsAtLevel } from '@content/weapons'
import type { AuraPulse } from '@core/events'
import { SpatialGrid } from '@core/spatialGrid'
import { collisionSystem } from '@core/systems/collision'
import { pickupSystem } from '@core/systems/pickup'
import { recomputePlayerStats } from '@core/systems/playerStats'
import { recordRendementKills, utilityPassiveSystem } from '@core/systems/utilityPassives'
import { weaponSystem } from '@core/systems/weapon'
import { World } from '@core/world'

function addPlayer(
  world: World,
  passives: { id: string; level: number }[],
  weaponId = 'cloueur',
  velocity = { x: 0, y: 0 }
): number {
  const entity = world.spawn()
  world.add(entity, 'position', { x: 0, y: 0 })
  world.add(entity, 'velocity', velocity)
  world.add(entity, 'health', { hp: 100, maxHp: 100 })
  world.add(entity, 'player', {
    playerId: 1,
    speed: 200,
    vigilance: 100,
    damageMult: 1,
    cooldownMult: 1,
    pickupRadius: 90,
    facing: { x: 1, y: 0 }
  })
  world.add(entity, 'weapons', {
    slots: [{ id: weaponId, level: 1, cooldownLeftMs: 0 }]
  })
  world.add(entity, 'passives', { list: passives })
  world.add(entity, 'stats', { ...BASE_STATS })
  recomputePlayerStats(world, entity)
  return entity
}

function addEnemy(
  world: World,
  x: number,
  y: number,
  hp = 100,
  lastHitBy?: number
): number {
  const entity = world.spawn()
  world.add(entity, 'position', { x, y })
  world.add(entity, 'velocity', { x: 0, y: 0 })
  world.add(entity, 'health', { hp, maxHp: Math.max(1, hp) })
  world.add(entity, 'enemy', {
    type: 'paperasse',
    speed: 0,
    isElite: false,
    isBoss: false,
    contactDamage: 10,
    xpValue: 8,
    ...(lastHitBy === undefined ? {} : { lastHitBy })
  })
  return entity
}

function grid(world: World): SpatialGrid {
  const result = new SpatialGrid(128)
  for (const entity of world.query('enemy', 'position')) {
    const position = world.get(entity, 'position')
    if (position !== undefined) {
      result.insert(entity, position.x, position.y)
    }
  }
  return result
}

describe('passifs utilitaires du point 4', () => {
  it('conserve les bonus de base et borne les nouveaux capstones', () => {
    const stats = aggregatePassives([
      { id: 'air_comprime', level: 5 },
      { id: 'casque_homologue', level: 5 },
      { id: 'chaussures_securite', level: 5 },
      { id: 'aimant_chantier', level: 5 },
      { id: 'batterie_18v', level: 5 },
      { id: 'prime_rendement', level: 5 }
    ])
    const effects = utilityPassiveEffects([
      { id: 'air_comprime', level: 5 },
      { id: 'casque_homologue', level: 5 },
      { id: 'chaussures_securite', level: 5 },
      { id: 'aimant_chantier', level: 5 },
      { id: 'prime_rendement', level: 5 }
    ])

    expect(stats.projectileSpeed).toBe(1.5)
    expect(stats.maxHp).toBe(1.5)
    expect(stats.moveSpeed).toBe(1.5)
    expect(stats.magnet).toBe(1.4)
    expect(stats.duration).toBe(1.6)
    expect(stats.growth).toBe(1.25)
    expect(effects).toEqual(expect.objectContaining({
      projectileRangeScale: 1.1,
      contactRepulseForce: 140,
      movingSweepKnockbackScale: 1.2,
      magnetPullScale: 1.25,
      rendementBurstThreshold: 10,
      rendementBurstXpScale: 1.25
    }))
  })

  it('Air comprimé niveau 5 augmente la portée réelle sans modifier les dégâts', () => {
    const world = new World()
    addPlayer(world, [{ id: 'air_comprime', level: 5 }])
    addEnemy(world, 200, 0)
    weaponSystem(world, 0)
    const projectileId = world.query('projectile').next().value as number
    const projectile = world.get(projectileId, 'projectile')
    const velocity = world.get(projectileId, 'velocity')

    expect(projectile?.lifeMs).toBeCloseTo(1650)
    expect(velocity?.x).toBe(780)
    expect(projectile?.damage).toBe(8)
  })

  it('Batterie 18V prolonge toutes les durées explicitement compatibles', () => {
    const stats = aggregatePassives([{ id: 'batterie_18v', level: 5 }])
    const extinguisher = WEAPONS['extincteur']
    const tar = WEAPONS['goudron']
    const wrench = WEAPONS['cle_molette']
    if (extinguisher === undefined || tar === undefined || wrench === undefined) {
      throw new Error('arme de test absente')
    }

    expect(effectiveWeaponStats(weaponStatsAtLevel(extinguisher, 1), stats).slowMs).toBe(1120)
    expect(effectiveWeaponStats(weaponStatsAtLevel(tar, 1), stats).projectileLifeMs).toBe(4800)
    expect(effectiveWeaponStats(weaponStatsAtLevel(wrench, 1), stats).boomerangOutMs).toBe(688)
  })

  it('Aimant de chantier accélère réellement une gemme déjà dans le rayon', () => {
    const base = new World()
    addPlayer(base, [])
    const baseGem = base.spawn()
    base.add(baseGem, 'position', { x: 80, y: 0 })
    base.add(baseGem, 'pickup', { type: 'xp', value: 1 })
    pickupSystem(base, 100)

    const boosted = new World()
    addPlayer(boosted, [{ id: 'aimant_chantier', level: 5 }])
    const boostedGem = boosted.spawn()
    boosted.add(boostedGem, 'position', { x: 80, y: 0 })
    boosted.add(boostedGem, 'pickup', { type: 'xp', value: 1 })
    pickupSystem(boosted, 100)

    expect(base.get(baseGem, 'position')?.x).toBe(38)
    expect(boosted.get(boostedGem, 'position')?.x).toBe(27.5)
  })

  it('Casque niveau 5 repousse au contact avec une recharge bornée', () => {
    const world = new World()
    const player = addPlayer(world, [{ id: 'casque_homologue', level: 5 }])
    const enemy = addEnemy(world, 20, 0)
    const pulses: AuraPulse[] = []

    collisionSystem(world, 16, grid(world), pulses)
    expect(world.get(enemy, 'knockback')?.vx).toBe(140)
    expect(world.get(player, 'player')?.casqueRepulseCooldownMs).toBe(600)
    collisionSystem(world, 16, grid(world), pulses)
    expect(world.get(enemy, 'knockback')?.vx).toBe(140)
    expect(pulses.filter((pulse) => pulse.kind === 'casque_repulse')).toHaveLength(1)
  })

  it('Chaussures niveau 5 renforcent seulement un balayage effectué en mouvement', () => {
    const moving = new World()
    addPlayer(moving, [{ id: 'chaussures_securite', level: 5 }], 'pied_de_biche', { x: 100, y: 0 })
    const movingEnemy = addEnemy(moving, 80, 0)
    weaponSystem(moving, 0)

    const stopped = new World()
    addPlayer(stopped, [{ id: 'chaussures_securite', level: 5 }], 'pied_de_biche')
    const stoppedEnemy = addEnemy(stopped, 80, 0)
    weaponSystem(stopped, 0)

    expect(moving.get(movingEnemy, 'knockback')?.vx).toBe(360)
    expect(stopped.get(stoppedEnemy, 'knockback')?.vx).toBe(300)
  })

  it('Prime niveau 5 active un bonus temporaire après 10 kills en chaîne', () => {
    const world = new World()
    const player = addPlayer(world, [{ id: 'prime_rendement', level: 5 }])
    world.add(player, 'progress', { xp: 0, level: 1, nextThreshold: 100 })

    recordRendementKills(world, new Map([[1, 6]]))
    expect(world.get(player, 'player')?.rendementComboKills).toBe(6)
    utilityPassiveSystem(world, 2000)
    expect(world.get(player, 'player')?.rendementComboWindowMs).toBe(1000)
    recordRendementKills(world, new Map([[1, 4]]))
    expect(world.get(player, 'player')?.rendementBoostMs).toBe(5000)

    const boostedGem = world.spawn()
    world.add(boostedGem, 'position', { x: 0, y: 0 })
    world.add(boostedGem, 'pickup', { type: 'xp', value: 8 })
    pickupSystem(world, 16)
    expect(world.get(player, 'progress')?.xp).toBe(13)

    utilityPassiveSystem(world, 5000)
    const normalGem = world.spawn()
    world.add(normalGem, 'position', { x: 0, y: 0 })
    world.add(normalGem, 'pickup', { type: 'xp', value: 8 })
    pickupSystem(world, 16)
    expect(world.get(player, 'progress')?.xp).toBe(23)
  })
})
