/**
 * Modèle PUR du remplissage « collage » de l'écran titre — aucune dépendance DOM
 * ni Phaser, RNG injectée (`() => number`, 0..1) pour un test déterministe. Le
 * contrôleur DOM (`titleFill.ts`) branche `Math.random` en prod (rendu-only, donc
 * autorisé hors `src/core`/`src/content`).
 *
 * Effet visé (réf. poster Street Fighter fourni par l'utilisateur) : une
 * ACCUMULATION dense qui remplit TOUT l'écran, assets qui se CHEVAUCHENT, aucun
 * fond visible à la fin. Pas de vraie physique — une grille d'occupation : chaque
 * asset vise la zone la moins couverte (bouche-trou), se superpose librement, et
 * on continue jusqu'à saturation (chaque zone couverte plusieurs fois).
 */

export type Rng = () => number

/** Où poser un item : coin haut-gauche de la cible (l'item tombe jusque-là). */
export interface Placement {
  /** x du coin gauche (px, borné à l'écran). */
  x: number
  /** y du coin haut au repos (px, depuis le haut). */
  restY: number
}

/**
 * Grille d'occupation couvrant `width`×`height`. Chaque cellule compte combien
 * d'items la recouvrent (chevauchements inclus). Sert à viser les trous puis à
 * saturer par-dessus pour l'effet collage.
 */
export class CollageField {
  private readonly cols: number
  private readonly rows: number
  private readonly cellW: number
  private readonly cellH: number
  private readonly cover: Uint16Array

  constructor(
    private readonly width: number,
    private readonly height: number,
    cell: number
  ) {
    const c = Math.max(8, cell)
    this.cols = Math.max(1, Math.round(width / c))
    this.rows = Math.max(1, Math.round(height / c))
    this.cellW = width / this.cols
    this.cellH = height / this.rows
    this.cover = new Uint16Array(this.cols * this.rows)
  }

  /** Nombre de cellules (diagnostic/test). */
  cellCount(): number {
    return this.cols * this.rows
  }

  private coverAt(cx: number, cy: number): number {
    return this.cover[cy * this.cols + cx] ?? 0
  }

  /**
   * Vise la zone la moins couverte (bouche-trou) : échantillonne quelques cellules
   * et garde la moins recouverte, avec jitter. Renvoie le coin haut-gauche cible
   * (borné à l'écran) et incrémente l'occupation des cellules chevauchées.
   */
  place(rng: Rng, itemW: number, itemH: number): Placement {
    let bestCx = Math.floor(rng() * this.cols)
    let bestCy = Math.floor(rng() * this.rows)
    let bestCover = this.coverAt(bestCx, bestCy)
    for (let s = 0; s < 4; s++) {
      const cx = Math.floor(rng() * this.cols)
      const cy = Math.floor(rng() * this.rows)
      const cov = this.coverAt(cx, cy)
      if (cov < bestCover) {
        bestCover = cov
        bestCx = cx
        bestCy = cy
      }
    }

    const centreX = (bestCx + 0.5) * this.cellW + (rng() - 0.5) * this.cellW * 1.4
    const centreY = (bestCy + 0.5) * this.cellH + (rng() - 0.5) * this.cellH * 1.4
    const x = clamp(centreX - itemW / 2, 0, Math.max(0, this.width - itemW))
    const restY = clamp(centreY - itemH / 2, 0, Math.max(0, this.height - itemH))

    // Marque l'empreinte de l'item sur la grille.
    const cx0 = clampInt(Math.floor(x / this.cellW), 0, this.cols - 1)
    const cx1 = clampInt(Math.floor((x + itemW - 1) / this.cellW), 0, this.cols - 1)
    const cy0 = clampInt(Math.floor(restY / this.cellH), 0, this.rows - 1)
    const cy1 = clampInt(Math.floor((restY + itemH - 1) / this.cellH), 0, this.rows - 1)
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const idx = cy * this.cols + cx
        this.cover[idx] = (this.cover[idx] ?? 0) + 1
      }
    }
    return { x, restY }
  }

  /** Fraction de cellules recouvertes AU MOINS `times` fois (0..1). */
  fillFraction(times: number): number {
    let n = 0
    for (let i = 0; i < this.cover.length; i++) {
      if ((this.cover[i] ?? 0) >= times) {
        n++
      }
    }
    return n / this.cover.length
  }

  /** Taux de couverture simple (au moins une fois), 0..1. */
  coverage(): number {
    return this.fillFraction(1)
  }

  /**
   * Vrai quand le collage est saturé : ~toutes les zones couvertes au moins
   * `times` fois (chevauchement dense, plus de fond visible).
   */
  isFull(times: number): boolean {
    return this.fillFraction(times) >= 0.97
  }

  /** Remet la grille à vide (nouvelle boucle de remplissage). */
  reset(): void {
    this.cover.fill(0)
  }
}

/**
 * Délai (ms) avant le prochain spawn pour viser un remplissage complet en
 * ~`targetFillMs`, réparti sur `capacity` items, avec un jitter ×[0.5, 1.5] pour
 * casser la régularité. Toujours ≥ 1 ms.
 */
export function nextSpawnDelayMs(
  rng: Rng,
  targetFillMs: number,
  capacity: number
): number {
  const base = targetFillMs / Math.max(1, capacity)
  return Math.max(1, Math.round(base * (0.5 + rng())))
}

/** Élément tirable : `weight` optionnel (défaut 1) pondère la fréquence. */
export interface Weighted {
  weight?: number
}

/** Tirage aléatoire pondéré dans un pool non vide. */
export function pickWeighted<T extends Weighted>(rng: Rng, pool: readonly T[]): T {
  let total = 0
  for (const item of pool) {
    total += item.weight ?? 1
  }
  let r = rng() * total
  for (const item of pool) {
    r -= item.weight ?? 1
    if (r < 0) {
      return item
    }
  }
  const last = pool[pool.length - 1]
  if (last === undefined) {
    throw new Error('pickWeighted : pool vide')
  }
  return last
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
