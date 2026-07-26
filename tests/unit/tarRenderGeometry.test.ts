import { describe, expect, it } from 'vitest'
import { tarRenderGeometry } from '@render/tarRenderGeometry'

describe('géométrie visuelle du Goudron', () => {
  it.each([36, 48, 72, 96])('conserve une frontière exacte pour un rayon de %i px', (radius) => {
    const geometry = tarRenderGeometry(radius, 160)

    expect(geometry.boundaryRadius).toBe(radius)
    expect(geometry.spriteScale).toBeCloseTo((radius * 2) / 160, 8)
  })

  it('documente la marge opaque de l’asset sans étirer le sprite', () => {
    const geometry = tarRenderGeometry(48, 160)

    expect(geometry.opaqueWidth).toBeCloseTo(83.4, 5)
    expect(geometry.opaqueHeight).toBeCloseTo(72.6, 5)
    expect(geometry.opaqueHeight).toBeLessThan(geometry.boundaryRadius * 2)
  })

  it('refuse un rayon ou une largeur de texture invalides', () => {
    expect(() => tarRenderGeometry(0, 160)).toThrow()
    expect(() => tarRenderGeometry(48, 0)).toThrow()
  })
})
