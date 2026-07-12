import { describe, it, expect } from 'vitest'
import { SPAWN, REFERENCE_VIEW, FORMATION } from '@content/config'

describe('spawn hors-écran (anti-encerclement)', () => {
  it('le rayon de spawn dépasse la demi-diagonale de la vue de référence', () => {
    const halfDiag = Math.hypot(REFERENCE_VIEW.halfW, REFERENCE_VIEW.halfH)
    expect(SPAWN.ringRadius).toBeGreaterThan(halfDiag)
  })

  it("l'encercle (dont l'anti-camping) reste hors du champ visible (rayon ≥ demi-largeur)", () => {
    const encircleR = SPAWN.ringRadius * FORMATION.encircleRadiusFactor
    expect(encircleR).toBeGreaterThanOrEqual(REFERENCE_VIEW.halfW)
  })
})
