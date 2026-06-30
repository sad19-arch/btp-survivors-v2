import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { pickupSystem } from '@core/systems/pickup'
import { PICKUP } from '@content/config'
import { HITBOX } from '@content/config'

/** Crée un joueur de test avec un rayon d'aimantation donné. */
function makePlayer(world: World, x: number, y: number, pickupRadius: number): number {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'velocity', { x: 0, y: 0 })
  world.add(e, 'health', { hp: 100, maxHp: 100 })
  world.add(e, 'player', {
    playerId: 1,
    speed: 200,
    vigilance: 100,
    damageMult: 1,
    cooldownMult: 1,
    pickupRadius
  })
  world.add(e, 'progress', { xp: 0, level: 1, nextThreshold: 25 })
  return e
}

function makeGem(world: World, x: number, y: number, value: number): number {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'pickup', { type: 'xp', value })
  return e
}

describe('pickupSystem', () => {
  it('aimante une gemme dans le rayon vers le joueur', () => {
    const world = new World()
    makePlayer(world, 0, 0, 100)
    const gem = makeGem(world, 80, 0, 5) // dans le rayon (90 par défaut ici 100)
    pickupSystem(world, 16)
    const pos = world.get(gem, 'position')
    expect(pos).toBeDefined()
    // La gemme s'est rapprochée du joueur (x a diminué).
    expect(pos?.x ?? 80).toBeLessThan(80)
  })

  it("n'aimante pas une gemme hors du rayon", () => {
    const world = new World()
    makePlayer(world, 0, 0, 50)
    const gem = makeGem(world, 200, 0, 5) // hors rayon
    pickupSystem(world, 16)
    expect(world.get(gem, 'position')?.x).toBe(200)
  })

  it('collecte la gemme au contact et crédite l’XP du joueur', () => {
    const world = new World()
    const player = makePlayer(world, 0, 0, 100)
    const gem = makeGem(world, HITBOX.player + PICKUP.collectRadius - 1, 0, 7)
    pickupSystem(world, 16)
    expect(world.alive(gem)).toBe(false)
    expect(world.get(player, 'progress')?.xp).toBe(7)
  })

  it('ignore les joueurs morts pour l’aimantation', () => {
    const world = new World()
    const player = makePlayer(world, 0, 0, 100)
    const ph = world.get(player, 'health')
    if (ph !== undefined) {
      ph.hp = 0
    }
    const gem = makeGem(world, 80, 0, 5)
    pickupSystem(world, 16)
    // Pas de collecte ni d'aimantation vers un joueur mort.
    expect(world.alive(gem)).toBe(true)
    expect(world.get(gem, 'position')?.x).toBe(80)
  })
})
