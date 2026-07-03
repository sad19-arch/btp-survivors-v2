import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { SpatialGrid } from '@core/spatialGrid'
import { weaponSystem } from '@core/systems/weapon'
import type { EntityId } from '@core/types'
import { BASE_STATS } from '@content/passives'

function addPlayer(w: World, weaponId: string): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x: 0, y: 0 })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
  w.add(e, 'weapons', { slots: [{ id: weaponId, level: 1, cooldownLeftMs: 0 }] })
  w.add(e, 'stats', { ...BASE_STATS })
  return e
}

function addEnemy(w: World, x: number, y: number, hp = 100): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'enemy', { type: 'paperasse', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 5 })
  return e
}

function buildEnemyGrid(w: World): SpatialGrid {
  const grid = new SpatialGrid(64)
  for (const e of w.query('enemy', 'position')) {
    const p = w.get(e, 'position')
    if (p !== undefined) {
      grid.insert(e, p.x, p.y)
    }
  }
  return grid
}

describe('weaponSystem — dégâts de zone via SpatialGrid (équivalence)', () => {
  it('marteau (aura) : même ensemble d\'ennemis endommagés avec ou sans grille', () => {
    const wLinear = new World()
    addPlayer(wLinear, 'marteau')
    const near = addEnemy(wLinear, 100, 0) // dans le rayon (175 au niveau 1)
    const far = addEnemy(wLinear, 500, 0) // hors rayon
    weaponSystem(wLinear, 16)

    const wGrid = new World()
    addPlayer(wGrid, 'marteau')
    const nearG = addEnemy(wGrid, 100, 0)
    const farG = addEnemy(wGrid, 500, 0)
    const grid = buildEnemyGrid(wGrid)
    weaponSystem(wGrid, 16, undefined, undefined, undefined, grid)

    expect(wGrid.get(nearG, 'health')?.hp).toBe(wLinear.get(near, 'health')?.hp)
    expect(wGrid.get(farG, 'health')?.hp).toBe(wLinear.get(far, 'health')?.hp)
    expect(wGrid.get(nearG, 'health')?.hp).toBeLessThan(100)
    expect(wGrid.get(farG, 'health')?.hp).toBe(100)
  })

  it('pied_de_biche (sweep) : même ensemble d\'ennemis endommagés avec ou sans grille', () => {
    const wLinear = new World()
    addPlayer(wLinear, 'pied_de_biche')
    const near = addEnemy(wLinear, 50, 0)
    const far = addEnemy(wLinear, 900, 900)
    weaponSystem(wLinear, 16)

    const wGrid = new World()
    addPlayer(wGrid, 'pied_de_biche')
    const nearG = addEnemy(wGrid, 50, 0)
    const farG = addEnemy(wGrid, 900, 900)
    const grid = buildEnemyGrid(wGrid)
    weaponSystem(wGrid, 16, undefined, undefined, undefined, grid)

    expect(wGrid.get(nearG, 'health')?.hp).toBe(wLinear.get(near, 'health')?.hp)
    expect(wGrid.get(farG, 'health')?.hp).toBe(wLinear.get(far, 'health')?.hp)
  })

  it('scie (orbital) : même ennemi blessé après plusieurs pas, avec ou sans grille', () => {
    const wLinear = new World()
    addPlayer(wLinear, 'scie')
    const enemy = addEnemy(wLinear, 104, 0)
    for (let i = 0; i < 200; i++) {
      weaponSystem(wLinear, 16)
    }

    const wGrid = new World()
    addPlayer(wGrid, 'scie')
    const enemyG = addEnemy(wGrid, 104, 0)
    for (let i = 0; i < 200; i++) {
      const grid = buildEnemyGrid(wGrid)
      weaponSystem(wGrid, 16, undefined, undefined, undefined, grid)
    }

    expect(wGrid.get(enemyG, 'health')?.hp).toBe(wLinear.get(enemy, 'health')?.hp)
    expect(wGrid.get(enemyG, 'health')?.hp).toBeLessThan(100)
  })

  it('court_circuit (strike) : même ennemi ciblé endommagé identiquement avec grille', () => {
    const wLinear = new World()
    addPlayer(wLinear, 'court_circuit')
    const enemy = addEnemy(wLinear, 10, 0)
    weaponSystem(wLinear, 16, undefined, undefined, undefined)

    const wGrid = new World()
    addPlayer(wGrid, 'court_circuit')
    const enemyG = addEnemy(wGrid, 10, 0)
    const grid = buildEnemyGrid(wGrid)
    weaponSystem(wGrid, 16, undefined, undefined, undefined, grid)

    expect(wGrid.get(enemyG, 'health')?.hp).toBe(wLinear.get(enemy, 'health')?.hp)
    expect(wGrid.get(enemyG, 'health')?.hp).toBeLessThan(100)
  })
})
