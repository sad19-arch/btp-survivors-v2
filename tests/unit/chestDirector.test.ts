import { describe, it, expect } from 'vitest'
import { shouldSpawnChest, countActiveChests } from '@core/systems/chestDirector'
import { World } from '@core/world'

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
