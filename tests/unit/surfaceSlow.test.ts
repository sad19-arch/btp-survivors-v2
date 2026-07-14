import { describe, expect, it } from 'vitest'
import { surfaceSlowMultiplierAt } from '@core/systems/surfaceSlow'

describe('surfaceSlowMultiplierAt', () => {
  const zones = [
    { x: 100, y: 100, radius: 50, multiplier: 0.72 },
    { x: 130, y: 100, radius: 40, multiplier: 0.62 },
  ]

  it('keeps full speed outside every surface', () => {
    expect(surfaceSlowMultiplierAt(10, 10, zones)).toBe(1)
  })

  it('applies the surface multiplier on the boundary', () => {
    expect(surfaceSlowMultiplierAt(50, 100, zones)).toBe(0.72)
  })

  it('uses the strongest slowdown when surfaces overlap', () => {
    expect(surfaceSlowMultiplierAt(120, 100, zones)).toBe(0.62)
  })
})
