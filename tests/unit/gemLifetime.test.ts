import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { pickupSystem } from '@core/systems/pickup'

describe('durée de vie des gemmes', () => {
  it('une gemme d\'XP non ramassée expire et disparaît', () => {
    const w = new World()
    const gem = w.spawn()
    w.add(gem, 'position', { x: 9999, y: 9999 }) // loin du joueur -> non ramassée
    w.add(gem, 'pickup', { type: 'xp', value: 5, lifeMs: 100 })
    pickupSystem(w, 200, []) // 200ms > 100ms de vie
    expect(w.alive(gem)).toBe(false)
  })
  it('un coffre (sans lifeMs) ne disparaît jamais avec le temps', () => {
    const w = new World()
    const chest = w.spawn()
    w.add(chest, 'position', { x: 9999, y: 9999 })
    w.add(chest, 'pickup', { type: 'coffre', value: 0 })
    pickupSystem(w, 100000, [])
    expect(w.alive(chest)).toBe(true)
  })
})
