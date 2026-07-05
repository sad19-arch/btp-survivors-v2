import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { Rng } from '@core/rng'
import { weaponSystem } from '@core/systems/weapon'

function player(w: World, weaponId: string, level: number, stats?: Partial<import('@content/passives').PlayerStats>) {
  const e = w.spawn()
  w.add(e, 'position', { x: 0, y: 0 }); w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
  w.add(e, 'weapons', { slots: [{ id: weaponId, level, cooldownLeftMs: 0 }] })
  w.add(e, 'stats', { might: 1, area: 1, amount: 0, cooldown: 1, duration: 1, projectileSpeed: 1, moveSpeed: 1, maxHp: 1, recovery: 0, magnet: 1, growth: 1, ...stats })
  return e
}
function enemy(w: World, x: number, y: number, hp = 50) {
  const e = w.spawn(); w.add(e, 'position', { x, y }); w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 1 })
  return e
}

describe('weaponSystem — stats effectives + kinds', () => {
  it('marteau (aura) : might 2 double les dégâts sur un ennemi proche', () => {
    const w = new World(); player(w, 'marteau', 1, { might: 2 }); const en = enemy(w, 20, 0, 100)
    weaponSystem(w, 1000)
    expect(w.get(en, 'health')?.hp).toBeLessThan(100 - 10) // > dégâts de base
  })
  it('court_circuit (strike) frappe un ennemi au hasard (déterministe par seed)', () => {
    const w = new World(); player(w, 'court_circuit', 1); const en = enemy(w, 300, 0, 100)
    weaponSystem(w, 2000, undefined, undefined, new Rng(1))
    expect(w.get(en, 'health')?.hp).toBeLessThan(100)
  })
  it('pied_de_biche (sweep) : inflige des dégâts autour du joueur à la cadence', () => {
    const w = new World(); player(w, 'pied_de_biche', 1); const en = enemy(w, 50, 0, 100)
    weaponSystem(w, 1000)
    expect(w.get(en, 'health')?.hp).toBeLessThan(100)
  })
})
