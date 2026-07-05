/**
 * Tests d'intégrité et de logique pour les 5 évolutions Phase A.
 *
 * Réutilise le helper de construction d'inventaire de evolution.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { EVOLUTIONS } from '@content/evolutions'
import { WEAPONS } from '@content/weapons'
import { PASSIVES } from '@content/passives'
import { findEvolution } from '@core/systems/evolution'
import type { Inventory } from '@core/systems/cards'

/** Helper identique à celui de evolution.test.ts */
function makeInv(
  weapons: { id: string; level: number }[],
  passives: { id: string; level: number }[]
): Inventory {
  return { weapons, passives }
}

// ─────────────────────────────────────────────────────────────────────────────
// Intégrité du tableau EVOLUTIONS
// ─────────────────────────────────────────────────────────────────────────────

describe('EVOLUTIONS — intégrité des ids', () => {
  it('chaque base ∈ WEAPONS', () => {
    for (const evo of EVOLUTIONS) {
      expect(WEAPONS[evo.base], `base '${evo.base}' manquante dans WEAPONS`).toBeDefined()
    }
  })

  it('chaque evolved ∈ WEAPONS', () => {
    for (const evo of EVOLUTIONS) {
      expect(WEAPONS[evo.evolved], `evolved '${evo.evolved}' manquante dans WEAPONS`).toBeDefined()
    }
  })

  it('chaque passive ∈ PASSIVES', () => {
    for (const evo of EVOLUTIONS) {
      expect(PASSIVES[evo.passive], `passive '${evo.passive}' manquante dans PASSIVES`).toBeDefined()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Logique findEvolution pour les 5 nouvelles paires Phase A
// ─────────────────────────────────────────────────────────────────────────────

describe('findEvolution — Phase A', () => {
  // 1. goudron + cadence_chantier → coulee_bitume
  describe('goudron + cadence_chantier → coulee_bitume', () => {
    it('arme@8 + passif@1 → évolution trouvée', () => {
      const inv = makeInv(
        [{ id: 'goudron', level: 8 }],
        [{ id: 'cadence_chantier', level: 1 }]
      )
      const result = findEvolution(inv)
      expect(result).not.toBeNull()
      expect(result?.evolved).toBe('coulee_bitume')
    })

    it('arme@7 + passif@1 → null', () => {
      const inv = makeInv(
        [{ id: 'goudron', level: 7 }],
        [{ id: 'cadence_chantier', level: 1 }]
      )
      expect(findEvolution(inv)).toBeNull()
    })
  })

  // 2. boulons + aimant_chantier → tempete_boulons
  describe('boulons + aimant_chantier → tempete_boulons', () => {
    it('arme@8 + passif@1 → évolution trouvée', () => {
      const inv = makeInv(
        [{ id: 'boulons', level: 8 }],
        [{ id: 'aimant_chantier', level: 1 }]
      )
      const result = findEvolution(inv)
      expect(result).not.toBeNull()
      expect(result?.evolved).toBe('tempete_boulons')
    })

    it('arme@7 + passif@1 → null', () => {
      const inv = makeInv(
        [{ id: 'boulons', level: 7 }],
        [{ id: 'aimant_chantier', level: 1 }]
      )
      expect(findEvolution(inv)).toBeNull()
    })
  })

  // 3. cle_molette + batterie_18v → cle_choc
  describe('cle_molette + batterie_18v → cle_choc', () => {
    it('arme@8 + passif@1 → évolution trouvée', () => {
      const inv = makeInv(
        [{ id: 'cle_molette', level: 8 }],
        [{ id: 'batterie_18v', level: 1 }]
      )
      const result = findEvolution(inv)
      expect(result).not.toBeNull()
      expect(result?.evolved).toBe('cle_choc')
    })

    it('arme@7 + passif@1 → null', () => {
      const inv = makeInv(
        [{ id: 'cle_molette', level: 7 }],
        [{ id: 'batterie_18v', level: 1 }]
      )
      expect(findEvolution(inv)).toBeNull()
    })
  })

  // 4. extincteur + casque_homologue → canon_mousse
  describe('extincteur + casque_homologue → canon_mousse', () => {
    it('arme@8 + passif@1 → évolution trouvée', () => {
      const inv = makeInv(
        [{ id: 'extincteur', level: 8 }],
        [{ id: 'casque_homologue', level: 1 }]
      )
      const result = findEvolution(inv)
      expect(result).not.toBeNull()
      expect(result?.evolved).toBe('canon_mousse')
    })

    it('arme@7 + passif@1 → null', () => {
      const inv = makeInv(
        [{ id: 'extincteur', level: 7 }],
        [{ id: 'casque_homologue', level: 1 }]
      )
      expect(findEvolution(inv)).toBeNull()
    })
  })

  // 5. brouette + prime_rendement → transpalette
  describe('brouette + prime_rendement → transpalette', () => {
    it('arme@8 + passif@1 → évolution trouvée', () => {
      const inv = makeInv(
        [{ id: 'brouette', level: 8 }],
        [{ id: 'prime_rendement', level: 1 }]
      )
      const result = findEvolution(inv)
      expect(result).not.toBeNull()
      expect(result?.evolved).toBe('transpalette')
    })

    it('arme@7 + passif@1 → null', () => {
      const inv = makeInv(
        [{ id: 'brouette', level: 7 }],
        [{ id: 'prime_rendement', level: 1 }]
      )
      expect(findEvolution(inv)).toBeNull()
    })
  })
})
