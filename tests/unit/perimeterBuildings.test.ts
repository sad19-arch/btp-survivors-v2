import { describe, it, expect } from 'vitest'
import { perimeterBuildingsForChunk, DEFAULT_CHUNK_SIZE } from '@render/decorStreamer'

/**
 * Tests PURS de l'anneau d'immeubles de bordure (`perimeterBuildingsForChunk`).
 * Sans Phaser (le rendu réel est couvert par les e2e). Vérifie : culling
 * (chunks intérieurs vides), présence aux 4 bords, bornes, déterminisme,
 * pas de double-pose aux coins, gardes.
 */

const W = 10240
const H = 7680
const CS = DEFAULT_CHUNK_SIZE // 1024
const KEYS = 4
const SPACING = 240
const MARGIN = 130
const SEED = 12345

function place(cx: number, cy: number) {
  return perimeterBuildingsForChunk(cx, cy, CS, W, H, KEYS, SPACING, MARGIN, SEED)
}

describe('perimeterBuildingsForChunk', () => {
  it('un chunk intérieur (loin de tout bord) ne pose AUCUN immeuble (culling)', () => {
    expect(place(4, 3)).toEqual([]) // 4096..5120 × 3072..4096 : aucun bord
  })

  it('pose des immeubles sur les 4 bords (chunks de périphérie)', () => {
    // Coin haut-gauche : bord haut (y=margin) + bord gauche (x=margin).
    const topLeft = place(0, 0)
    expect(topLeft.length).toBeGreaterThan(0)
    // Coin bas-droit : bord bas + bord droit.
    const cxRight = Math.floor((W - MARGIN) / CS) // 9
    const cyBottom = Math.floor((H - MARGIN) / CS) // 7
    expect(place(cxRight, cyBottom).length).toBeGreaterThan(0)
  })

  it('un chunk du bord HAUT (hors coins) ne pose que sur y = margin', () => {
    const mid = place(4, 0) // colonne centrale, rangée du haut
    expect(mid.length).toBeGreaterThan(0)
    for (const b of mid) {
      expect(b.y).toBe(MARGIN)
    }
  })

  it('toutes les positions restent dans [margin, world-margin] et keyIndex ∈ [0,keyCount)', () => {
    for (const [cx, cy] of [[0, 0], [4, 0], [0, 3], [9, 7], [9, 4]] as const) {
      for (const b of place(cx, cy)) {
        expect(b.x).toBeGreaterThanOrEqual(MARGIN)
        expect(b.x).toBeLessThanOrEqual(W - MARGIN)
        expect(b.y).toBeGreaterThanOrEqual(MARGIN)
        expect(b.y).toBeLessThanOrEqual(H - MARGIN)
        expect(b.keyIndex).toBeGreaterThanOrEqual(0)
        expect(b.keyIndex).toBeLessThan(KEYS)
        expect(Number.isInteger(b.keyIndex)).toBe(true)
      }
    }
  })

  it('déterministe : mêmes entrées → même sortie (seed-stable)', () => {
    expect(place(0, 0)).toEqual(place(0, 0))
    expect(place(9, 7)).toEqual(place(9, 7))
  })

  it('aucune position dupliquée dans un chunk de coin (pas de double-pose)', () => {
    const seen = new Set<string>()
    for (const b of place(0, 0)) {
      const k = `${b.x},${b.y}`
      expect(seen.has(k)).toBe(false)
      seen.add(k)
    }
  })

  it('gardes : keyCount<=0 ou spacing<=0 → vide', () => {
    expect(perimeterBuildingsForChunk(0, 0, CS, W, H, 0, SPACING, MARGIN, SEED)).toEqual([])
    expect(perimeterBuildingsForChunk(0, 0, CS, W, H, KEYS, 0, MARGIN, SEED)).toEqual([])
  })

  it('les positions sont alignées sur la grille de pas `spacing`', () => {
    for (const b of place(4, 0)) {
      expect(b.x % SPACING).toBe(0) // bord haut → grille en X
    }
    for (const b of place(0, 4)) {
      expect(b.y % SPACING).toBe(0) // bord gauche → grille en Y
    }
  })
})
