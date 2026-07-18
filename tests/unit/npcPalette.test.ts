import { describe, it, expect } from 'vitest'
import { getStageCatalog } from '@/editor/PrefabCatalog'
import { SHARED_WORKER_NPCS } from '@render/stages'

/**
 * Les clés sont lues sur `SHARED_WORKER_NPCS` et non recopiées : elles ont déjà
 * été renommées une fois (a/b/c → prénoms) et une liste en dur ici ne ferait que
 * re-mentir au prochain renommage. La palette pose les clés À JOUR ; les
 * anciennes ne survivent que par alias, et c'est `workerAliases.test.ts` qui le
 * vérifie.
 */
const WORKER_KEYS = SHARED_WORKER_NPCS.map((n) => n.key)

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
    for (const key of WORKER_KEYS) {
      expect(ouvrier.some((e) => e.npcSkin === key && e.npcKind === 'worker'), key).toBe(true)
    }
    // Le prénom doit se LIRE dans la palette : c'est tout l'objet du renommage.
    // Sans libellé dédié, on retomberait sur « Ouvrier Zinedine Walk » (nom de
    // fichier humanisé) — le prénom noyé dans du bruit.
    expect(ouvrier.some((e) => e.label === 'Ouvrier — Zinedine')).toBe(true)
    // Chaque entrée métier porte un skin + kind 'trade'.
    expect(metier.every((e) => e.npcSkin !== undefined && e.npcKind === 'trade')).toBe(true)
  })

  it('les ouvriers génériques sont présents sur TOUS les stages (ex. gros_oeuvre)', () => {
    const cat = getStageCatalog('gros_oeuvre')
    const ouvrier = cat.entries.filter((e) => e.category === 'npc_ouvrier')
    for (const key of WORKER_KEYS) {
      expect(ouvrier.some((e) => e.npcSkin === key), key).toBe(true)
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
