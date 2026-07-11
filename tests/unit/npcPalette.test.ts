import { describe, it, expect } from 'vitest'
import { getStageCatalog } from '@/editor/PrefabCatalog'

/**
 * Palette PNJ (LOT 4) : 2 sections data-driven — « PNJ métier (fixe) » (skins
 * `ambient` du stage, kind 'trade') et « PNJ ouvrier (mobile) » (skins génériques
 * partagés `SHARED_WORKER_NPCS`, kind 'worker', identiques sur tous les stages).
 * Les PNJ ne sont plus des « objets isolés » de la catégorie « workers ».
 */
describe('palette PNJ — 2 sections (métier fixe / ouvrier mobile)', () => {
  it('terrain_vierge : ≥1 métier + les 3 ouvriers génériques', () => {
    const cat = getStageCatalog('terrain_vierge')
    const metier = cat.entries.filter((e) => e.category === 'npc_metier')
    const ouvrier = cat.entries.filter((e) => e.category === 'npc_ouvrier')

    expect(metier.length).toBeGreaterThan(0)
    expect(ouvrier.some((e) => e.id.includes('ouvrier'))).toBe(true)
    for (const key of ['npc_ouvrier_a', 'npc_ouvrier_b', 'npc_ouvrier_c']) {
      expect(ouvrier.some((e) => e.npcSkin === key && e.npcKind === 'worker')).toBe(true)
    }
    // Chaque entrée métier porte un skin + kind 'trade'.
    expect(metier.every((e) => e.npcSkin !== undefined && e.npcKind === 'trade')).toBe(true)
  })

  it('les ouvriers génériques sont présents sur TOUS les stages (ex. gros_oeuvre)', () => {
    const cat = getStageCatalog('gros_oeuvre')
    const ouvrier = cat.entries.filter((e) => e.category === 'npc_ouvrier')
    for (const key of ['npc_ouvrier_a', 'npc_ouvrier_b', 'npc_ouvrier_c']) {
      expect(ouvrier.some((e) => e.npcSkin === key)).toBe(true)
    }
    // Ce stage expose aussi ses propres métiers.
    expect(cat.entries.some((e) => e.category === 'npc_metier')).toBe(true)
  })

  it('objectEntries ne met plus de PNJ (worker) dans la catégorie « workers »', () => {
    const cat = getStageCatalog('terrain_vierge')
    const workerObjs = cat.entries.filter((e) => e.id.startsWith('obj_') && e.category === 'workers')
    expect(workerObjs).toHaveLength(0)
  })
})
