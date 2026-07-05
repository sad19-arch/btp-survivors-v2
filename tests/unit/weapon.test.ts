import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { weaponSystem } from '@core/systems/weapon'
import type { EntityId } from '@core/types'
import { BASE_STATS } from '@content/passives'

function addPlayerWithWeapon(w: World, cooldownLeftMs: number): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x: 0, y: 0 })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
  w.add(e, 'weapons', { slots: [{ id: 'cloueur', level: 1, cooldownLeftMs }] })
  w.add(e, 'stats', { ...BASE_STATS })
  return e
}

function addEnemy(w: World, x: number, y: number): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 10, maxHp: 10 })
  w.add(e, 'enemy', { type: 'paperasse', speed: 50, isElite: false, isBoss: false, contactDamage: 5, xpValue: 5 })
  return e
}

describe('weaponSystem', () => {
  it('tire un projectile vers l\'ennemi le plus proche quand le cooldown est écoulé', () => {
    const w = new World()
    addPlayerWithWeapon(w, 0)
    addEnemy(w, 100, 0)
    weaponSystem(w, 16)
    const projs = [...w.query('projectile', 'position', 'velocity')]
    expect(projs).toHaveLength(1)
    const id = projs[0]
    const vel = id !== undefined ? w.get(id, 'velocity') : undefined
    const proj = id !== undefined ? w.get(id, 'projectile') : undefined
    expect(vel?.x ?? 0).toBeGreaterThan(0) // vers l'ennemi en +x
    expect(proj?.ownerId).toBe(1)
    expect((proj?.damage ?? 0)).toBeGreaterThan(0)
  })

  it('remet le cooldown après un tir', () => {
    const w = new World()
    const p = addPlayerWithWeapon(w, 0)
    addEnemy(w, 100, 0)
    weaponSystem(w, 16)
    const loadout = w.get(p, 'weapons')
    expect(loadout?.slots[0]?.cooldownLeftMs ?? 0).toBeGreaterThan(0)
  })

  it('ne tire pas tant que le cooldown n\'est pas écoulé', () => {
    const w = new World()
    addPlayerWithWeapon(w, 300)
    addEnemy(w, 100, 0)
    weaponSystem(w, 16)
    expect([...w.query('projectile')]).toHaveLength(0)
  })

  it('ne tire pas sans ennemi présent', () => {
    const w = new World()
    addPlayerWithWeapon(w, 0)
    // aucun ennemi dans le monde
    weaponSystem(w, 16)
    expect([...w.query('projectile')]).toHaveLength(0)
  })
})
