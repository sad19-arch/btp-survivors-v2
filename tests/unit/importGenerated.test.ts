import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@/editor/EditorState'
import { setActiveStage } from '@/editor/PrefabCatalog'
import { parseLayout, serializeLayout, emptyLayout } from '@/editor/StageLayoutSchema'
import { composedToSiteLayout } from '@core/siteLayout'
import type { StageLayout } from '@content/stageLayout'


/**
 * Valide la fonctionnalité « partir du stage généré » (base éditable) + « les
 * engins ont des collisions », de bout en bout et SANS navigateur : EditorState
 * est Phaser-free, l'environnement de test est happy-dom (localStorage réel).
 */
describe('EditorState.importGenerated', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('terrain_vierge → instances embarquées non vides', () => {
    setActiveStage('terrain_vierge')
    const state = new EditorState('terrain_vierge')
    state.importGenerated()
    expect(state.instances.length).toBeGreaterThan(0)
    // Chaque instance importée porte ses éléments résolus (rendu sans catalogue).
    expect(state.instances.every((i) => (i.elements?.length ?? 0) > 0)).toBe(true)
    // La route n'est PAS importée comme instance éditable.
    expect(state.instances.some((i) => i.prefab === 'cluster_route')).toBe(false)
  })

  it('parseLayout PRÉSERVE les éléments embarqués (persistance / undo-redo)', () => {
    setActiveStage('terrain_vierge')
    const state = new EditorState('terrain_vierge')
    state.importGenerated()
    const before = state.instances.flatMap((i) => i.elements ?? []).length

    // Le JSON éditeur (sérialisé) doit re-parser SANS perdre les elements.
    const json = state.exportJson()
    const parsed = parseLayout(json, 'terrain_vierge')
    expect(parsed.ok).toBe(true)
    const layout = parsed.layout as StageLayout
    const after = layout.instances.flatMap((i) => i.elements ?? []).length
    expect(after).toBe(before)
    expect(after).toBeGreaterThan(0)
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
