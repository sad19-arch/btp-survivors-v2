import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@/editor/EditorState'
import { setActiveStage } from '@/editor/PrefabCatalog'

/**
 * EditorState (pur) — multi-sélection, presse-papier et batch d'undo.
 * L'état persiste en localStorage : on le vide entre chaque test.
 */
describe('EditorState — multi-sélection / copier-coller / batch', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const make = (): EditorState => new EditorState('terrain_vierge')

  /**
   * Snap imposé par l'ASSET (kit de routes 256 px).
   *
   * Le piège que ça verrouille : `gridSize` vaut 128 et `snap` vaut **false** par
   * défaut. Une tuile de route de 256 posée à la souris ne tomberait donc jamais
   * en face de sa voisine — les pixels raccordent, la POSE non, et le kit serait
   * inutilisable sans que rien ne le signale. Le pas est donc une contrainte de
   * l'asset, pas une préférence de l'utilisateur.
   */
  describe('applySnapFor — pas imposé par le prefab', () => {
    const ROUTE = 'obj_pal_route_goudron_droite'

    it('une tuile de route s\'aligne sur 256 MÊME si le snap global est éteint', () => {
      const s = make()
      expect(s.snap).toBe(false)
      expect(s.gridSize).toBe(128)
      expect(s.applySnapFor(ROUTE, 300, 140)).toEqual({ x: 256, y: 256 })
      expect(s.applySnapFor(ROUTE, 100, 100)).toEqual({ x: 0, y: 0 })
    })

    it('deux tuiles posées à des points quelconques deviennent EXACTEMENT adjacentes', () => {
      const s = make()
      const a = s.applySnapFor(ROUTE, 260, 10)
      const b = s.applySnapFor(ROUTE, 300, 260)
      expect(b.x - a.x).toBe(0)
      expect(b.y - a.y).toBe(256) // pile une tuile d'écart : le raccord tient
    })

    it('un prefab ordinaire garde le comportement d\'avant (snap global éteint = libre)', () => {
      const s = make()
      expect(s.applySnapFor('obj_pal_hedge', 137, 42)).toEqual({ x: 137, y: 42 })
    })

    it('un prefab ordinaire suit la grille de 128 quand le snap global est actif', () => {
      const s = make()
      s.toggleSnap()
      expect(s.applySnapFor('obj_pal_hedge', 137, 42)).toEqual({ x: 128, y: 0 })
    })

    it('snapStepFor ne déclare un pas que pour les routes', () => {
      const s = make()
      expect(s.snapStepFor(ROUTE)).toBe(256)
      expect(s.snapStepFor('obj_pal_hedge')).toBeNull()
      expect(s.snapStepFor('prefab_inconnu')).toBeNull()
    })
  })

  it('addInstance sélectionne uniquement la nouvelle instance', () => {
    const s = make()
    const a = s.addInstance('obj_a', 0, 0)
    expect(s.selectionCount).toBe(1)
    expect(s.selectedIdSet()).toEqual([a.id])
    expect(s.selected).toBe(a.id)
  })

  it('embarque les éléments du cluster quand une scène Terrassement est posée', () => {
    setActiveStage('terrassement')
    const scene = new EditorState('terrassement').addInstance('scene_dig_active_spawn', 330, -120)

    const keys = scene.elements?.map((element) => element.assetKey) ?? []
    expect(keys).toContain('struct_stage02_pit')
    expect(keys.some((key) => key.startsWith('prop_s2_excavator'))).toBe(true)
    expect(keys.some((key) => key.startsWith('prop_s2_truck'))).toBe(true)
  })

  it('selectMany / toggleSelection / clearSelection gèrent l\'ensemble', () => {
    const s = make()
    const a = s.addInstance('obj_a', 0, 0)
    const b = s.addInstance('obj_b', 100, 0)
    const c = s.addInstance('obj_c', 200, 0)
    s.selectMany([a.id, b.id])
    expect(s.selectionCount).toBe(2)
    expect(s.isSelected(a.id)).toBe(true)
    expect(s.isSelected(c.id)).toBe(false)
    expect(s.selected).toBe(b.id) // dernier = primaire
    s.toggleSelection(c.id)
    expect(s.selectionCount).toBe(3)
    s.toggleSelection(a.id)
    expect(s.isSelected(a.id)).toBe(false)
    expect(s.selectionCount).toBe(2)
    s.clearSelection()
    expect(s.selectionCount).toBe(0)
    expect(s.selected).toBeNull()
  })

  it('moveSelectionBy déplace tout le groupe mais respecte le verrou', () => {
    const s = make()
    const a = s.addInstance('obj_a', 0, 0)
    const b = s.addInstance('obj_b', 100, 0)
    s.select(a.id)
    s.toggleLockSelected() // verrouille A
    s.selectMany([a.id, b.id])
    s.moveSelectionBy(50, 20)
    const inA = s.instances.find((i) => i.id === a.id)
    const inB = s.instances.find((i) => i.id === b.id)
    expect(inA?.x).toBe(0) // verrouillé → immobile
    expect(inB?.x).toBe(150) // déplacé
    expect(inB?.y).toBe(20)
  })

  it('deleteSelected supprime toute la sélection', () => {
    const s = make()
    const a = s.addInstance('obj_a', 0, 0)
    const b = s.addInstance('obj_b', 100, 0)
    const c = s.addInstance('obj_c', 200, 0)
    s.selectMany([a.id, b.id])
    s.deleteSelected()
    expect(s.instances.map((i) => i.id)).toEqual([c.id])
    expect(s.selectionCount).toBe(0)
  })

  it('duplicateSelected duplique tout le groupe (offset +96) et sélectionne les copies', () => {
    const s = make()
    const a = s.addInstance('obj_a', 0, 0)
    const b = s.addInstance('obj_b', 100, 0)
    s.selectMany([a.id, b.id])
    s.duplicateSelected()
    expect(s.instances.length).toBe(4)
    const sel = s.selectedIdSet()
    expect(sel.length).toBe(2)
    expect(sel).not.toContain(a.id)
    const copies = s.instances.filter((i) => sel.includes(i.id))
    expect(copies.map((c) => c.x).sort((x, y) => x - y)).toEqual([96, 196])
  })

  it('copySelection + paste au curseur crée de nouveaux ids décalés', () => {
    const s = make()
    const a = s.addInstance('obj_a', 100, 100)
    const b = s.addInstance('obj_b', 200, 100)
    s.selectMany([a.id, b.id])
    s.copySelection()
    expect(s.hasClipboard).toBe(true)
    s.paste(500, 300) // ref = min(x,y) = (100,100) → offset (+400,+200)
    expect(s.instances.length).toBe(4)
    const pasted = s.instances.filter((i) => s.selectedIdSet().includes(i.id))
    expect(pasted.length).toBe(2)
    expect(pasted.map((p) => p.id)).not.toContain(a.id)
    expect(pasted.map((p) => p.x).sort((x, y) => x - y)).toEqual([500, 600])
    expect(pasted.every((p) => p.y === 300)).toBe(true)
  })

  it('paste peut être répété (le presse-papier n\'est pas consommé)', () => {
    const s = make()
    const a = s.addInstance('obj_a', 0, 0)
    s.select(a.id)
    s.copySelection()
    s.paste()
    s.paste()
    expect(s.instances.length).toBe(3) // original + 2 collages
  })

  it('un glisser en batch = UN seul pas d\'undo', () => {
    const s = make()
    const a = s.addInstance('obj_a', 0, 0)
    s.select(a.id)
    s.beginBatch()
    s.moveSelectionBy(10, 10)
    s.moveSelectionBy(10, 10)
    s.moveSelectionBy(10, 10)
    s.endBatch()
    expect(s.instances.find((i) => i.id === a.id)?.x).toBe(30)
    s.undo() // un seul undo doit revenir à l'origine (pas 3)
    expect(s.instances.find((i) => i.id === a.id)?.x).toBe(0)
  })
})

describe('EditorState — import du niveau généré', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it.each([
    'terrassement',
    'fondations',
    'reseaux_enterres',
    'gros_oeuvre',
    'echafaudages',
    'charpente_toiture',
    'second_oeuvre',
    'finitions',
    'livraison_audit'
  ])('%s refuse le bootstrap généré sans modifier le brouillon ni son stockage', (stage) => {
    const state = new EditorState(stage)
    state.setSpawn(123, -45)
    const beforeLayout = state.exportJson()
    const beforeStorage = localStorage.getItem(`stageComposer:${stage}`)

    expect(state.importGenerated()).toEqual({
      ok: false,
      error: 'Stage manuel : utiliser Charger un fichier.'
    })
    expect(state.exportJson()).toBe(beforeLayout)
    expect(localStorage.getItem(`stageComposer:${stage}`)).toBe(beforeStorage)
  })
})

describe('EditorState — échelle uniforme (redimensionnement sans déformation)', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  const make = (): EditorState => new EditorState('terrain_vierge')

  it('addInstance donne une échelle 1 par défaut', () => {
    const a = make().addInstance('obj_fence_panel', 0, 0)
    expect(a.scale).toBe(1)
  })

  it('setSelectedScale borne l\'échelle à [0.25, 5]', () => {
    const s = make()
    s.addInstance('obj_fence_panel', 0, 0)
    s.setSelectedScale(3)
    expect(s.selectedInstance()?.scale).toBe(3)
    s.setSelectedScale(99)
    expect(s.selectedInstance()?.scale).toBe(5)
    s.setSelectedScale(0.01)
    expect(s.selectedInstance()?.scale).toBe(0.25)
  })

  it('nudgeSelectedScale ajoute un pas additif et borne', () => {
    const s = make()
    s.addInstance('obj_fence_panel', 0, 0)
    s.nudgeSelectedScale(0.5)
    expect(s.selectedInstance()?.scale).toBeCloseTo(1.5)
    s.setSelectedScale(4.9)
    s.nudgeSelectedScale(0.5)
    expect(s.selectedInstance()?.scale).toBe(5)
  })

  it('une instance verrouillée n\'est pas redimensionnée', () => {
    const s = make()
    s.addInstance('obj_fence_panel', 0, 0)
    s.toggleLockSelected()
    s.setSelectedScale(3)
    expect(s.selectedInstance()?.scale).toBe(1)
  })

  it('exportGameJson cuit l\'échelle dans les éléments (× inst.scale) et remet inst.scale à 1', () => {
    const s = make()
    s.addInstance('obj_fence_panel', 0, 0)
    s.setSelectedScale(2)
    const out = JSON.parse(s.exportGameJson()) as {
      instances: Array<{ scale?: number; elements?: Array<{ scale: number }> }>
    }
    const inst = out.instances[0]
    expect(inst?.elements?.[0]?.scale).toBeCloseTo(2)
    expect(inst?.scale).toBe(1)
  })
})
