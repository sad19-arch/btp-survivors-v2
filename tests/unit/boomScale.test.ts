import { describe, it, expect } from 'vitest'
import { boomScale } from '@render/boomScale'

describe('boomScale', () => {
  it("returns 1 at elapsed = 0 (pas d'escalade au debut)", () => {
    expect(boomScale(0)).toBe(1)
  })

  it('est plafonné à maxScale quand elapsedMs >= fullAtMs', () => {
    const maxScale = 1.8
    const fullAtMs = 1_200_000
    expect(boomScale(fullAtMs)).toBe(maxScale)
    // Ne dépasse pas le plafond même à t très grand.
    expect(boomScale(fullAtMs * 10)).toBe(maxScale)
  })

  it('est monotone non-décroissante (boomScale(t2) >= boomScale(t1) pour t2 > t1)', () => {
    const samples = [0, 60_000, 300_000, 600_000, 900_000, 1_200_000, 2_000_000]
    for (let i = 1; i < samples.length; i++) {
      const t1 = samples[i - 1] as number
      const t2 = samples[i] as number
      expect(boomScale(t2)).toBeGreaterThanOrEqual(boomScale(t1))
    }
  })

  it('vaut environ 1 + 0.5*(maxScale-1) à mi-parcours', () => {
    const maxScale = 1.8
    const fullAtMs = 1_200_000
    const mid = fullAtMs / 2
    const expected = 1 + 0.5 * (maxScale - 1)
    expect(boomScale(mid)).toBeCloseTo(expected, 5)
  })

  it('respecte les opts personnalisées (maxScale et fullAtMs)', () => {
    const custom = { maxScale: 3.0, fullAtMs: 600_000 }
    expect(boomScale(0, custom)).toBe(1)
    expect(boomScale(600_000, custom)).toBe(3.0)
    expect(boomScale(1_200_000, custom)).toBe(3.0)
    expect(boomScale(300_000, custom)).toBeCloseTo(1 + 0.5 * (3.0 - 1), 5)
  })
})
