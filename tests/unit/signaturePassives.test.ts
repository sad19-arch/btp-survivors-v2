import { describe, expect, it } from 'vitest'
import { EVOLUTIONS } from '@content/evolutions'
import {
  BASE_STATS,
  PASSIVES,
  aggregatePassives,
  signaturePassiveEffects
} from '@content/passives'
import type { AuraPulse } from '@core/events'
import { Simulation } from '@core/simulation'
import { SpatialGrid } from '@core/spatialGrid'
import { collisionSystem } from '@core/systems/collision'
import { weaponSystem } from '@core/systems/weapon'
import type { PassiveDebugMetric } from '@core/types'
import { World } from '@core/world'

function addPlayer(
  world: World,
  weaponId: string,
  passives: { id: string; level: number }[] = []
): number {
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
  world.add(player, 'weapons', { slots: [{ id: weaponId, level: 1, cooldownLeftMs: 0 }] })
  world.add(player, 'passives', { list: passives })
  world.add(player, 'stats', { ...BASE_STATS })
  return player
}

function addEnemy(world: World, x: number, y: number, hp = 100): number {
  const enemy = world.spawn()
  world.add(enemy, 'position', { x, y })
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

function firstProjectile(world: World) {
  const id = world.query('projectile').next().value as number | undefined
  return id === undefined ? undefined : world.get(id, 'projectile')
}

function firstOrbiter(world: World) {
  const id = world.query('orbiter').next().value as number | undefined
  return id === undefined ? undefined : world.get(id, 'orbiter')
}

function enemyGrid(world: World): SpatialGrid {
  const grid = new SpatialGrid(128)
  for (const enemy of world.query('enemy', 'position')) {
    const position = world.get(enemy, 'position')
    if (position !== undefined) {
      grid.insert(enemy, position.x, position.y)
    }
  }
  return grid
}

describe('passifs signatures', () => {
  it('ne modifient plus les dégâts ou la recharge génériques', () => {
    const stats = aggregatePassives([
      { id: 'surcharge_gaz', level: 5 },
      { id: 'disque_diamant', level: 5 },
      { id: 'compresseur_pneumatique', level: 5 }
    ])

    expect(stats.might).toBe(1)
    expect(stats.cooldown).toBe(1)
  })

  it('applique exactement les cinq paliers de chaque passif', () => {
    const expected = [
      { explosion: 1, size: 1, threshold: Infinity, haste: 0 },
      { explosion: 1.1, size: 1.08, threshold: 5, haste: 0.1 },
      { explosion: 1.2, size: 1.16, threshold: 5, haste: 0.15 },
      { explosion: 1.3, size: 1.24, threshold: 4, haste: 0.2 },
      { explosion: 1.4, size: 1.32, threshold: 4, haste: 0.25 },
      { explosion: 1.4, size: 1.32, threshold: 3, haste: 0.3 }
    ]

    expected.forEach((row, level) => {
      const effects = signaturePassiveEffects([
        { id: 'surcharge_gaz', level },
        { id: 'disque_diamant', level },
        { id: 'compresseur_pneumatique', level }
      ])
      expect(effects.explosionScale).toBeCloseTo(row.explosion)
      expect(effects.secondaryExplosions).toBe(level === 5)
      expect(effects.contactSizeScale).toBeCloseTo(row.size)
      expect(effects.contactKnockbackScale).toBe(level >= 3 ? 1.15 : 1)
      expect(effects.contactReimpact).toBe(level === 5)
      expect(effects.heavyImpactThreshold).toBe(row.threshold)
      expect(effects.heavyImpactHaste).toBeCloseTo(row.haste)
    })
  })

  it('Surcharge agrandit la vraie explosion sans agrandir le projectile', () => {
    for (const [level, radius] of [[1, 52.8], [3, 62.4], [5, 67.2]] as const) {
      const world = new World()
      addPlayer(world, 'bonbonne_chantier', [{ id: 'surcharge_gaz', level }])
      weaponSystem(world, 16)
      const projectile = firstProjectile(world)

      expect(projectile?.radius).toBe(16)
      expect(projectile?.explosionRadius).toBeCloseTo(radius)
      expect(projectile?.secondaryExplosionOnCenterKill).toBe(level === 5 ? true : undefined)
    }
  })

  it('Surcharge niveau 5 crée un petit souffle non récursif sur une victime centrale', () => {
    const world = new World()
    addPlayer(world, 'bonbonne_chantier', [{ id: 'surcharge_gaz', level: 5 }])
    weaponSystem(world, 16)
    const projectileId = world.query('projectile').next().value as number
    const projectilePosition = world.get(projectileId, 'position')
    if (projectilePosition === undefined) {
      throw new Error('projectile de test absent')
    }
    projectilePosition.x = 20
    const center = addEnemy(world, 20, 0, 10)
    const neighbor = addEnemy(world, 38, 0, 100)
    const pulses: AuraPulse[] = []
    const metrics: PassiveDebugMetric[] = []

    collisionSystem(world, 16, enemyGrid(world), pulses, metrics)

    expect(world.get(center, 'health')?.hp).toBeLessThanOrEqual(0)
    expect(world.get(neighbor, 'health')?.hp).toBe(85)
    expect(pulses.filter((pulse) => pulse.kind === 'explosion')).toHaveLength(2)
    expect(metrics).toContainEqual(expect.objectContaining({
      passive_id: 'surcharge_gaz',
      passive_level: 5,
      secondary_explosions_created: 1
    }))
  })

  it('Disque agrandit les scies et le balayage, mais pas le marteau', () => {
    const scie = new World()
    addPlayer(scie, 'scie', [{ id: 'disque_diamant', level: 5 }])
    weaponSystem(scie, 0)
    expect(firstOrbiter(scie)?.hitRadius).toBeCloseTo(22 * 1.32)

    const sweep = new World()
    addPlayer(sweep, 'pied_de_biche', [{ id: 'disque_diamant', level: 5 }])
    addEnemy(sweep, 150, 0)
    const sweepPulses: AuraPulse[] = []
    weaponSystem(sweep, 0, sweepPulses)
    expect(sweepPulses[0]?.radius).toBeCloseTo(120 * 1.32 + 12)

    const hammer = new World()
    addPlayer(hammer, 'marteau', [{ id: 'disque_diamant', level: 5 }])
    const hammerPulses: AuraPulse[] = []
    weaponSystem(hammer, 0, hammerPulses)
    expect(hammerPulses[0]?.radius).toBe(175 + 12)
  })

  it('Disque niveau 3 renforce légèrement le recul réel', () => {
    const world = new World()
    addPlayer(world, 'pied_de_biche', [{ id: 'disque_diamant', level: 3 }])
    const enemy = addEnemy(world, 80, 0)
    weaponSystem(world, 0)

    expect(world.get(enemy, 'knockback')?.vx).toBeCloseTo(300 * 1.15)
  })

  it('Disque niveau 5 réimpacte une cible une seule fois après 120 ms', () => {
    const world = new World()
    const player = addPlayer(world, 'pied_de_biche', [{ id: 'disque_diamant', level: 5 }])
    const enemy = addEnemy(world, 80, 0)
    const pulses: AuraPulse[] = []
    const metrics: PassiveDebugMetric[] = []

    weaponSystem(world, 0, pulses, undefined, undefined, undefined, metrics)
    expect(world.get(enemy, 'health')?.hp).toBe(86)
    weaponSystem(world, 119, pulses, undefined, undefined, undefined, metrics)
    expect(world.get(enemy, 'health')?.hp).toBe(86)
    weaponSystem(world, 1, pulses, undefined, undefined, undefined, metrics)
    expect(world.get(enemy, 'health')?.hp).toBe(72)
    weaponSystem(world, 1, pulses, undefined, undefined, undefined, metrics)
    expect(world.get(enemy, 'health')?.hp).toBe(72)
    expect(world.get(player, 'weapons')?.slots[0]?.pendingImpacts).toHaveLength(0)
    expect(pulses.filter((pulse) => pulse.kind === 'passive_reimpact')).toHaveLength(1)
  })

  it.each([
    { level: 1, threshold: 5, haste: 0.1 },
    { level: 2, threshold: 5, haste: 0.15 },
    { level: 3, threshold: 4, haste: 0.2 },
    { level: 4, threshold: 4, haste: 0.25 },
    { level: 5, threshold: 3, haste: 0.3 }
  ])('Compresseur niveau $level exige $threshold impacts lourds', ({ level, threshold, haste }) => {
    const miss = new World()
    const missPlayer = addPlayer(miss, 'marteau', [{ id: 'compresseur_pneumatique', level }])
    for (let i = 0; i < threshold - 1; i++) {
      addEnemy(miss, 50 + i * 10, 0)
    }
    weaponSystem(miss, 0)
    expect(worldCooldown(miss, missPlayer)).toBe(900)

    const hit = new World()
    const hitPlayer = addPlayer(hit, 'marteau', [{ id: 'compresseur_pneumatique', level }])
    for (let i = 0; i < threshold; i++) {
      addEnemy(hit, 50 + i * 10, 0)
    }
    weaponSystem(hit, 0)
    expect(worldCooldown(hit, hitPlayer)).toBeCloseTo(900 * (1 - haste))
  })

  it('transporte Compresseur sur les armes lourdes à projectile et l’applique une fois', () => {
    const world = new World()
    const player = addPlayer(world, 'brouette', [{ id: 'compresseur_pneumatique', level: 5 }])
    for (let i = 0; i < 3; i++) {
      addEnemy(world, 20 + i * 4, 0)
    }
    weaponSystem(world, 0)
    const projectileId = world.query('projectile').next().value as number
    const position = world.get(projectileId, 'position')
    if (position === undefined) {
      throw new Error('projectile de test absent')
    }
    position.x = 20

    for (let i = 0; i < 3; i++) {
      collisionSystem(world, 16, enemyGrid(world))
    }

    expect(worldCooldown(world, player)).toBe(980)
    expect(firstProjectile(world)?.heavyImpactApplied).toBe(true)
  })

  it('Compresseur ne se déclenche qu’une fois pour une salve lourde multi-projectiles', () => {
    const world = new World()
    const player = addPlayer(world, 'bonbonne_chantier', [
      { id: 'compresseur_pneumatique', level: 5 }
    ])
    const loadout = world.get(player, 'weapons')
    if (loadout === undefined) {
      throw new Error('loadout de test absent')
    }
    loadout.slots[0] = { id: 'bonbonne_chantier', level: 5, cooldownLeftMs: 0 }
    for (let i = 0; i < 3; i++) {
      addEnemy(world, 20 + i * 4, 0, 1000)
    }
    weaponSystem(world, 0)
    for (const projectileId of world.query('projectile', 'position')) {
      const position = world.get(projectileId, 'position')
      if (position !== undefined) {
        position.x = 20
      }
    }

    collisionSystem(world, 16, enemyGrid(world))

    expect(worldCooldown(world, player)).toBe(630)
    expect(loadout.slots[0]?.heavyImpactAppliedAttackId).toBe(1)
  })

  it('conserve les trois recettes comme catalyseurs', () => {
    expect(EVOLUTIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        base: 'bonbonne_chantier',
        passive: 'surcharge_gaz',
        evolved: 'detonation_chaine'
      }),
      expect.objectContaining({
        base: 'scie',
        passive: 'disque_diamant',
        evolved: 'tronconneuse_chantier'
      }),
      expect.objectContaining({
        base: 'marteau',
        passive: 'compresseur_pneumatique',
        evolved: 'brise_roche'
      })
    ]))
    expect(PASSIVES['surcharge_gaz']?.description).toContain('explosions')
    expect(PASSIVES['disque_diamant']?.description).toContain('réimpactent')
    expect(PASSIVES['compresseur_pneumatique']?.description).toContain('prochaine frappe')
  })

  it('ne collecte les métriques structurées qu’en mode test/dev explicite', () => {
    const production = new Simulation({ seed: 42, mode: 'solo' })
    production.debugGrant({
      weapons: [{ id: 'bonbonne_chantier', level: 1 }],
      passives: [{ id: 'surcharge_gaz', level: 5 }]
    })
    production.advanceTime(20)
    expect(production.debugPassiveInfo()).toHaveLength(0)

    const debug = new Simulation({ seed: 42, mode: 'solo', debugMetrics: true })
    debug.debugGrant({
      weapons: [{ id: 'bonbonne_chantier', level: 1 }],
      passives: [{ id: 'surcharge_gaz', level: 5 }]
    })
    debug.advanceTime(20)
    expect(debug.debugPassiveInfo()).toContainEqual(expect.objectContaining({
      passive_id: 'surcharge_gaz',
      passive_level: 5
    }))
  })
})

function worldCooldown(world: World, player: number): number {
  return world.get(player, 'weapons')?.slots[0]?.cooldownLeftMs ?? -1
}
