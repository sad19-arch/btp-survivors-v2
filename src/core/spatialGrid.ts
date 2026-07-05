/** Grille spatiale uniforme (hachage par cellule) — index de candidats pour requêtes de rayon.
 *  Pure, déterministe. Reconstruite chaque pas ; `queryCircle` peut renvoyer des faux positifs
 *  (l'appelant filtre par distance exacte), jamais de faux négatif. */
export class SpatialGrid {
  private readonly cellSize: number
  private readonly cells = new Map<number, number[]>()

  constructor(cellSize: number) {
    this.cellSize = cellSize > 0 ? cellSize : 1
  }

  clear(): void {
    this.cells.clear()
  }

  private key(cx: number, cy: number): number {
    // Combinaison stable de deux entiers de cellule (offset pour gérer les négatifs).
    return (cx + 100000) * 1000000 + (cy + 100000)
  }

  insert(id: number, x: number, y: number): void {
    const cx = Math.floor(x / this.cellSize)
    const cy = Math.floor(y / this.cellSize)
    const k = this.key(cx, cy)
    const bucket = this.cells.get(k)
    if (bucket === undefined) {
      this.cells.set(k, [id])
    } else {
      bucket.push(id)
    }
  }

  queryCircle(cx: number, cy: number, radius: number, out: number[]): void {
    out.length = 0
    const r = radius < 0 ? 0 : radius
    const minCx = Math.floor((cx - r) / this.cellSize)
    const maxCx = Math.floor((cx + r) / this.cellSize)
    const minCy = Math.floor((cy - r) / this.cellSize)
    const maxCy = Math.floor((cy + r) / this.cellSize)
    for (let gx = minCx; gx <= maxCx; gx++) {
      for (let gy = minCy; gy <= maxCy; gy++) {
        const bucket = this.cells.get(this.key(gx, gy))
        if (bucket !== undefined) {
          for (const id of bucket) {
            out.push(id)
          }
        }
      }
    }
  }
}
