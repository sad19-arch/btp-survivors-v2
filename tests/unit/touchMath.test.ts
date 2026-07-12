import { describe, it, expect } from 'vitest'
import { stickVector, clampToRadius } from '@input/touchMath'

const R = 100
const DZ = 0.35

describe('touchMath.stickVector', () => {
  it('centre → {0,0}', () => {
    expect(stickVector(0, 0, R, DZ)).toEqual({ x: 0, y: 0 })
  })

  it('sous la deadzone → {0,0}', () => {
    // norm = 30/100 = 0.30 < 0.35
    expect(stickVector(30, 0, R, DZ)).toEqual({ x: 0, y: 0 })
  })

  it('au bord (et au-delà) → magnitude 1', () => {
    const rim = stickVector(R, 0, R, DZ)
    expect(rim.x).toBeCloseTo(1, 5)
    expect(rim.y).toBeCloseTo(0, 5)
    const beyond = stickVector(2 * R, 0, R, DZ)
    expect(Math.hypot(beyond.x, beyond.y)).toBeCloseTo(1, 5)
  })

  it('deadzone re-scalée : mi-course après seuil → 0.5', () => {
    // norm = 0.675 → (0.675-0.35)/(1-0.35) = 0.5
    const v = stickVector(67.5, 0, R, DZ)
    expect(v.x).toBeCloseTo(0.5, 5)
    expect(v.y).toBeCloseTo(0, 5)
  })

  it('diagonale normalisée : magnitude ≤ 1, axes égaux', () => {
    const v = stickVector(100, 100, R, 0)
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 5)
    expect(v.y).toBeCloseTo(Math.SQRT1_2, 5)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5)
  })

  it('+y est vers le BAS (dy positif → y positif)', () => {
    const v = stickVector(0, 50, R, 0)
    expect(v.x).toBe(0)
    expect(v.y).toBeGreaterThan(0)
    expect(v.y).toBeCloseTo(0.5, 5)
  })

  it('rayon ≤ 0 → {0,0} (garde)', () => {
    expect(stickVector(10, 10, 0, DZ)).toEqual({ x: 0, y: 0 })
  })
})

describe('touchMath.clampToRadius', () => {
  it('dans le rayon → inchangé', () => {
    expect(clampToRadius(50, 0, R)).toEqual({ x: 50, y: 0 })
  })
  it('hors rayon → clampé sur le cercle', () => {
    const p = clampToRadius(200, 0, R)
    expect(p.x).toBeCloseTo(100, 5)
    expect(p.y).toBeCloseTo(0, 5)
  })
  it('centre → {0,0}', () => {
    expect(clampToRadius(0, 0, R)).toEqual({ x: 0, y: 0 })
  })
})
