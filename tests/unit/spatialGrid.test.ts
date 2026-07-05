import { describe, it, expect } from 'vitest'
import { SpatialGrid } from '@core/spatialGrid'

describe('SpatialGrid', () => {
  it('queryCircle renvoie les ids proches (aucun faux négatif)', () => {
    const g = new SpatialGrid(64)
    g.insert(1, 0, 0)
    g.insert(2, 50, 0)
    g.insert(3, 500, 500)
    const out: number[] = []
    g.queryCircle(0, 0, 60, out)
    expect(out).toContain(1)
    expect(out).toContain(2) // dans le rayon
    expect(out).not.toContain(3) // très loin, cellule non chevauchée
  })
  it('clear vide la grille', () => {
    const g = new SpatialGrid(64)
    g.insert(1, 0, 0)
    g.clear()
    const out: number[] = []
    g.queryCircle(0, 0, 100, out)
    expect(out).toEqual([])
  })
  it('exhaustivité : tout id dont la distance <= rayon est renvoyé (échantillon)', () => {
    const g = new SpatialGrid(64)
    for (let i = 0; i < 200; i++) {
      g.insert(i, (i % 20) * 30, Math.floor(i / 20) * 30)
    }
    const out: number[] = []
    g.queryCircle(150, 150, 90, out)
    // vérifie qu'aucun point réellement dans le rayon n'est omis
    for (let i = 0; i < 200; i++) {
      const x = (i % 20) * 30, y = Math.floor(i / 20) * 30
      if ((x - 150) ** 2 + (y - 150) ** 2 <= 90 * 90) {
        expect(out).toContain(i)
      }
    }
  })
})
