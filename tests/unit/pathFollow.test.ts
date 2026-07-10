import { describe, it, expect } from 'vitest'
import { pathFollow } from '@render/workerBehavior'

describe('pathFollow', () => {
  it('0 point → origine, atEnd', () => {
    const r = pathFollow([], 1000, 100)
    expect(r).toMatchObject({ x: 0, y: 0, atEnd: true })
  })

  it('1 point → immobile sur ce point', () => {
    const r = pathFollow([{ x: 42, y: 7 }], 5000, 100)
    expect(r.x).toBe(42)
    expect(r.y).toBe(7)
    expect(r.atEnd).toBe(true)
  })

  it('2 points : t=0 → point A, direction A→B', () => {
    const r = pathFollow([{ x: 0, y: 0 }, { x: 100, y: 0 }], 0, 100)
    expect(r.x).toBeCloseTo(0, 5)
    expect(r.dirX).toBeCloseTo(1, 5)
    expect(r.dirY).toBeCloseTo(0, 5)
  })

  it('2 points : à mi-période (dist = L) → point B', () => {
    // L = 100, vitesse 100 px/s → atteint B à t = 1 s.
    const r = pathFollow([{ x: 0, y: 0 }, { x: 100, y: 0 }], 1000, 100)
    expect(r.x).toBeCloseTo(100, 3)
    expect(r.y).toBeCloseTo(0, 3)
  })

  it('ping-pong : au retour la direction s\'inverse', () => {
    // t = 1.5 s → phase 150 ∈ [100,200) → retour, à mi-chemin (x=50), dirX<0.
    const r = pathFollow([{ x: 0, y: 0 }, { x: 100, y: 0 }], 1500, 100)
    expect(r.x).toBeCloseTo(50, 3)
    expect(r.dirX).toBeLessThan(0)
  })

  it('polyligne à 3 points : progression le long des segments', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    // L totale = 200. À dist 150 → 2e segment, y=50, x=100.
    const r = pathFollow(pts, 1500, 100)
    expect(r.x).toBeCloseTo(100, 3)
    expect(r.y).toBeCloseTo(50, 3)
    expect(r.seg).toBe(1)
  })

  it('déterministe : mêmes entrées ⇒ même sortie', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 40 }, { x: -20, y: 90 }]
    expect(pathFollow(pts, 2345, 74)).toEqual(pathFollow(pts, 2345, 74))
  })
})
