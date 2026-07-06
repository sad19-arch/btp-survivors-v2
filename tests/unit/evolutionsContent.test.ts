import { describe, it, expect } from 'vitest'
import { EVOLUTIONS } from '@content/evolutions'
import { WEAPONS, weaponStatsAtLevel } from '@content/weapons'
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

/**
 * Garde-fou de RESSENTI (power fantasy) : une évolution doit être un PIC de
 * puissance, pas un downgrade. Comme les dégâts sont désormais affichés à
 * l'écran (chiffres flottants), le nombre par coup de l'évolution doit être
 * AU MOINS égal à celui de l'arme de base à son niveau max — sinon évoluer
 * « fait baisser le chiffre » et sonne comme une régression.
 */
describe('Évolutions — pic de puissance (dégâts ≥ base niv max)', () => {
  for (const evo of EVOLUTIONS) {
    it(`${evo.evolved} tape au moins aussi fort que ${evo.base} niv max`, () => {
      const base = WEAPONS[evo.base]
      const evolved = WEAPONS[evo.evolved]
      expect(base, evo.base).toBeDefined()
      expect(evolved, evo.evolved).toBeDefined()
      if (base === undefined || evolved === undefined) {return}
      const baseMaxDamage = weaponStatsAtLevel(base, base.maxLevel).damage
      const evoDamage = weaponStatsAtLevel(evolved, 1).damage
      expect(evoDamage, `${evo.evolved} (${evoDamage}) vs ${evo.base} niv ${base.maxLevel} (${baseMaxDamage})`)
        .toBeGreaterThanOrEqual(baseMaxDamage)
    })
  }
})
