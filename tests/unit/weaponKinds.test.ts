import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
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

describe('arme aura (marteau)', () => {
  it('inflige des dégâts aux ennemis dans le rayon de l’onde', () => {
    const w = new World()
    addPlayer(w, 'marteau')
    const near = addEnemy(w, 100, 0) // dans le rayon (175 au niveau 1)
    weaponSystem(w, 16) // cooldown à 0 → impulsion immédiate
    expect(w.get(near, 'health')?.hp ?? 100).toBeLessThan(100)
  })

  it('épargne les ennemis hors du rayon', () => {
    const w = new World()
    addPlayer(w, 'marteau')
    const far = addEnemy(w, 500, 0)
    weaponSystem(w, 16)
    expect(w.get(far, 'health')?.hp).toBe(100)
  })
})

describe('arme orbitale (scie)', () => {
  it('crée les lames en orbite autour du joueur', () => {
    const w = new World()
    addPlayer(w, 'scie')
    weaponSystem(w, 16)
    const orbiters = [...w.query('orbiter')]
    expect(orbiters.length).toBe(2) // count niveau 1 = 2
  })

  it('blesse un ennemi situé sur la trajectoire des lames', () => {
    const w = new World()
    addPlayer(w, 'scie')
    const enemy = addEnemy(w, 104, 0) // sur le cercle d'orbite (rayon 104 au niveau 1)
    // Laisse les lames balayer ~1.5 tour.
    for (let i = 0; i < 200; i++) {
      weaponSystem(w, 16)
    }
    expect(w.get(enemy, 'health')?.hp ?? 100).toBeLessThan(100)
  })

  it('supprime les lames quand le propriétaire meurt', () => {
    const w = new World()
    const p = addPlayer(w, 'scie')
    weaponSystem(w, 16)
    expect([...w.query('orbiter')].length).toBe(2)
    const h = w.get(p, 'health')
    if (h !== undefined) {
      h.hp = 0
    }
    weaponSystem(w, 16)
    expect([...w.query('orbiter')].length).toBe(0)
  })
})
