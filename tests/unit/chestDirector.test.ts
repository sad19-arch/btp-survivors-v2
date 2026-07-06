import { describe, it, expect } from 'vitest'
import { shouldSpawnChest, countActiveChests } from '@core/systems/chestDirector'
import { World } from '@core/world'
import { Simulation } from '@core/simulation'

/** Helper : ajoute N pickups 'coffre' dans un world. */
function addChests(world: World, n: number): void {
  for (let i = 0; i < n; i++) {
    const e = world.spawn()
    world.add(e, 'position', { x: 100 + i * 10, y: 100 })
    world.add(e, 'pickup', { type: 'coffre', value: 0 })
  }
}

describe('chestDirector — shouldSpawnChest', () => {
  it('renvoie true quand le délai est atteint et le plafond non atteint', () => {
    const world = new World()
    addChests(world, 2)
    expect(shouldSpawnChest(world, 55001, 55000, 5)).toBe(true)
  })

  it('renvoie false quand le délai n\'est pas atteint', () => {
    const world = new World()
    expect(shouldSpawnChest(world, 40000, 55000, 5)).toBe(false)
  })

  it('renvoie false quand le plafond est atteint exactement', () => {
    const world = new World()
    addChests(world, 5)
    expect(shouldSpawnChest(world, 55001, 55000, 5)).toBe(false)
  })

  it('renvoie false quand le plafond est dépassé', () => {
    const world = new World()
    addChests(world, 6)
    expect(shouldSpawnChest(world, 99999, 55000, 5)).toBe(false)
  })

  it('renvoie true au seuil exact du délai', () => {
    const world = new World()
    expect(shouldSpawnChest(world, 55000, 55000, 5)).toBe(true)
  })
})

describe('chestDirector — countActiveChests', () => {
  it('compte 0 quand le monde est vide', () => {
    const world = new World()
    expect(countActiveChests(world)).toBe(0)
  })

  it('compte exactement les pickups de type coffre', () => {
    const world = new World()
    addChests(world, 3)
    // Ajouter un pickup XP (ne doit pas être compté)
    const e = world.spawn()
    world.add(e, 'position', { x: 0, y: 0 })
    world.add(e, 'pickup', { type: 'xp', value: 5, lifeMs: 10000 })
    expect(countActiveChests(world)).toBe(3)
  })
})

describe('chestDirector — déterminisme + isolation RNG', () => {
  it('même seed → même séquence de coffres (déterministe)', () => {
    // Deux runs identiques doivent produire les mêmes pickups coffre aux mêmes instants.
    function runAndCollectChestSpawns(seed: number): number[] {
      const sim = new Simulation({ seed, mode: 'solo' })
      const chestTs: number[] = []
      // Avance 120s (2:00), temps d'observer plusieurs spawns périodiques.
      let t = 0
      while (t < 120000) {
        if (sim.getState().pendingLevelUp !== null) {
          sim.chooseUpgrade(0)
          continue
        }
        const before = sim.getState().pickups.filter(p => p.type === 'coffre').length
        sim.advanceTime(1000)
        t += 1000
        const after = sim.getState().pickups.filter(p => p.type === 'coffre').length
        if (after > before) {
          chestTs.push(t)
        }
      }
      return chestTs
    }

    const run1 = runAndCollectChestSpawns(42)
    const run2 = runAndCollectChestSpawns(42)
    expect(run1).toEqual(run2)
  })

  it('enemy list identique avec/sans coffres actifs (RNG chest isolé)', () => {
    // On vérifie que la liste d'ennemis (type, ordre) est identique entre deux
    // runs à seed identique, même si des coffres sont apparus entre-temps.
    // Si le chestRng puisait dans le rng spawn, les types divergeraient.
    const simA = new Simulation({ seed: 7, mode: 'solo' })
    const simB = new Simulation({ seed: 7, mode: 'solo' })

    // Avance 60s, choisit toujours la 1re carte.
    for (let i = 0; i < 60; i++) {
      for (const sim of [simA, simB]) {
        if (sim.getState().pendingLevelUp !== null) {
          sim.chooseUpgrade(0)
        }
        sim.advanceTime(1000)
      }
    }

    const typesA = simA.getState().enemies.map(e => e.type).sort()
    const typesB = simB.getState().enemies.map(e => e.type).sort()
    expect(typesA).toEqual(typesB)
  })
})
