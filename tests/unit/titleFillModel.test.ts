import { describe, it, expect } from 'vitest'
import {
  CollageField,
  nextSpawnDelayMs,
  pickWeighted,
  type Rng,
  type Weighted
} from '@/ui/titleFillModel'

/** RNG déterministe (LCG) pour des tests reproductibles. */
function seededRng(seed: number): Rng {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

describe('CollageField', () => {
  it('cellCount = cols*rows (≈ width/cell × height/cell)', () => {
    // 1000/50=20 cols, 800/50=16 rows → 320 cellules.
    expect(new CollageField(1000, 800, 50).cellCount()).toBe(320)
    expect(new CollageField(50, 50, 100).cellCount()).toBe(1) // cell > taille → borné à 1×1
  })

  it('place : les items restent dans les bornes de l’écran', () => {
    const W = 1000
    const H = 800
    const field = new CollageField(W, H, 60)
    const rng = seededRng(42)
    for (let i = 0; i < 300; i++) {
      const w = 40 + rng() * 70
      const h = 40 + rng() * 70
      const p = field.place(rng, w, h)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x + w).toBeLessThanOrEqual(W + 0.001)
      expect(p.restY).toBeGreaterThanOrEqual(0)
      expect(p.restY + h).toBeLessThanOrEqual(H + 0.001)
    }
  })

  it('coverage croît de façon monotone et sature à 1', () => {
    const field = new CollageField(600, 600, 60)
    const rng = seededRng(7)
    let prev = field.coverage()
    expect(prev).toBe(0)
    for (let i = 0; i < 400; i++) {
      field.place(rng, 70, 70)
      const cov = field.coverage()
      expect(cov).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = cov
    }
    expect(prev).toBeGreaterThan(0.9)
  })

  it('isFull(2) se déclenche → collage dense (chevauchement)', () => {
    const field = new CollageField(400, 400, 50)
    const rng = seededRng(3)
    expect(field.isFull(2)).toBe(false)
    let guard = 0
    while (!field.isFull(2) && guard < 5000) {
      field.place(rng, 60, 60)
      guard++
    }
    expect(field.isFull(2)).toBe(true)
    // fillFraction croît avec la profondeur exigée : couvert ≥1 ≥ couvert ≥2.
    expect(field.fillFraction(1)).toBeGreaterThanOrEqual(field.fillFraction(2))
  })

  it('reset remet la couverture à zéro', () => {
    const field = new CollageField(400, 400, 50)
    const rng = seededRng(9)
    for (let i = 0; i < 80; i++) {
      field.place(rng, 60, 60)
    }
    expect(field.coverage()).toBeGreaterThan(0)
    field.reset()
    expect(field.coverage()).toBe(0)
  })

  it('déterminisme : même seed → mêmes placements', () => {
    const run = (): number[] => {
      const field = new CollageField(800, 600, 70)
      const rng = seededRng(123)
      const out: number[] = []
      for (let i = 0; i < 40; i++) {
        const p = field.place(rng, 60, 60)
        out.push(p.x, p.restY)
      }
      return out
    }
    expect(run()).toEqual(run())
  })
})

describe('nextSpawnDelayMs', () => {
  it('délai ≥ 1 et proche de targetFillMs/capacity en moyenne', () => {
    const rng = seededRng(1)
    let sum = 0
    const N = 2000
    for (let i = 0; i < N; i++) {
      const d = nextSpawnDelayMs(rng, 60_000, 400)
      expect(d).toBeGreaterThanOrEqual(1)
      sum += d
    }
    const base = 60_000 / 400 // 150
    const avg = sum / N
    expect(avg).toBeGreaterThan(base * 0.8)
    expect(avg).toBeLessThan(base * 1.2)
  })
})

describe('pickWeighted', () => {
  const pool: (Weighted & { id: string })[] = [
    { id: 'a', weight: 1 },
    { id: 'b', weight: 1 },
    { id: 'c', weight: 1 }
  ]

  it('rng≈0 → premier, rng≈~1 → dernier', () => {
    expect(pickWeighted(() => 0, pool).id).toBe('a')
    expect(pickWeighted(() => 0.999, pool).id).toBe('c')
  })

  it('respecte les poids (le plus lourd domine)', () => {
    const weighted: (Weighted & { id: string })[] = [
      { id: 'rare', weight: 1 },
      { id: 'common', weight: 99 }
    ]
    const rng = seededRng(55)
    let common = 0
    for (let i = 0; i < 1000; i++) {
      if (pickWeighted(rng, weighted).id === 'common') {
        common++
      }
    }
    expect(common).toBeGreaterThan(900)
  })
})
