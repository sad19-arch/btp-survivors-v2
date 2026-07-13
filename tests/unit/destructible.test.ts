import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { destructibleContactSystem, reapDestructibles, type BrokenDestructible } from '@core/systems/destructible'
import { pickupSystem, startMagnetPull } from '@core/systems/pickup'
import { Simulation } from '@core/simulation'
import { HITBOX, PICKUP } from '@content/config'
import { destructibleDef } from '@content/destructibles'
import { ConstructionPhaseId } from '@content/phases'

const STAGE01 = ConstructionPhaseId.TERRAIN_VIERGE

/** Joueur minimal (position + santé) pour la casse au contact. */
function makePlayer(world: World, x: number, y: number): number {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'health', { hp: 100, maxHp: 100 })
  world.add(e, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 100 })
  world.add(e, 'progress', { xp: 0, level: 1, nextThreshold: 25 })
  return e
}

/** Destructible avec un `coinDrop` explicite (contourne le tirage au spawn). */
function makeDestructible(world: World, x: number, y: number, typeId: string, hp: number, coinDrop: number): number {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'health', { hp, maxHp: hp })
  world.add(e, 'destructible', { typeId, coinDrop })
  return e
}

describe('destructibleContactSystem', () => {
  it('casse (hp=0) un destructible qu’un joueur chevauche', () => {
    const world = new World()
    makePlayer(world, 0, 0)
    const d = makeDestructible(world, 10, 0, 'd01_caisse_outils', 30, 0)
    destructibleContactSystem(world)
    expect(world.get(d, 'health')?.hp).toBe(0)
  })

  it('ne casse PAS un destructible hors de portée du joueur', () => {
    const world = new World()
    makePlayer(world, 0, 0)
    const far = HITBOX.player + (destructibleDef('d01_caisse_outils')?.radius ?? 32) + 50
    const d = makeDestructible(world, far, 0, 'd01_caisse_outils', 30, 0)
    destructibleContactSystem(world)
    expect(world.get(d, 'health')?.hp).toBe(30)
  })

  it('un joueur mort ne casse rien', () => {
    const world = new World()
    const p = makePlayer(world, 0, 0)
    const ph = world.get(p, 'health')
    if (ph !== undefined) { ph.hp = 0 }
    const d = makeDestructible(world, 10, 0, 'd01_caisse_outils', 30, 0)
    destructibleContactSystem(world)
    expect(world.get(d, 'health')?.hp).toBe(30)
  })
})

describe('reapDestructibles', () => {
  it('lâche exactement `coinDrop` pièces (type coin, valeur 1), récolte le broken, despawn', () => {
    const world = new World()
    const d = makeDestructible(world, 200, 200, 'd01_caisse_outils', 30, 5)
    const dh = world.get(d, 'health')
    if (dh !== undefined) { dh.hp = 0 }
    const broken: BrokenDestructible[] = []
    reapDestructibles(world, broken)
    // Entité retirée…
    expect(world.alive(d)).toBe(false)
    // …broken renseigné pour le VFX…
    expect(broken).toEqual([{ x: 200, y: 200, typeId: 'd01_caisse_outils' }])
    // …et 5 pièces déposées.
    const coins = [...world.query('pickup')].map((e) => world.get(e, 'pickup')).filter((p) => p?.type === 'coin')
    expect(coins.length).toBe(5)
    expect(coins.every((c) => c?.value === 1)).toBe(true)
  })

  it('un destructible encore vivant (hp>0) n’est pas récolté', () => {
    const world = new World()
    const d = makeDestructible(world, 0, 0, 'd01_tas_gravats', 16, 2)
    const broken: BrokenDestructible[] = []
    reapDestructibles(world, broken)
    expect(world.alive(d)).toBe(true)
    expect(broken.length).toBe(0)
  })

  it('coinDrop=0 → aucune pièce (mais broken + despawn)', () => {
    const world = new World()
    const d = makeDestructible(world, 0, 0, 'd01_palette_bois', 22, 0)
    const dh = world.get(d, 'health')
    if (dh !== undefined) { dh.hp = 0 }
    const broken: BrokenDestructible[] = []
    reapDestructibles(world, broken)
    expect(world.alive(d)).toBe(false)
    expect(broken.length).toBe(1)
    const coins = [...world.query('pickup')].filter((e) => world.get(e, 'pickup')?.type === 'coin')
    expect(coins.length).toBe(0)
  })
})

describe('pickup coin', () => {
  it('collecté au contact → poussé dans coinsOut, joueur inchangé (pas d’XP/PV)', () => {
    const world = new World()
    const p = makePlayer(world, 0, 0)
    const coin = world.spawn()
    world.add(coin, 'position', { x: HITBOX.player + PICKUP.collectRadius - 1, y: 0 })
    world.add(coin, 'pickup', { type: 'coin', value: 3 })
    const coinsOut: number[] = []
    pickupSystem(world, 16, undefined, undefined, coinsOut)
    expect(world.alive(coin)).toBe(false)
    expect(coinsOut).toEqual([3])
    // La pièce est une monnaie méta : elle ne donne NI XP NI soin.
    expect(world.get(p, 'progress')?.xp).toBe(0)
    expect(world.get(p, 'health')?.hp).toBe(100)
  })

  it('est aimantable (aspirée par l’aimant, comme les gemmes)', () => {
    const world = new World()
    makePlayer(world, 0, 0)
    const coin = world.spawn()
    world.add(coin, 'position', { x: 500, y: 0 }) // hors rayon
    world.add(coin, 'pickup', { type: 'coin', value: 1 })
    startMagnetPull(world)
    expect(world.get(coin, 'pickup')?.magnetized).toBe(true)
    for (let i = 0; i < 300; i++) { pickupSystem(world, 16) }
    expect(world.alive(coin)).toBe(false)
  })
})

describe('Simulation — destructibles déterministes (stage 01)', () => {
  it('terrain_vierge peuple des destructibles', () => {
    const sim = new Simulation({ seed: 42, mode: 'solo', phaseId: STAGE01 })
    expect(sim.getState().destructibles.length).toBeGreaterThan(0)
  })

  it('même seed + même stage ⇒ destructibles identiques (positions + types)', () => {
    const a = new Simulation({ seed: 7, mode: 'solo', phaseId: STAGE01 }).getState().destructibles
    const b = new Simulation({ seed: 7, mode: 'solo', phaseId: STAGE01 }).getState().destructibles
    const key = (d: { x: number; y: number; typeId: string }): string => `${d.typeId}@${Math.round(d.x)},${Math.round(d.y)}`
    expect(a.map(key)).toEqual(b.map(key))
  })

  it('coins du run démarre à 0', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo', phaseId: STAGE01 })
    expect(sim.getState().coins).toBe(0)
  })
})
