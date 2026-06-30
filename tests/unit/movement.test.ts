import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { movementSystem } from '@core/systems/movement'

describe('movementSystem (fonction pure)', () => {
  it('avance la position selon la vélocité (px/s) sur la durée', () => {
    const w = new World()
    const e = w.spawn()
    w.add(e, 'position', { x: 0, y: 0 })
    w.add(e, 'velocity', { x: 100, y: -50 }) // px/seconde
    movementSystem(w, 1000) // 1 seconde
    expect(w.get(e, 'position')).toEqual({ x: 100, y: -50 })
  })

  it('respecte la fraction de temps (demi-seconde)', () => {
    const w = new World()
    const e = w.spawn()
    w.add(e, 'position', { x: 10, y: 10 })
    w.add(e, 'velocity', { x: 100, y: 0 })
    movementSystem(w, 500)
    expect(w.get(e, 'position')).toEqual({ x: 60, y: 10 })
  })

  it('ne déplace pas une entité sans vélocité', () => {
    const w = new World()
    const e = w.spawn()
    w.add(e, 'position', { x: 5, y: 5 })
    movementSystem(w, 1000)
    expect(w.get(e, 'position')).toEqual({ x: 5, y: 5 })
  })
})
