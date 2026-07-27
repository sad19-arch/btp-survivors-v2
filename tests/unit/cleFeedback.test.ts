import { describe, expect, it } from 'vitest'
import type { AuraPulse } from '@core/events'
import { boomerangSystem } from '@core/systems/boomerang'
import { World } from '@core/world'

function addPlayer(world: World): void {
  const player = world.spawn()
  world.add(player, 'position', { x: 0, y: 0 })
  world.add(player, 'health', { hp: 100, maxHp: 100 })
  world.add(player, 'player', {
    playerId: 1,
    speed: 200,
    vigilance: 100,
    damageMult: 1,
    cooldownMult: 1,
    pickupRadius: 90
  })
}

function addWrench(world: World, weaponId = 'cle_molette'): void {
  const projectile = world.spawn()
  world.add(projectile, 'position', { x: 180, y: 24 })
  world.add(projectile, 'velocity', { x: 380, y: 0 })
  world.add(projectile, 'projectile', {
    type: weaponId,
    damage: 16,
    ownerId: 1,
    lifeMs: 2_400,
    radius: 6,
    pierce: 4,
    boomerangOutMs: 100,
    returning: false,
    hitIds: []
  })
}

describe('feedback d’inversion de la Clé', () => {
  it('n’émet rien avant la fin de l’aller', () => {
    const world = new World()
    addPlayer(world)
    addWrench(world)
    const pulses: AuraPulse[] = []

    boomerangSystem(world, 50, pulses)

    expect(pulses.filter((pulse) => pulse.kind === 'boomerang_turn')).toHaveLength(0)
  })

  it.each(['cle_molette', 'cle_choc'])('%s émet une inversion unique à sa position exacte', (weaponId) => {
    const world = new World()
    addPlayer(world)
    addWrench(world, weaponId)
    const pulses: AuraPulse[] = []

    boomerangSystem(world, 101, pulses)
    boomerangSystem(world, 16, pulses)

    expect(pulses.filter((pulse) => pulse.kind === 'boomerang_turn')).toEqual([
      expect.objectContaining({
        x: 180,
        y: 24,
        kind: 'boomerang_turn',
        weaponId,
        ownerId: 1
      })
    ])
  })
})
