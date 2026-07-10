import { describe, it, expect } from 'vitest'
import { getStageCatalog } from '@/editor/PrefabCatalog'

/**
 * Vérifie que les assets d'implantation EXISTANTS du stage 01 sont bien
 * surfacés dans des catégories métier (et plus noyés dans « Objets isolés »).
 */
describe('palette stage 01 — implantation surfacée', () => {
  it('prop_stakes → catégorie « topo » + label « Piquets topo »', () => {
    const cat = getStageCatalog('terrain_vierge')
    const e = cat.entries.find((x) => x.id === 'obj_prop_stakes')
    expect(e).toBeDefined()
    expect(e?.category).toBe('topo')
    expect(e?.label).toBe('Piquets topo')
  })

  it('les assets d\'implantation ne sont plus dans « objects »', () => {
    const cat = getStageCatalog('terrain_vierge')
    const objectsIds = cat.entries.filter((e) => e.category === 'objects').map((e) => e.id)
    expect(objectsIds).not.toContain('obj_prop_stakes')
    expect(objectsIds).not.toContain('obj_struct_stage01_plot')
  })

  it('panneau permis → entrance, algeco → baselife, rubalise → safety', () => {
    const cat = getStageCatalog('terrain_vierge')
    const permit = cat.entries.find((e) => e.id === 'obj_landmark_stage01')
    const cabin = cat.entries.find((e) => e.id === 'obj_struct_stage01_cabin')
    const tape = cat.entries.find((e) => e.id === 'obj_struct_stage01_tape')
    expect(permit?.category).toBe('entrance')
    expect(cabin?.category).toBe('baselife')
    expect(tape?.category).toBe('safety')
  })

  it('les assets NEUFS (editorExtras) sont exposés dans la bonne section', () => {
    const cat = getStageCatalog('terrain_vierge')
    const find = (id: string) => cat.entries.find((e) => e.id === id)
    expect(find('obj_prop_stage01_theodolite')?.category).toBe('topo')
    expect(find('obj_prop_stage01_mire')?.category).toBe('topo')
    expect(find('obj_struct_stage01_wc')?.category).toBe('baselife')
    expect(find('obj_prop_stage01_cones')?.category).toBe('safety')
    expect(find('obj_decal_stage01_layout_cross')?.category).toBe('marking')
    // Libellé métier, pas nom de fichier
    expect(find('obj_prop_stage01_theodolite')?.label).toBe('Théodolite (trépied)')
  })

  it('les scènes précomposées stage 01 existent', () => {
    const cat = getStageCatalog('terrain_vierge')
    const ids = cat.entries.map((e) => e.id)
    for (const s of ['scene_stage01_survey_setup', 'scene_stage01_future_footprint_small', 'scene_stage01_site_entrance', 'scene_stage01_base_life_light']) {
      expect(ids).toContain(s)
    }
    // La scène de relevé porte bien le théodolite
    const setup = cat.entries.find((e) => e.id === 'scene_stage01_survey_setup')
    expect(setup?.elements?.some((el) => el.assetKey === 'prop_stage01_theodolite')).toBe(true)
  })
})
