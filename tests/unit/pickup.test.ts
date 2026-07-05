import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { pickupSystem } from '@core/systems/pickup'
import { PICKUP } from '@content/config'
import { HITBOX } from '@content/config'

/** Crée un joueur de test avec un rayon d'aimantation donné. */
function makePlayer(world: World, x: number, y: number, pickupRadius: number, playerId = 1): number {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'velocity', { x: 0, y: 0 })
  world.add(e, 'health', { hp: 100, maxHp: 100 })
  world.add(e, 'player', {
    playerId,
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

/** Un pickup de type quelconque à une position. */
function makePickup(
  world: World,
  x: number,
  y: number,
  type: 'xp' | 'heal' | 'magnet' | 'chest',
  value: number
): number {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'pickup', { type, value })
  return e
}

/** Distance à laquelle un pickup est collecté au contact. */
const COLLECT_X = HITBOX.player + PICKUP.collectRadius - 1

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

  it('le pickup de soin rend des PV au contact', () => {
    const world = new World()
    const player = makePlayer(world, 0, 0, 100)
    const h = world.get(player, 'health')
    if (h !== undefined) {
      h.hp = 50
    }
    const kit = makePickup(world, COLLECT_X, 0, 'heal', 40)
    pickupSystem(world, 16)
    expect(world.alive(kit)).toBe(false)
    expect(world.get(player, 'health')?.hp).toBe(90)
  })

  it('le soin ne dépasse jamais maxHp', () => {
    const world = new World()
    const player = makePlayer(world, 0, 0, 100)
    const h = world.get(player, 'health')
    if (h !== undefined) {
      h.hp = 80
    }
    makePickup(world, COLLECT_X, 0, 'heal', 40)
    pickupSystem(world, 16)
    expect(world.get(player, 'health')?.hp).toBe(100)
  })

  it('le coffre crédite un lot d’XP', () => {
    const world = new World()
    const player = makePlayer(world, 0, 0, 100)
    makePickup(world, COLLECT_X, 0, 'chest', 60)
    pickupSystem(world, 16)
    expect(world.get(player, 'progress')?.xp).toBe(60)
  })

  it("crédite le coffre 'coffre' au ramasseur réel (playerId) via chestCollectors, pas un joueur codé en dur", () => {
    const world = new World()
    // Joueur 1 loin du coffre : ne doit pas être crédité.
    makePlayer(world, 2000, 2000, 100, 1)
    // Joueur 2 au contact du coffre : le ramasseur réel.
    makePlayer(world, 0, 0, 100, 2)
    const gem = world.spawn()
    world.add(gem, 'position', { x: COLLECT_X, y: 0 })
    world.add(gem, 'pickup', { type: 'coffre', value: 0 })
    const chestCollectors: number[] = []
    pickupSystem(world, 16, undefined, chestCollectors)
    expect(chestCollectors).toEqual([2])
  })

  it('un coffre par joueur dans la même frame → un entry par ramasseur, dans l’ordre de collecte', () => {
    const world = new World()
    const p1 = makePlayer(world, 0, 0, 100, 1)
    const p2 = makePlayer(world, 1000, 0, 100, 2)
    const gem1 = world.spawn()
    world.add(gem1, 'position', { x: COLLECT_X, y: 0 })
    world.add(gem1, 'pickup', { type: 'coffre', value: 0 })
    const gem2 = world.spawn()
    world.add(gem2, 'position', { x: 1000 + COLLECT_X, y: 0 })
    world.add(gem2, 'pickup', { type: 'coffre', value: 0 })
    const chestCollectors: number[] = []
    pickupSystem(world, 16, undefined, chestCollectors)
    expect(chestCollectors.sort()).toEqual([1, 2])
    expect(world.alive(p1)).toBe(true)
    expect(world.alive(p2)).toBe(true)
  })

  it('l’aimant aspire toutes les gemmes d’XP restantes', () => {
    const world = new World()
    const player = makePlayer(world, 0, 0, 100)
    // Gemmes hors rayon : normalement non collectées, mais aspirées par l'aimant.
    const g1 = makeGem(world, 500, 0, 5)
    const g2 = makeGem(world, 0, 500, 8)
    makePickup(world, COLLECT_X, 0, 'magnet', 0)
    pickupSystem(world, 16)
    expect(world.alive(g1)).toBe(false)
    expect(world.alive(g2)).toBe(false)
    expect(world.get(player, 'progress')?.xp).toBe(13)
  })

  it('en coop, l’aimant crédite chaque gemme à son joueur le plus proche (pas tout au ramasseur)', () => {
    const world = new World()
    const p1 = makePlayer(world, 0, 0, 100, 1) // ramasse l'aimant, à l'origine
    const p2 = makePlayer(world, 1000, 0, 100, 2) // loin
    const gemNearP1 = makeGem(world, 60, 0, 5) // clairement le plus proche de p1
    const gemNearP2 = makeGem(world, 1000, 60, 9) // clairement le plus proche de p2
    makePickup(world, COLLECT_X, 0, 'magnet', 0) // p1 ramasse l'aimant
    pickupSystem(world, 16)
    expect(world.alive(gemNearP1)).toBe(false)
    expect(world.alive(gemNearP2)).toBe(false)
    // La gemme loin (près de p2) va à p2, PAS au ramasseur p1 — équité coop.
    expect(world.get(p1, 'progress')?.xp).toBe(5)
    expect(world.get(p2, 'progress')?.xp).toBe(9)
  })
})
