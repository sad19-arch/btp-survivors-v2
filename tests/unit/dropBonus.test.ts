import { describe, it, expect } from 'vitest'
import { PICKUP_DROPS } from '@content/config'
import { Rng } from '@core/rng'

/**
 * J9 (addiction) — drops soin/aimant réactivés. Garde-fou des chances ET de
 * l'invariant CRITIQUE : `chest` ne tombe JAMAIS d'un drop aléatoire (les
 * coffres viennent de l'économie périodique/évolution). `Rng.chance(0)` est
 * mathématiquement toujours faux (`next() ∈ [0,1)`, jamais `< 0`), donc
 * `chest.chance = 0` garantit l'absence de coffre aléatoire.
 */
describe('PICKUP_DROPS (J9)', () => {
  it('soin/aimant réactivés (chances tunables), soin rend 18 PV, aimant sans valeur', () => {
    // Les CHANCES exactes sont calées au re-tune J10 → on vérifie les invariants
    // stables (soin donne des PV, aimant est un déclencheur sans valeur) et les
    // bornes ]0,1[ (cf. test dédié), pas des chiffres qui bougent au tuning.
    expect(PICKUP_DROPS.heal.value).toBe(18)
    expect(PICKUP_DROPS.magnet.value).toBe(0)
  })

  it('coffre JAMAIS en drop aléatoire (chest.chance = 0)', () => {
    expect(PICKUP_DROPS.chest.chance).toBe(0)
  })

  it('Rng.chance(chest.chance) est toujours faux (aucun coffre aléatoire possible)', () => {
    const rng = new Rng(20260708)
    for (let i = 0; i < 10_000; i++) {
      expect(rng.chance(PICKUP_DROPS.chest.chance)).toBe(false)
    }
  })

  it('les chances soin/aimant sont dans ]0,1[ (drops possibles mais rares)', () => {
    for (const c of [PICKUP_DROPS.heal.chance, PICKUP_DROPS.magnet.chance]) {
      expect(c).toBeGreaterThan(0)
      expect(c).toBeLessThan(1)
    }
  })
})
