/**
 * Otage ENRAGÉ (allié temporaire, Volet 2) — suivi, salves (purge dirigée 50 %),
 * plafond boss/élite/convoyeur (jamais de kill), expiration, déterminisme, cumul.
 *
 * Testé sur le VRAI code de prod (`allySystem`/`allyBoltSystem`), World nu (aucun
 * Phaser). Les salves utilisent un RNG dédié → sélection reproductible par seed.
 */
import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { Rng } from '@core/rng'
import { Simulation } from '@core/simulation'
import { allySystem, allyBoltSystem } from '@core/systems/ally'
import { RAGE, RESCUE } from '@content/config'
import { ConstructionPhaseId } from '@content/phases'
import type { EntityId, EnemyComp } from '@core/types'

function makePlayer(world: World, x = 0, y = 0, playerId = 1): EntityId {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'health', { hp: 100, maxHp: 100 })
  world.add(e, 'player', { playerId, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 100 })
  return e
}

function makeAlly(world: World, x = 0, y = 0, ownerPlayerId = 1, salvoLeftMs = 0, remainingMs: number = RAGE.durationMs): EntityId {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'velocity', { x: 0, y: 0 })
  world.add(e, 'prisoner', { freed: true })
  world.add(e, 'ally', { ownerPlayerId, remainingMs, salvoLeftMs })
  return e
}

function makeEnemy(world: World, x: number, y: number, opts: Partial<EnemyComp> & { hp?: number; maxHp?: number } = {}): EntityId {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'health', { hp: opts.hp ?? 20, maxHp: opts.maxHp ?? 20 })
  world.add(e, 'enemy', {
    type: opts.type ?? 'grouillot',
    speed: 0,
    isElite: opts.isElite ?? false,
    isBoss: opts.isBoss ?? false,
    ...(opts.chestBearer === true ? { chestBearer: true } : {}),
    contactDamage: 0,
    xpValue: 1
  })
  return e
}

const bolts = (world: World): EntityId[] => [...world.query('allyBolt')]
const lethalBolts = (world: World): EntityId[] => bolts(world).filter((b) => world.get(b, 'allyBolt')?.lethal === true)

describe('allySystem — salve (purge dirigée 50 %)', () => {
  it('tue EXACTEMENT floor(N/2) ennemis normaux du rayon écran (une boule létale chacun)', () => {
    const world = new World()
    makePlayer(world)
    makeAlly(world)
    for (let i = 0; i < 10; i++) {
      makeEnemy(world, 10 + i * 10, 0) // tous dans screenRadius
    }
    allySystem(world, 16, new Rng(1), [])
    expect(lethalBolts(world).length).toBe(5) // floor(10/2)
    expect(bolts(world).length).toBe(5) // que des normaux → aucune boule non létale
  })

  it('ignore les ennemis HORS du rayon écran', () => {
    const world = new World()
    makePlayer(world)
    makeAlly(world)
    makeEnemy(world, 50, 0) // dedans
    makeEnemy(world, 50, 0) // dedans
    makeEnemy(world, RAGE.screenRadius + 500, 0) // dehors
    makeEnemy(world, RAGE.screenRadius + 500, 0) // dehors
    allySystem(world, 16, new Rng(1), [])
    expect(lethalBolts(world).length).toBe(1) // floor(2/2) parmi les 2 dedans
  })

  it('une boule létale met SA cible à 0 PV (allyKill + lastHitBy) à l’impact', () => {
    const world = new World()
    makePlayer(world, 0, 0, 3)
    makeAlly(world, 0, 0, 3)
    makeEnemy(world, 0, 0, { hp: 20, maxHp: 20 }) // 2 normaux co-localisés →
    makeEnemy(world, 0, 0, { hp: 20, maxHp: 20 }) // floor(2/2)=1 boule létale, impact immédiat
    allySystem(world, 16, new Rng(1), [])
    const bolt = lethalBolts(world)[0]
    expect(bolt).toBeDefined()
    const targetId = world.get(bolt as EntityId, 'allyBolt')?.targetId as EntityId
    allyBoltSystem(world) // homing + impact (dist 0 < boltHitRadius)
    expect(world.get(targetId, 'health')?.hp).toBe(0)
    expect(world.get(targetId, 'enemy')?.allyKill).toBe(true)
    expect(world.get(targetId, 'enemy')?.lastHitBy).toBe(3)
    expect(bolts(world).length).toBe(0) // la boule s'est dissipée à l'impact
  })
})

describe('allySystem — boss / élite / convoyeur : dégât plafonné, JAMAIS de kill', () => {
  it('boss PV pleins → boule NON létale de ~1/3 PVmax, boss survit', () => {
    const world = new World()
    makePlayer(world)
    makeAlly(world)
    const boss = makeEnemy(world, 0, 0, { isBoss: true, hp: 300, maxHp: 300 })
    allySystem(world, 16, new Rng(1), [])
    expect(lethalBolts(world).length).toBe(0)
    expect(bolts(world).length).toBe(1)
    expect(world.get(bolts(world)[0] as EntityId, 'allyBolt')?.damage).toBe(100) // round(300/3)
    allyBoltSystem(world)
    expect(world.get(boss, 'health')?.hp).toBe(200)
    expect(world.alive(boss)).toBe(true)
  })

  it('boss à PV bas → dégât CLAMPÉ à hp-1 (survit toujours, jamais 0)', () => {
    const world = new World()
    makePlayer(world)
    makeAlly(world)
    const boss = makeEnemy(world, 0, 0, { isBoss: true, hp: 50, maxHp: 300 })
    allySystem(world, 16, new Rng(1), [])
    // min(round(300/3)=100, hp-1=49) = 49
    expect(world.get(bolts(world)[0] as EntityId, 'allyBolt')?.damage).toBe(49)
    allyBoltSystem(world)
    expect(world.get(boss, 'health')?.hp).toBe(1)
    expect(world.alive(boss)).toBe(true)
  })

  it('élite ET convoyeur sont traités comme des boss (plafonnés, non létaux)', () => {
    const world = new World()
    makePlayer(world)
    makeAlly(world)
    makeEnemy(world, 10, 0, { isElite: true, hp: 90, maxHp: 90 })
    makeEnemy(world, 20, 0, { chestBearer: true, hp: 90, maxHp: 90 })
    allySystem(world, 16, new Rng(1), [])
    expect(lethalBolts(world).length).toBe(0)
    expect(bolts(world).length).toBe(2) // 2 boules non létales
  })
})

describe('allySystem — expiration', () => {
  it('remainingMs<=0 → retire `ally`, pose une vélocité de fuite, pousse dans `thanked`', () => {
    const world = new World()
    makePlayer(world)
    const ally = makeAlly(world, 42, 7, 1, RAGE.salvoMs, /*remainingMs*/ 10)
    const thanked: { x: number; y: number }[] = []
    allySystem(world, 16, new Rng(1), thanked) // 10 - 16 <= 0 → expire
    expect(world.get(ally, 'ally')).toBeUndefined()
    expect(world.get(ally, 'velocity')?.y).toBe(RESCUE.fleeSpeed)
    expect(thanked).toEqual([{ x: 42, y: 7 }])
  })

  it('joueur owner mort → l’allié expire aussi', () => {
    const world = new World()
    const player = makePlayer(world)
    const ph = world.get(player, 'health')
    if (ph !== undefined) { ph.hp = 0 }
    const ally = makeAlly(world)
    const thanked: { x: number; y: number }[] = []
    allySystem(world, 16, new Rng(1), thanked)
    expect(world.get(ally, 'ally')).toBeUndefined()
    expect(thanked.length).toBe(1)
  })
})

describe('allySystem — déterminisme & cumul', () => {
  it('même seed → mêmes victimes (mêmes ids de cible)', () => {
    const build = (): EntityId[] => {
      const world = new World()
      makePlayer(world)
      makeAlly(world)
      for (let i = 0; i < 8; i++) { makeEnemy(world, 10 + i * 10, 0) }
      allySystem(world, 16, new Rng(123), [])
      return lethalBolts(world).map((b) => world.get(b, 'allyBolt')?.targetId as EntityId).sort((a, z) => a - z)
    }
    expect(build()).toEqual(build())
  })

  it('deux alliés tirent indépendamment le même pas (cumul)', () => {
    const world = new World()
    makePlayer(world)
    makeAlly(world)
    makeAlly(world)
    for (let i = 0; i < 6; i++) { makeEnemy(world, 10 + i * 10, 0) }
    allySystem(world, 16, new Rng(1), [])
    expect([...world.query('ally')].length).toBe(2) // les deux restent actifs
    expect(lethalBolts(world).length).toBeGreaterThanOrEqual(3) // ≥ floor(6/2), cumul possible
  })
})

/** Vide les montées de niveau en attente (sinon `advanceTime` gèle le temps). */
function drainLevelUps(sim: Simulation): void {
  let guard = 0
  while (sim.getState().pendingLevelUp !== null && guard++ < 200) {
    sim.chooseUpgrade(0)
  }
}

describe('Simulation — otage enragé (intégration seam, headless)', () => {
  it('debugEnragePrisoner → allié exposé, boules de feu lancées, expiration ~20s', () => {
    const sim = new Simulation({ seed: 3, mode: 'solo', phaseId: ConstructionPhaseId.TERRASSEMENT })
    sim.debugSpawnEnemies(12, 400) // horde à portée du joueur
    sim.debugEnragePrisoner(1)
    expect(sim.getState().allies.length).toBe(1)

    // Une salve part (salvoMs) et les boules apparaissent comme projectiles 'boule_feu'.
    let sawBolt = false
    for (let i = 0; i < 200 && !sawBolt; i++) {
      sim.advanceTime(16)
      drainLevelUps(sim)
      if (sim.getState().projectiles.some((p) => p.type === 'boule_feu')) {
        sawBolt = true
      }
    }
    expect(sawBolt).toBe(true)

    // Après ~22 s cumulées, l'allié a expiré (retiré de l'état).
    for (let i = 0; i < 1400; i++) {
      sim.advanceTime(16)
      drainLevelUps(sim)
    }
    expect(sim.getState().allies.length).toBe(0)
  })
})
