import { describe, expect, it } from 'vitest'
import { projectileRenderScale } from '@render/projectileRenderScale'

describe('échelle visuelle de la Brouette', () => {
  it('reste à son échelle historique au niveau 1', () => {
    expect(projectileRenderScale('brouette', 26, 0.62)).toBeCloseTo(0.62, 5)
  })

  it('grandit partiellement avec la hitbox jusqu’au niveau 8', () => {
    const level1 = projectileRenderScale('brouette', 26, 0.62)
    const level8 = projectileRenderScale('brouette', 40, 0.62)

    expect(level8).toBeGreaterThan(level1)
    expect(level8).toBeCloseTo(0.712, 3)
    expect(level8 / level1).toBeLessThan(40 / 26)
  })

  it('conserve une silhouette de Transpalette plus imposante', () => {
    expect(projectileRenderScale('transpalette', 40, 0.82)).toBeCloseTo(0.82, 5)
    expect(projectileRenderScale('transpalette', 40, 0.82)).toBeGreaterThan(projectileRenderScale('brouette', 40, 0.62))
  })

  it('ne modifie pas l’échelle des autres projectiles', () => {
    expect(projectileRenderScale('cloueur', 99, 0.8)).toBeCloseTo(0.8, 5)
  })
})
