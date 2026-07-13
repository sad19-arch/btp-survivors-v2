import { describe, it, expect } from 'vitest'
import {
  shouldSpawnBearer,
  countActiveChests,
  countChestBearers,
  tickChestBearer,
  dropChestBearerLoot
} from '@core/systems/chestDirector'
import { World } from '@core/world'
import { Rng } from '@core/rng'
import { Simulation } from '@core/simulation'
import { SPAWN } from '@content/config'
import type { DifficultyScale } from '@content/spawnRamp'

const SCALE: DifficultyScale = { hp: 1, contactDamage: 1, speed: 1 }
const CENTROID = { x: 1000, y: 1000 }

/** Helper : ajoute N pickups 'coffre' dans un world. */
function addChests(world: World, n: number): void {
  for (let i = 0; i < n; i++) {
    const e = world.spawn()
    world.add(e, 'position', { x: 100 + i * 10, y: 100 })
    world.add(e, 'pickup', { type: 'coffre', value: 0 })
  }
}

/** Helper : ajoute N convoyeurs (porteurs) vivants dans un world. */
function addBearers(world: World, n: number): void {
  for (let i = 0; i < n; i++) {
    const e = world.spawn()
    world.add(e, 'position', { x: 200 + i * 10, y: 200 })
    world.add(e, 'health', { hp: 300, maxHp: 300 })
    world.add(e, 'enemy', {
      type: 'convoyeur',
      speed: 108,
      isElite: true,
      isBoss: false,
      chestBearer: true,
      contactDamage: 16,
      xpValue: 45,
      behavior: 'chase'
    })
  }
}

describe('chestDirector — shouldSpawnBearer', () => {
  it('true quand cadence écoulée, aucun porteur vivant, sous plafond coffres', () => {
    const world = new World()
    addChests(world, 2)
    expect(shouldSpawnBearer(world, 55001, 55000, 1, 5)).toBe(true)
  })

  it('true au seuil exact de la cadence', () => {
    const world = new World()
    expect(shouldSpawnBearer(world, 55000, 55000, 1, 5)).toBe(true)
  })

  it('false quand la cadence n\'est pas écoulée', () => {
    const world = new World()
    expect(shouldSpawnBearer(world, 40000, 55000, 1, 5)).toBe(false)
  })

  it('false quand le plafond de porteurs vivants est atteint', () => {
    const world = new World()
    addBearers(world, 1)
    expect(shouldSpawnBearer(world, 99999, 55000, 1, 5)).toBe(false)
  })

  it('false quand le plafond de coffres au sol est atteint (pas d\'accumulation)', () => {
    const world = new World()
    addChests(world, 5)
    expect(shouldSpawnBearer(world, 99999, 55000, 1, 5)).toBe(false)
  })
})

describe('chestDirector — countActiveChests / countChestBearers', () => {
  it('countActiveChests compte exactement les pickups coffre', () => {
    const world = new World()
    addChests(world, 3)
    const e = world.spawn()
    world.add(e, 'position', { x: 0, y: 0 })
    world.add(e, 'pickup', { type: 'xp', value: 5, lifeMs: 10000 })
    expect(countActiveChests(world)).toBe(3)
  })

  it('countChestBearers compte les convoyeurs vivants, pas les ennemis ordinaires', () => {
    const world = new World()
    addBearers(world, 2)
    // Un ennemi ordinaire (pas porteur) ne doit pas être compté.
    const e = world.spawn()
    world.add(e, 'position', { x: 0, y: 0 })
    world.add(e, 'health', { hp: 18, maxHp: 18 })
    world.add(e, 'enemy', {
      type: 'paperasse', speed: 150, isElite: false, isBoss: false,
      contactDamage: 6, xpValue: 5, behavior: 'chase'
    })
    expect(countChestBearers(world)).toBe(2)
  })
})

describe('chestDirector — tickChestBearer', () => {
  it('invoque UN convoyeur (chestBearer) à l\'anneau de spawn et remet le compteur à 0', () => {
    const world = new World()
    const acc = tickChestBearer(world, new Rng(1), 60000, CENTROID, SCALE)
    expect(acc).toBe(0)
    const entities = [...world.query('enemy')]
    expect(entities).toHaveLength(1)
    const bearerEntity = entities[0]
    expect(bearerEntity).toBeDefined()
    if (bearerEntity === undefined) {
      return
    }
    const en = world.get(bearerEntity, 'enemy')
    expect(en?.chestBearer).toBe(true)
    expect(en?.type).toBe('convoyeur')
    // Positionné hors écran, sur l'anneau (distance ≈ ringRadius du centroïde).
    const pos = world.get(bearerEntity, 'position')
    const dist = Math.hypot((pos?.x ?? 0) - CENTROID.x, (pos?.y ?? 0) - CENTROID.y)
    expect(dist).toBeCloseTo(SPAWN.ringRadius, 0)
  })

  it('no-op (compteur inchangé) quand la cadence n\'est pas écoulée', () => {
    const world = new World()
    const acc = tickChestBearer(world, new Rng(1), 1000, CENTROID, SCALE)
    expect(acc).toBe(1000)
    expect(countChestBearers(world)).toBe(0)
  })

  it('no-op quand un porteur est déjà vivant (bearerCap = 1)', () => {
    const world = new World()
    addBearers(world, 1)
    const acc = tickChestBearer(world, new Rng(1), 99999, CENTROID, SCALE)
    expect(acc).toBe(99999)
    expect(countChestBearers(world)).toBe(1) // pas de 2e porteur
  })
})

describe('chestDirector — dropChestBearerLoot', () => {
  it('lâche un coffre garanti à la position donnée', () => {
    const world = new World()
    expect(countActiveChests(world)).toBe(0)
    dropChestBearerLoot(world, { x: 500, y: 500 })
    expect(countActiveChests(world)).toBe(1)
  })
})

describe('chestDirector — déterminisme + isolation RNG', () => {
  it('même seed → mêmes instants d\'apparition des convoyeurs', () => {
    function runAndCollectBearerSpawns(seed: number): number[] {
      const sim = new Simulation({ seed, mode: 'solo' })
      // Build correct + kite déterministe (+x, tir) : le joueur survit au-delà de
      // la 1re cadence (~55 s) pour qu'on observe un porteur apparaître.
      sim.debugGrant({ weapons: [{ id: 'cloueur', level: 6 }] })
      const ts: number[] = []
      let t = 0
      let prev = 0
      while (t < 130000) {
        if (sim.getState().pendingLevelUp !== null) {
          sim.chooseUpgrade(0)
          continue
        }
        sim.setInput(1, { move: { x: 1, y: 0 }, attack: true })
        sim.advanceTime(1000)
        t += 1000
        const now = sim.getState().enemies.filter((e) => e.type === 'convoyeur').length
        if (now > prev) {
          ts.push(t)
        }
        prev = now
      }
      return ts
    }
    const run1 = runAndCollectBearerSpawns(42)
    const run2 = runAndCollectBearerSpawns(42)
    expect(run1).toEqual(run2)
    // Au moins un convoyeur invoqué (cadence ~55 s, joueur maintenu en vie).
    expect(run1.length).toBeGreaterThanOrEqual(1)
  })

  it('liste d\'ennemis identique entre deux runs à seed identique (chestRng isolé)', () => {
    const simA = new Simulation({ seed: 7, mode: 'solo' })
    const simB = new Simulation({ seed: 7, mode: 'solo' })
    for (let i = 0; i < 60; i++) {
      for (const sim of [simA, simB]) {
        if (sim.getState().pendingLevelUp !== null) {
          sim.chooseUpgrade(0)
        }
        sim.advanceTime(1000)
      }
    }
    const typesA = simA.getState().enemies.map((e) => e.type).sort()
    const typesB = simB.getState().enemies.map((e) => e.type).sort()
    expect(typesA).toEqual(typesB)
  })
})
