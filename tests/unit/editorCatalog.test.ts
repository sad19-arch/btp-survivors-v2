import { describe, it, expect } from 'vitest'
import { getStageCatalog, STAGE_LIST, CATEGORIES } from '@/editor/PrefabCatalog'
import { SHARED_WORKER_NPCS } from '@render/stages'
import { destructiblesForStage } from '@content/destructibles'

/**
 * Complétude du catalogue éditeur : rien de ce qu'on a CRÉÉ ne doit manquer dans
 * la palette d'un stage. On vérifie, pour CHAQUE stage :
 *  - le kit de décor PARTAGÉ (clôtures/portail/routes) → catégorie « Divers » ;
 *  - les PNJ ouvriers génériques (mobiles) → catégorie « npc_ouvrier » ;
 *  - au moins une scène ;
 *  - la cohérence : toute catégorie référencée par une entrée existe dans CATEGORIES.
 */

const SHARED_DECOR_KEYS = ['fence_panel', 'fence_post', 'site_gate', 'road_strip', 'piste_strip']

describe('PrefabCatalog — complétude par stage', () => {
  const catIds = new Set(CATEGORIES.map((c) => c.id))

  for (const { id: stage, label } of STAGE_LIST) {
    describe(label, () => {
      const cat = getStageCatalog(stage)

      it('expose le kit de décor partagé (clôtures/portail/routes) en « Divers »', () => {
        for (const key of SHARED_DECOR_KEYS) {
          const entry = cat.entries.find((e) => e.id === 'obj_' + key)
          expect(entry, `${key} manquant dans ${stage}`).toBeDefined()
          expect(entry?.category).toBe('divers')
        }
      })

      it('expose les PNJ ouvriers mobiles génériques (npc_ouvrier)', () => {
        const ouvriers = cat.entries.filter((e) => e.category === 'npc_ouvrier')
        expect(ouvriers.length).toBeGreaterThanOrEqual(SHARED_WORKER_NPCS.length)
        for (const npc of SHARED_WORKER_NPCS) {
          expect(cat.entries.some((e) => e.npcSkin === npc.key && e.npcKind === 'worker')).toBe(true)
        }
      })

      it('a au moins une scène composée', () => {
        expect(cat.entries.some((e) => e.category === 'scenes')).toBe(true)
      })

      it('n\'a que des catégories déclarées dans CATEGORIES', () => {
        for (const e of cat.entries) {
          expect(catIds.has(e.category), `catégorie inconnue « ${e.category} » (${e.id})`).toBe(true)
        }
      })

      it('a autant d\'entrées destructibles que de types définis pour le stage', () => {
        const defined = destructiblesForStage(stage)
        const entries = cat.entries.filter((e) => e.destructibleTypeId !== undefined)
        expect(entries.length).toBe(defined.length)
        for (const d of defined) {
          expect(entries.some((e) => e.destructibleTypeId === d.id)).toBe(true)
        }
      })
    })
  }

  it('stage 01 (terrain vierge) a au moins un cassable (garde de non-régression)', () => {
    const entries = getStageCatalog('terrain_vierge').entries.filter((e) => e.destructibleTypeId !== undefined)
    expect(entries.length).toBeGreaterThanOrEqual(1)
  })
})
