import { describe, it, expect } from 'vitest'
import { fleeVelocity } from '@render/workerBehavior'

describe('fleeVelocity', () => {
  it('aucun ennemi dans le rayon → immobile', () => {
    expect(fleeVelocity({ x: 0, y: 0 }, [{ x: 500, y: 0 }], 200, 60)).toEqual({ vx: 0, vy: 0 })
  })
  it('ennemi proche → s\'éloigne (direction opposée, norme = speed)', () => {
    const v = fleeVelocity({ x: 0, y: 0 }, [{ x: 100, y: 0 }], 200, 60)
    expect(v.vx).toBeCloseTo(-60, 5)
    expect(v.vy).toBeCloseTo(0, 5)
  })
  it('prend l\'ennemi le PLUS proche', () => {
    const v = fleeVelocity({ x: 0, y: 0 }, [{ x: 0, y: 150 }, { x: 30, y: 0 }], 200, 10)
    expect(v.vx).toBeCloseTo(-10, 5)
    expect(v.vy).toBeCloseTo(0, 5)
  })
  it('ennemi pile dessus (dist 0) → immobile (évite NaN)', () => {
    expect(fleeVelocity({ x: 5, y: 5 }, [{ x: 5, y: 5 }], 200, 60)).toEqual({ vx: 0, vy: 0 })
  })
  it('norme du vecteur = speed (diagonale)', () => {
    const v = fleeVelocity({ x: 0, y: 0 }, [{ x: 30, y: 40 }], 200, 50)
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(50, 5)
    expect(v.vx).toBeCloseTo(-30, 5) // opposé, normalisé ×50 : (-0.6,-0.8)×50
    expect(v.vy).toBeCloseTo(-40, 5)
  })
})
