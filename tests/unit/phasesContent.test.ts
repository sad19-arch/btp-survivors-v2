import { describe, it, expect } from 'vitest'
import { PHASES, phasePoolIds, ORDERED_PHASES } from '@content/phases'
import { ENEMIES } from '@content/enemies'

/**
 * Garde-fou data-driven : les pools d'ennemis des phases doivent pointer vers
 * des ids réellement définis dans ENEMIES, et les 10 phases former une séquence
 * ordonnée sans trou (colonne vertébrale du chantier).
 */
describe('Phases — cohérence du contenu', () => {
  it('chaque id d’ennemi référencé par une phase existe dans ENEMIES', () => {
    for (const phase of Object.values(PHASES)) {
      if (phase === undefined) {
        continue
      }
      for (const id of phasePoolIds(phase)) {
        expect(ENEMIES[id], `${phase.id} → ${id}`).toBeDefined()
      }
    }
  })

  it('les 10 phases sont ordonnées 1..10 sans trou', () => {
    expect(ORDERED_PHASES.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})
