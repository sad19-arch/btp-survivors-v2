import { describe, expect, it } from 'vitest'
import { BASE_STATS } from '@content/passives'
import type { AuraPulse } from '@core/events'
import { weaponSystem } from '@core/systems/weapon'
import { World } from '@core/world'

function addPlayer(world: World, weaponId: string): void {
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
    pickupRadius: 90
  })
  world.add(player, 'weapons', { slots: [{ id: weaponId, level: 1, cooldownLeftMs: 0 }] })
  world.add(player, 'stats', { ...BASE_STATS })
}

function addEnemy(world: World, x: number, y: number): number {
  const enemy = world.spawn()
  world.add(enemy, 'position', { x, y })
  world.add(enemy, 'velocity', { x: 0, y: 0 })
  world.add(enemy, 'health', { hp: 1_000, maxHp: 1_000 })
  world.add(enemy, 'enemy', {
    type: 'paperasse',
    speed: 80,
    isElite: false,
    isBoss: false,
    contactDamage: 5,
    xpValue: 5
  })
  return enemy
}

describe('feedback de contact des armes cône', () => {
  it.each([
    ['extincteur', true],
    ['chalumeau', false]
  ] as const)('%s émet une marque sur chaque cible réellement touchée', (weaponId, expectsSlow) => {
    const world = new World()
    addPlayer(world, weaponId)
    const enemy = addEnemy(world, 80, 0)
    const pulses: AuraPulse[] = []

    weaponSystem(world, 16, pulses)

    expect(pulses).toContainEqual(expect.objectContaining({
      kind: 'cone_hit',
      weaponId,
      x: 80,
      y: 0
    }))
    expect(world.get(enemy, 'slow') !== undefined).toBe(expectsSlow)
  })

  it('n’émet aucune marque pour une cible hors du cône', () => {
    const world = new World()
    addPlayer(world, 'extincteur')
    addEnemy(world, 60, 0)
    addEnemy(world, -80, 0)
    const pulses: AuraPulse[] = []

    weaponSystem(world, 16, pulses)

    const contacts = pulses.filter((pulse) => pulse.kind === 'cone_hit')
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toEqual(expect.objectContaining({ x: 60, y: 0 }))
  })

  it('borne les marques à 12 sans borner les 20 impacts de dégâts', () => {
    const world = new World()
    addPlayer(world, 'extincteur')
    const enemies = Array.from({ length: 20 }, (_, index) => {
      const angle = -0.35 + (index / 19) * 0.7
      return addEnemy(world, Math.cos(angle) * 80, Math.sin(angle) * 80)
    })
    const pulses: AuraPulse[] = []

    weaponSystem(world, 16, pulses)

    expect(pulses.filter((pulse) => pulse.kind === 'cone_hit')).toHaveLength(12)
    expect(enemies.filter((enemy) => (world.get(enemy, 'health')?.hp ?? 1_000) < 1_000)).toHaveLength(20)
  })
})
