import { describe, it, expect } from 'vitest'
import { mergeFrames, buildPlayerInputs } from '@input/players'
import type { FrameInput } from '@input/intents'

const EMPTY: FrameInput = { move: { x: 0, y: 0 }, pressed: [] }

describe('mergeFrames', () => {
  it('somme les composantes de move', () => {
    const a: FrameInput = { move: { x: 0.3, y: -0.2 }, pressed: [] }
    const b: FrameInput = { move: { x: 0.1, y: 0.1 }, pressed: [] }
    const merged = mergeFrames(a, b)
    expect(merged.move.x).toBeCloseTo(0.4)
    expect(merged.move.y).toBeCloseTo(-0.1)
  })

  it('clampe move à [-1, 1] sans laisser dépasser (0.8 + 0.8 = 1, pas 1.6)', () => {
    const a: FrameInput = { move: { x: 0.8, y: -0.8 }, pressed: [] }
    const b: FrameInput = { move: { x: 0.8, y: -0.8 }, pressed: [] }
    const merged = mergeFrames(a, b)
    expect(merged.move.x).toBe(1)
    expect(merged.move.y).toBe(-1)
  })

  it('fait l’union dédupliquée de pressed (pas de doublon)', () => {
    const a: FrameInput = { move: { x: 0, y: 0 }, pressed: ['down', 'confirm'] }
    const b: FrameInput = { move: { x: 0, y: 0 }, pressed: ['down'] }
    const merged = mergeFrames(a, b)
    expect(merged.pressed.filter((p) => p === 'down')).toHaveLength(1)
    expect(new Set(merged.pressed)).toEqual(new Set(['down', 'confirm']))
    expect(merged.pressed).toHaveLength(2)
  })

  it('ne mute pas les entrées', () => {
    const a: FrameInput = { move: { x: 0.1, y: 0.1 }, pressed: ['up'] }
    const b: FrameInput = { move: { x: 0.1, y: 0.1 }, pressed: ['up'] }
    const aCopy = { move: { ...a.move }, pressed: [...a.pressed] }
    const bCopy = { move: { ...b.move }, pressed: [...b.pressed] }
    mergeFrames(a, b)
    expect(a).toEqual(aCopy)
    expect(b).toEqual(bCopy)
  })
})

describe('buildPlayerInputs', () => {
  it('solo (playerCount=1) : map a exactement la clé 1 = fusion clavier + pads[0]', () => {
    const keyboard: FrameInput = { move: { x: 1, y: 0 }, pressed: ['down'] }
    const pads: FrameInput[] = [{ move: { x: 0, y: 0 }, pressed: ['down'] }]
    const map = buildPlayerInputs(keyboard, pads, 1)
    expect([...map.keys()]).toEqual([1])
    const frame = map.get(1)
    expect(frame?.move.x).toBe(1)
    expect(frame?.pressed).toEqual(['down'])
  })

  it('playerCount=0 : la clé 1 existe TOUJOURS (max(,1)) = kb⊕pad0 — nav menu au titre', () => {
    const keyboard: FrameInput = { move: { x: 0, y: 1 }, pressed: ['confirm'] }
    const pads: FrameInput[] = [{ move: { x: 0, y: 0 }, pressed: [] }]
    const map = buildPlayerInputs(keyboard, pads, 0)
    expect(map.size).toBe(1)
    expect(map.has(1)).toBe(true)
    expect(map.get(1)?.move.y).toBe(1)
    expect(map.get(1)?.pressed).toEqual(['confirm'])
  })

  it('coop4 (playerCount=4) : clés {1,2,3,4}, id1 = fusion, 2/3/4 = pads verbatim (moves distincts)', () => {
    const keyboard: FrameInput = { move: { x: 0, y: 0 }, pressed: [] }
    const pads: FrameInput[] = [
      { move: { x: 0.1, y: 0 }, pressed: [] },
      { move: { x: 0.2, y: 0 }, pressed: [] },
      { move: { x: 0.3, y: 0 }, pressed: [] },
      { move: { x: 0.4, y: 0 }, pressed: [] },
    ]
    const map = buildPlayerInputs(keyboard, pads, 4)
    expect([...map.keys()].sort()).toEqual([1, 2, 3, 4])
    expect(map.get(1)?.move.x).toBe(0.1)
    expect(map.get(2)?.move.x).toBe(0.2)
    expect(map.get(3)?.move.x).toBe(0.3)
    expect(map.get(4)?.move.x).toBe(0.4)
  })

  it('pad manquant (playerCount=3, pads a 2 entrées) : clé 3 = EMPTY, pas de throw', () => {
    const keyboard: FrameInput = { move: { x: 0, y: 0 }, pressed: [] }
    const pads: FrameInput[] = [
      { move: { x: 0.1, y: 0 }, pressed: [] },
      { move: { x: 0.2, y: 0 }, pressed: [] },
    ]
    expect(() => buildPlayerInputs(keyboard, pads, 3)).not.toThrow()
    const map = buildPlayerInputs(keyboard, pads, 3)
    expect(map.get(3)).toEqual(EMPTY)
  })

  it('retourne une Map fraîche à chaque appel (pas de partage d’état)', () => {
    const keyboard: FrameInput = { move: { x: 0, y: 0 }, pressed: [] }
    const pads: FrameInput[] = []
    const map1 = buildPlayerInputs(keyboard, pads, 1)
    const map2 = buildPlayerInputs(keyboard, pads, 1)
    expect(map1).not.toBe(map2)
  })
})
