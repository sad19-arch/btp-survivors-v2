import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@/editor/EditorState'
import { setActiveStage } from '@/editor/PrefabCatalog'
import { parseLayout, serializeLayout, emptyLayout } from '@/editor/StageLayoutSchema'
import { buildSiteLayout, composedToSiteLayout } from '@core/siteLayout'
import type { StageLayout } from '@content/stageLayout'

const W = 10240
const H = 7680

/**
 * Valide la fonctionnalité « partir du stage généré » (base éditable) + « les
 * engins ont des collisions », de bout en bout et SANS navigateur : EditorState
 * est Phaser-free, l'environnement de test est happy-dom (localStorage réel).
 */
describe('EditorState.importGenerated', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('un stage LEGACY (gros_oeuvre) → instances embarquées non vides', () => {
    setActiveStage('gros_oeuvre')
    const state = new EditorState('gros_oeuvre')
    state.importGenerated()
    expect(state.instances.length).toBeGreaterThan(0)
    // Chaque instance importée porte ses éléments résolus (rendu sans catalogue).
    expect(state.instances.every((i) => (i.elements?.length ?? 0) > 0)).toBe(true)
    // La route n'est PAS importée comme instance éditable.
    expect(state.instances.some((i) => i.prefab === 'cluster_route')).toBe(false)
  })

  it('les engins non-collidables (struct_/landmark) deviennent BLOQUANTS', () => {
    setActiveStage('gros_oeuvre')
    const state = new EditorState('gros_oeuvre')
    state.importGenerated()
    const embedded = state.instances.flatMap((i) => i.elements ?? [])
    const engines = embedded.filter((e) => e.assetKey.startsWith('struct_') || e.assetKey.startsWith('landmark'))
    expect(engines.length).toBeGreaterThan(0)
    // Tous les engins portent désormais une collision (cercle 'both').
    for (const e of engines) {
      expect(e.collide).toBe('both')
      expect(e.shape?.kind).toBe('circle')
    }
  })

  it('round-trip export→parse→composedToSiteLayout : les engins produisent des obstacles', () => {
    setActiveStage('gros_oeuvre')
    const state = new EditorState('gros_oeuvre')
    state.importGenerated()

    const engines = state.instances
      .flatMap((i) => i.elements ?? [])
      .filter((e) => e.assetKey.startsWith('struct_') || e.assetKey.startsWith('landmark')).length

    const json = state.exportGameJson()
    const parsed = parseLayout(json, 'gros_oeuvre')
    expect(parsed.ok).toBe(true)
    const layout = parsed.layout as StageLayout
    const site = composedToSiteLayout(layout)

    // Au moins un obstacle cercle bloquant PAR engin (les fosses en ajoutent d'autres).
    const blockingCircles = site.obstacles.filter((o) => o.kind === 'circle' && o.blocks === 'both').length
    expect(blockingCircles).toBeGreaterThanOrEqual(engines)
  })

  it('parseLayout PRÉSERVE les éléments embarqués (persistance / undo-redo)', () => {
    setActiveStage('gros_oeuvre')
    const state = new EditorState('gros_oeuvre')
    state.importGenerated()
    const before = state.instances.flatMap((i) => i.elements ?? []).length

    // Le JSON éditeur (sérialisé) doit re-parser SANS perdre les elements.
    const json = state.exportJson()
    const parsed = parseLayout(json, 'gros_oeuvre')
    expect(parsed.ok).toBe(true)
    const layout = parsed.layout as StageLayout
    const after = layout.instances.flatMap((i) => i.elements ?? []).length
    expect(after).toBe(before)
    expect(after).toBeGreaterThan(0)
  })

  it('un stage PROGRAMMÉ (terrassement) : engins déjà collidables, préservés', () => {
    setActiveStage('terrassement')
    const state = new EditorState('terrassement')
    state.importGenerated()
    expect(state.instances.length).toBeGreaterThan(0)
    // Le stage généré a des obstacles ; l'import ne les perd pas.
    const gen = buildSiteLayout(1, W, H, 'terrassement')
    expect(gen.clusters.length).toBeGreaterThan(0)
    const site = composedToSiteLayout(parseLayout(state.exportGameJson(), 'terrassement').layout as StageLayout)
    expect(site.obstacles.length).toBeGreaterThan(0)
  })

  // Régression : un stage édité sauvé (localStorage) est RÉINJECTÉ au boot via
  // parseLayout (applyUserLayouts). Si parseLayout perd le champ `destructible`
  // des éléments, les objets cassables deviennent du décor inerte → « ne se
  // cassent pas en jeu » sur les niveaux créés par le joueur.
  it('parseLayout PRÉSERVE le champ destructible d\'un élément (casse en jeu)', () => {
    const layout = emptyLayout('terrain_vierge')
    layout.instances.push({
      id: 'd1', prefab: 'des_d01_tas_gravats', x: 100, y: 50,
      flipX: false, variant: 0, rotation: 0, locked: false,
      elements: [{ assetKey: 'prop_stage01_tas_gravats', dx: 0, dy: 0, scale: 0.7, collide: 'none', destructible: { typeId: 'd01_tas_gravats' } }]
    })
    const parsed = parseLayout(serializeLayout(layout), 'terrain_vierge')
    expect(parsed.ok).toBe(true)
    const el = parsed.layout?.instances[0]?.elements?.[0]
    expect(el?.destructible?.typeId).toBe('d01_tas_gravats')
  })

  it('un layout destructible parsé produit bien une entité destructible (sim)', () => {
    const layout = emptyLayout('terrain_vierge')
    layout.instances.push({
      id: 'd1', prefab: 'des_d01_tas_gravats', x: 0, y: 0,
      flipX: false, variant: 0, rotation: 0, locked: false,
      elements: [{ assetKey: 'prop_stage01_tas_gravats', dx: 0, dy: 0, scale: 0.7, collide: 'none', destructible: { typeId: 'd01_tas_gravats' } }]
    })
    const parsed = parseLayout(serializeLayout(layout), 'terrain_vierge').layout
    expect(parsed).toBeDefined()
    if (parsed === undefined) {return}
    const site = composedToSiteLayout(parsed)
    expect(site.destructibles?.length ?? 0).toBe(1)
    expect(site.destructibles?.[0]?.typeId).toBe('d01_tas_gravats')
  })
})
