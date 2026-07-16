import { describe, it, expect, beforeEach } from 'vitest'
import { ASSET_SOLIDITY, resolveSolidity, type Solidity } from '@content/assetSolidity'
import { CLUSTERS } from '@content/clusters'
import { EditorState } from '@/editor/EditorState'
import { setActiveStage } from '@/editor/PrefabCatalog'
import { parseLayout } from '@/editor/StageLayoutSchema'
import { composedToSiteLayout } from '@core/siteLayout'
import type { EmbeddedElement, StageLayout } from '@content/stageLayout'

/**
 * Solidité DÉCLARÉE (engins + barrières). Ces tests gardent l'invariant qui
 * manquait : la solidité d'une clé ne dépend NI du cluster où elle est posée, NI
 * du chemin (éditeur / contenu écrit à la main) qui la produit.
 */

/** Toutes les clés déclarées SOLIDES (engins + barrières). */
const SOLID_KEYS = Object.entries(ASSET_SOLIDITY)
  .filter(([, s]) => s.collide !== 'none')
  .map(([k]) => k)

/** Toutes les occurrences (clusterId + élément) d'une clé dans le registre. */
function occurrences(key: string): Array<{ clusterId: string; el: (typeof CLUSTERS)[string]['elements'][number] }> {
  const out: Array<{ clusterId: string; el: (typeof CLUSTERS)[string]['elements'][number] }> = []
  for (const [clusterId, def] of Object.entries(CLUSTERS)) {
    for (const el of def.elements) {
      if (el.assetKey === key) {
        out.push({ clusterId, el })
      }
    }
  }
  return out
}

/** Solidité que l'ÉDITEUR produit pour une clé posée seule (objet isolé). */
function editorSolidityOf(stage: string, key: string): EmbeddedElement | undefined {
  setActiveStage(stage)
  const state = new EditorState(stage)
  state.addInstance('obj_' + key, 0, 0)
  const parsed = parseLayout(state.exportGameJson(), stage)
  const layout = parsed.layout as StageLayout
  return layout.instances.flatMap((i) => i.elements ?? []).find((e) => e.assetKey === key)
}

describe('assetSolidity — la solidité est DÉCLARÉE, pas déduite', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  // Le défaut historique : la même clé se contredisait d'un cluster à l'autre
  // (prop_s2_truck bloquant ×3, traversable ×1 — mesuré).
  it('toute clé déclarée solide bloque sur TOUTES ses occurrences en cluster', () => {
    let checked = 0
    for (const key of SOLID_KEYS) {
      for (const { clusterId, el } of occurrences(key)) {
        checked++
        expect(el.collide, `${clusterId} : « ${key} » déclaré solide mais posé collide="none"`).not.toBe('none')
        expect(el.shape, `${clusterId} : « ${key} » bloque mais sans forme`).toBeDefined()
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  // Les 6 clés du diagnostic : elles DOIVENT être posées quelque part, sinon le
  // test ci-dessus passerait à vide.
  it('les engins/barrières historiquement contradictoires sont posés ET bloquants', () => {
    for (const key of ['prop_s2_excavator', 'prop_s2_truck', 'prop_s2_dozer', 'prop_s2_roller', 'fence_panel', 'fence_post']) {
      const occ = occurrences(key)
      expect(occ.length, `« ${key} » n'est posé dans aucun cluster`).toBeGreaterThan(0)
      expect(occ.every((o) => o.el.collide !== 'none')).toBe(true)
    }
  })

  // LE CAS-TEST de la déclaration : `site_gate` a le rôle `structure`, donc toute
  // déduction par rôle le rendrait bloquant et SCELLERAIT l'anneau de clôture.
  it('site_gate reste TRAVERSABLE (le portail est le passage) — dans les 2 chemins', () => {
    expect(ASSET_SOLIDITY.site_gate?.collide).toBe('none')
    const occ = occurrences('site_gate')
    expect(occ.length).toBeGreaterThan(0)
    for (const { clusterId, el } of occ) {
      expect(el.collide, `${clusterId} : le portail bloque`).toBe('none')
      expect(el.shape).toBeUndefined()
    }
    // …et l'éditeur, qui le classait `structure` → bloquant, le laisse passer.
    expect(editorSolidityOf('terrassement', 'site_gate')?.collide).toBe('none')
  })

  // LE test qui aurait attrapé les 4 inversions : deux chemins, une seule réponse.
  it('export ÉDITEUR et cluster EN DUR donnent la MÊME solidité pour la même clé', () => {
    const cases: Array<{ stage: string; key: string }> = [
      { stage: 'terrassement', key: 'prop_s2_excavator' },
      { stage: 'terrassement', key: 'prop_s2_truck' },
      { stage: 'terrassement', key: 'prop_s2_dozer' },
      { stage: 'terrassement', key: 'prop_s2_roller' },
      { stage: 'terrassement', key: 'fence_panel' },
      { stage: 'terrassement', key: 'fence_post' },
      { stage: 'terrassement', key: 'site_gate' },
      { stage: 'fondations', key: 'struct_stage03_mixer' },
      { stage: 'fondations', key: 'struct_stage03_pump' },
      { stage: 'fondations', key: 'prop_stage03_concrete_mixer' }
    ]
    for (const { stage, key } of cases) {
      const fromEditor = editorSolidityOf(stage, key)
      expect(fromEditor, `« ${key} » introuvable dans l'export éditeur (stage ${stage})`).toBeDefined()
      const occ = occurrences(key)
      expect(occ.length, `« ${key} » n'est posé dans aucun cluster`).toBeGreaterThan(0)
      for (const { clusterId, el } of occ) {
        expect(
          fromEditor?.collide,
          `divergence sur « ${key} » : éditeur="${String(fromEditor?.collide)}" vs ${clusterId}="${el.collide}"`
        ).toBe(el.collide)
      }
    }
  })

  // La forme écrite est TRANSPORTÉE : l'éditeur fabriquait un cercle depuis
  // l'échelle (`r = max(16, scale*40)`) — une clôture n'est pas un disque.
  it('la forme SEGMENT d\'une clôture survit à l\'export éditeur (jusqu\'à la sim)', () => {
    const el = editorSolidityOf('terrassement', 'fence_panel')
    expect(el?.collide).toBe('both')
    expect(el?.shape?.kind).toBe('segment')

    setActiveStage('terrassement')
    const state = new EditorState('terrassement')
    state.addInstance('obj_fence_panel', 0, 0)
    const layout = parseLayout(state.exportGameJson(), 'terrassement').layout as StageLayout
    const site = composedToSiteLayout(layout)
    // La sim reçoit bien un MUR, pas un disque.
    expect(site.obstacles.some((o) => o.kind === 'segment' && o.blocks === 'both')).toBe(true)
  })

  // Défaut sûr : ne pas déclarer un asset ne doit RIEN changer pour lui.
  it('un asset NON déclaré garde exactement le comportement écrit / le repli', () => {
    const written: Solidity = { collide: 'both', shape: { kind: 'circle', r: 40 } }
    expect(resolveSolidity('asset_inconnu_xyz', written)).toEqual(written)
    expect(resolveSolidity('asset_inconnu_xyz', { collide: 'none' })).toEqual({ collide: 'none' })
    // Rien d'écrit de solide → le repli de l'appelant (heuristique de rôle) joue.
    const fallback: Solidity = { collide: 'both', shape: { kind: 'circle', r: 16 } }
    expect(resolveSolidity('asset_inconnu_xyz', { collide: 'none' }, fallback)).toEqual(fallback)
    expect(resolveSolidity('asset_inconnu_xyz')).toEqual({ collide: 'none' })
  })

  it('la déclaration PRIME sur le placement, mais transporte la forme écrite', () => {
    // Un cluster qui écrirait « pelleteuse décorative » ne peut plus la faire traverser.
    expect(resolveSolidity('prop_s2_excavator', { collide: 'none' }).collide).toBe('both')
    // …et la forme écrite (palissade orientée) gagne sur la forme par défaut.
    const orientee: Solidity = { collide: 'both', shape: { kind: 'segment', x2: 0, y2: 80, thickness: 10 } }
    expect(resolveSolidity('fence_panel', orientee)).toEqual(orientee)
    // Le portail déclaré traversable ne peut pas être « rendu solide » par un repli.
    expect(resolveSolidity('site_gate', undefined, { collide: 'both', shape: { kind: 'circle', r: 40 } })).toEqual({ collide: 'none' })
  })

  // Une compo joueur exportée AVANT ce lot transporte `collide:'none'` sur ses
  // engins : la sim doit la corriger au chargement, sans migration de fichier.
  it('une compo SAUVEGARDÉE avec un engin traversable produit quand même un obstacle', () => {
    const layout = parseLayout(
      JSON.stringify({
        schemaVersion: 1,
        stage: 'terrassement',
        worldSize: { width: 10240, height: 7680 },
        spawn: { x: 0, y: 0 },
        cameraPreview: { width: 1280, height: 720 },
        instances: [
          {
            id: 'i1', prefab: 'obj_prop_s2_excavator', x: 0, y: 0, flipX: false, variant: 0, rotation: 0, locked: false,
            elements: [{ assetKey: 'prop_s2_excavator', dx: 0, dy: 0, scale: 1.2, collide: 'none' }]
          }
        ],
        markers: [], paths: [], npcs: []
      }),
      'terrassement'
    ).layout as StageLayout
    const site = composedToSiteLayout(layout)
    expect(site.obstacles.length).toBe(1)
    expect(site.obstacles[0]?.blocks).toBe('both')
    expect(site.obstacles[0]?.r).toBe(56) // le rayon DÉCLARÉ, pas un cercle deviné
  })
})
