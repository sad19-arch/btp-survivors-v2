import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@/editor/EditorState'

/**
 * EditorState (pur) — multi-sélection, presse-papier et batch d'undo.
 * L'état persiste en localStorage : on le vide entre chaque test.
 */
describe('EditorState — multi-sélection / copier-coller / batch', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const make = (): EditorState => new EditorState('terrain_vierge')

  it('addInstance sélectionne uniquement la nouvelle instance', () => {
    const s = make()
    const a = s.addInstance('obj_a', 0, 0)
    expect(s.selectionCount).toBe(1)
    expect(s.selectedIdSet()).toEqual([a.id])
    expect(s.selected).toBe(a.id)
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
