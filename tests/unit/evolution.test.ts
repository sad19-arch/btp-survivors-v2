import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { tryEvolve } from '@core/systems/evolution'

function setup(weapons: { id: string; level: number }[], passives: { id: string; level: number }[]) {
  const w = new World()
  const e = w.spawn()
  w.add(e, 'weapons', { slots: weapons.map(x => ({ ...x, cooldownLeftMs: 0 })) })
  w.add(e, 'passives', { list: passives })
  return { w, e }
}

describe('tryEvolve', () => {
  it('cloueur max + air comprimé → mitrailleuse_clous', () => {
    const { w, e } = setup([{ id: 'cloueur', level: 8 }], [{ id: 'air_comprime', level: 2 }])
    expect(tryEvolve(w, e)).toBe('mitrailleuse_clous')
    const weapons = w.get(e, 'weapons')
    expect(weapons).toBeDefined()
    const slot0 = weapons?.slots[0]
    expect(slot0?.id).toBe('mitrailleuse_clous')
  })
  it('cloueur pas au max → pas d\'évolution', () => {
    const { w, e } = setup([{ id: 'cloueur', level: 7 }], [{ id: 'air_comprime', level: 1 }])
    expect(tryEvolve(w, e)).toBeNull()
  })
  it('bonbonne_chantier max + surcharge de gaz → détonation en chaîne', () => {
    const { w, e } = setup([{ id: 'bonbonne_chantier', level: 8 }], [{ id: 'surcharge_gaz', level: 1 }])
    expect(tryEvolve(w, e)).toBe('detonation_chaine')
    const slot0 = w.get(e, 'weapons')?.slots[0]
    expect(slot0?.id).toBe('detonation_chaine')
  })
  it('scie max + disque diamant → tronçonneuse de chantier', () => {
    const { w, e } = setup([{ id: 'scie', level: 8 }], [{ id: 'disque_diamant', level: 1 }])
    expect(tryEvolve(w, e)).toBe('tronconneuse_chantier')
    const slot0 = w.get(e, 'weapons')?.slots[0]
    expect(slot0?.id).toBe('tronconneuse_chantier')
  })
  it('marteau max + compresseur pneumatique → brise-roche', () => {
    const { w, e } = setup([{ id: 'marteau', level: 8 }], [{ id: 'compresseur_pneumatique', level: 1 }])
    expect(tryEvolve(w, e)).toBe('brise_roche')
    const slot0 = w.get(e, 'weapons')?.slots[0]
    expect(slot0?.id).toBe('brise_roche')
  })
  it('pied_de_biche max + chaussures de sécurité → barre à mine', () => {
    const { w, e } = setup([{ id: 'pied_de_biche', level: 8 }], [{ id: 'chaussures_securite', level: 1 }])
    expect(tryEvolve(w, e)).toBe('barre_a_mine')
    const slot0 = w.get(e, 'weapons')?.slots[0]
    expect(slot0?.id).toBe('barre_a_mine')
  })
  it('resets cooldownLeftMs on evolution', () => {
    const w = new World()
    const e = w.spawn()
    // Set up a weapon slot with a nonzero cooldownLeftMs
    w.add(e, 'weapons', { slots: [{ id: 'cloueur', level: 8, cooldownLeftMs: 500 }] })
    w.add(e, 'passives', { list: [{ id: 'air_comprime', level: 1 }] })

    expect(tryEvolve(w, e)).toBe('mitrailleuse_clous')
    const weapons = w.get(e, 'weapons')
    expect(weapons?.slots[0]).toEqual({
      id: 'mitrailleuse_clous',
      level: 1,
      cooldownLeftMs: 0
    })
  })
})
