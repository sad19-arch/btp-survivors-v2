import { describe, it, expect } from 'vitest'
import { parseLayout } from '@/editor/StageLayoutSchema'
import { emptyLayout, type StageLayout } from '@content/stageLayout'

describe('parseLayout — npcs', () => {
  it('parse les PNJ (skin/kind/x/y), défaut kind=trade', () => {
    const json = JSON.stringify({ stage: 's', npcs: [
      { id: 'n1', skin: 'npc_stage01', kind: 'trade', x: 10, y: -20 },
      { id: 'n2', skin: 'npc_stage01_ouvrier_a', kind: 'worker', x: 0, y: 0 },
      { skin: 'npc_stage01' }
    ] })
    const l = parseLayout(json, 's').layout as StageLayout
    expect(l.npcs).toHaveLength(3)
    expect(l.npcs[0]).toEqual({ id: 'n1', skin: 'npc_stage01', kind: 'trade', x: 10, y: -20 })
    expect(l.npcs[1]?.kind).toBe('worker')
    expect(l.npcs[2]?.kind).toBe('trade') // défaut
  })
  it('un npc sans skin est ignoré', () => {
    const l = parseLayout('{"stage":"s","npcs":[{"kind":"worker"}]}', 's').layout as StageLayout
    expect(l.npcs).toEqual([])
  })
  it('layout sans npcs → []', () => {
    const l = parseLayout('{"stage":"s"}', 's').layout as StageLayout
    expect(l.npcs).toEqual([])
  })
  it('emptyLayout a un tableau npcs vide', () => {
    expect(emptyLayout('s').npcs).toEqual([])
  })
})
