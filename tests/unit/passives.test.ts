import { describe, it, expect } from 'vitest'
import { aggregatePassives, BASE_STATS, PASSIVES } from '@content/passives'

describe('passifs — agrégation en PlayerStats (pur)', () => {
  it('inventaire vide → stats de base', () => {
    expect(aggregatePassives([])).toEqual(BASE_STATS)
  })
  it('Outillage renforcé niv.3 → might 1 + 3×0.10 = 1.30', () => {
    const s = aggregatePassives([{ id: 'outillage_renforce', level: 3 }])
    expect(s.might).toBeCloseTo(1.3)
  })
  it('Groupe électrogène (additif) niv.2 → amount 0 + 2 = 2', () => {
    expect(aggregatePassives([{ id: 'groupe_electrogene', level: 2 }]).amount).toBe(2)
  })
  it('Cadence niv.5 → cooldown 1 − 5×0.08 = 0.60', () => {
    expect(aggregatePassives([{ id: 'cadence_chantier', level: 5 }]).cooldown).toBeCloseTo(0.6)
  })
  it('chaque passif du slice existe avec un maxLevel > 0', () => {
    for (const id of ['air_comprime','groupe_electrogene','outillage_renforce','cadence_chantier','casque_homologue','chaussures_securite']) {
      expect(PASSIVES[id]?.maxLevel, id).toBeGreaterThan(0)
    }
  })
})
