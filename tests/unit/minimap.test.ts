import { describe, it, expect } from 'vitest'
import { worldToMinimap } from '@ui/minimap'

describe('worldToMinimap', () => {
  it('coin (0,0) → (0,0)', () => {
    expect(worldToMinimap(0, 0, 1000, 800, 200, 160)).toEqual({ mx: 0, my: 0 })
  })
  it('centre → centre', () => {
    expect(worldToMinimap(500, 400, 1000, 800, 200, 160)).toEqual({ mx: 100, my: 80 })
  })
  it('hors-monde clampé dans le panneau', () => {
    const p = worldToMinimap(99999, -50, 1000, 800, 200, 160)
    expect(p.mx).toBeLessThanOrEqual(200)
    expect(p.my).toBeGreaterThanOrEqual(0)
  })
  it('champ compact mobile (120×90) : centre → (60,45)', () => {
    expect(worldToMinimap(500, 400, 1000, 800, 120, 90)).toEqual({ mx: 60, my: 45 })
  })
})
