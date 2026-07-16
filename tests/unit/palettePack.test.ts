import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { getStageCatalog, STAGE_LIST, CATEGORIES, assetMeta } from '@/editor/PrefabCatalog'
import { assetSolidity } from '@content/assetSolidity'

/**
 * Pack « palette » (`public/palette/*`) — décor générique partagé par les 10 stages.
 *
 * Ce que ces tests protègent, et POURQUOI (chacun correspond à un bug réel du dépôt) :
 *
 *  1. **Partagé = les 10 stages.** `SHARED_DECOR_ASSETS` est le seul mécanisme de
 *     partage cross-stage. Un asset qui n'y passe pas n'existe que sur son stage.
 *  2. **Catégorie déclarée.** Une entrée rangée dans une catégorie absente de
 *     `CATEGORIES` n'est affichée NULLE PART : la palette n'itère que sur ce
 *     tableau. C'est le bug « routes livrées mais introuvables » (cf.
 *     `editorCatalog.test.ts`) : la fonctionnalité était là, l'étiquette manquait.
 *  3. **Pas de retour au fourre-tout.** `objectEntries` retombe sur `objects` quand
 *     `ASSET_META` ne connaît pas la clé. Silencieux, et 55 items y disparaîtraient.
 *  4. **Le fichier existe.** Une clé qui pointe sur un PNG absent ne casse rien au
 *     build : elle produit une texture manquante à l'exécution, dans l'éditeur.
 *  5. **Couche d'affichage.** Un marquage au sol doit être `decal`, sinon il
 *     s'affiche à hauteur de prop et « flotte » (le bug historique `piste_strip`).
 *  6. **Solidité = déclaration.** Un décalque solide est une contradiction : on ne
 *     bute pas dans une tache d'huile.
 */

const PREFIX = 'pal_'
const EXPECTED_COUNT = 55

function paletteAssets(stageId: string) {
  return getStageCatalog(stageId).assets.filter((a) => a.key.startsWith(PREFIX))
}
function paletteEntries(stageId: string) {
  return getStageCatalog(stageId).entries.filter((e) => e.id.startsWith('obj_' + PREFIX))
}

describe('pack palette — partagé par les 10 stages', () => {
  for (const { id, label } of STAGE_LIST) {
    it(`${label} expose les ${EXPECTED_COUNT} assets ET ${EXPECTED_COUNT} entrées posables`, () => {
      // Deux assertions distinctes : un asset PRÉCHARGÉ mais sans entrée de palette
      // est chargé en VRAM et restera impossible à poser (le cas des 50 tuiles de sol).
      expect(paletteAssets(id)).toHaveLength(EXPECTED_COUNT)
      expect(paletteEntries(id)).toHaveLength(EXPECTED_COUNT)
    })
  }
})

describe('pack palette — cohérence des données', () => {
  const assets = paletteAssets('livraison_audit') // un stage QUELCONQUE, pas le 01

  it('chaque PNG déclaré existe réellement sur le disque', () => {
    const missing = assets.filter((a) => !existsSync('public/' + a.file))
    expect(missing.map((a) => a.file)).toEqual([])
  })

  it('chaque entrée tombe dans une catégorie DÉCLARÉE dans CATEGORIES', () => {
    const known = new Set(CATEGORIES.map((c) => c.id))
    const orphans = paletteEntries('livraison_audit').filter((e) => !known.has(e.category))
    expect(orphans.map((e) => `${e.id} → ${e.category}`)).toEqual([])
  })

  it('aucune entrée ne retombe dans le fourre-tout « Objets isolés avancés »', () => {
    const fallen = paletteEntries('livraison_audit').filter((e) => e.category === 'objects')
    expect(fallen.map((e) => e.id)).toEqual([])
  })

  it('chaque asset a un libellé FR explicite (pas le nom de fichier humanisé)', () => {
    const unnamed = assets.filter((a) => assetMeta(a.key) === null)
    expect(unnamed.map((a) => a.key)).toEqual([])
  })

  it('les 7 familles du pack sont toutes peuplées', () => {
    const counts = new Map<string, number>()
    for (const e of paletteEntries('livraison_audit')) {
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
    }
    for (const family of ['verdure', 'mobilier', 'reseaux', 'engins', 'vie_chantier', 'marquages', 'nature']) {
      expect(counts.get(family) ?? 0, `famille « ${family} » vide`).toBeGreaterThan(0)
    }
  })
})

describe('pack palette — couche d’affichage et solidité', () => {
  const assets = paletteAssets('livraison_audit')

  it('les marquages au sol portent le rôle « decal » (sinon ils flottent)', () => {
    // `layerForRole` dérive RenderLayer du rôle : decal → couche 'decal'. Un
    // marquage déclaré 'prop' s'afficherait au-dessus du sol, comme piste_strip.
    const groundMarks = ['pal_oil_stain', 'pal_crosswalk', 'pal_road_arrow', 'pal_hazard_hatching', 'pal_manhole_cover', 'pal_tree_grate', 'pal_muddy_pond']
    for (const key of groundMarks) {
      const a = assets.find((x) => x.key === key)
      expect(a?.role, `${key} doit être un décalque`).toBe('decal')
    }
  })

  it('aucun décalque n’est solide (on ne bute pas dans une tache d’huile)', () => {
    const solidDecals = assets.filter((a) => a.role === 'decal' && assetSolidity(a.key) !== undefined)
    expect(solidDecals.map((a) => a.key)).toEqual([])
  })

  it('les engins et volumes habitables sont DÉCLARÉS solides', () => {
    // Le repli par rôle rendrait déjà les `structure` bloquantes, mais avec un
    // cercle générique r=40 : trop petit pour un bungalow. On déclare la vraie forme.
    for (const key of ['pal_van', 'pal_forklift', 'pal_site_dumper', 'pal_site_office', 'pal_site_canteen', 'pal_bus_shelter']) {
      expect(assetSolidity(key)?.collide, `${key} doit bloquer`).toBe('both')
    }
  })

  it('ce qui bloque a TOUJOURS une forme (invariant de extractObstacles)', () => {
    for (const a of assets) {
      const s = assetSolidity(a.key)
      if (s !== undefined && s.collide !== 'none') {
        expect(s.shape, `${a.key} bloque sans forme`).toBeDefined()
      }
    }
  })

  it('les barrières sont des segments, jamais des disques', () => {
    for (const key of ['pal_jersey_barrier', 'pal_farm_fence']) {
      const s = assetSolidity(key)
      expect(s?.collide).toBe('both')
      expect(s !== undefined && s.collide !== 'none' ? s.shape.kind : null, `${key} doit être un mur`).toBe('segment')
    }
  })
})
