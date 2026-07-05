import { describe, it, expect } from 'vitest'
import { EVOLUTIONS } from '@content/evolutions'
import { WEAPONS } from '@content/weapons'
import { PASSIVES } from '@content/passives'

/**
 * Garde-fou data-driven : chaque évolution doit pointer vers des ids réellement
 * définis (arme de base, arme évoluée, passif catalyseur), et le palier requis
 * ne doit pas dépasser le niveau max réel de l'arme de base (sinon l'évolution
 * serait à jamais inatteignable).
 */
describe('Évolutions — cohérence du contenu', () => {
  for (const evo of EVOLUTIONS) {
    it(`${evo.base} → ${evo.evolved} (catalyseur ${evo.passive}) référence des ids valides`, () => {
      expect(WEAPONS[evo.base], `arme de base « ${evo.base} »`).toBeDefined()
      expect(WEAPONS[evo.evolved], `arme évoluée « ${evo.evolved} »`).toBeDefined()
      expect(PASSIVES[evo.passive], `passif catalyseur « ${evo.passive} »`).toBeDefined()

      const base = WEAPONS[evo.base]
      if (base !== undefined) {
        expect(evo.reqBaseLevel).toBeLessThanOrEqual(base.maxLevel)
      }
    })
  }
})
