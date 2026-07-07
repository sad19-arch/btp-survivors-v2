/**
 * T2 — Zonage du site (siteLayout, pur seede).
 *
 * Responsabilite : placer les clusters (definis en T1 dans src/content/clusters.ts)
 * sur le monde de facon coherente et deterministe, et produire la liste des obstacles
 * absolus pour le systeme de collision (T3).
 *
 * Regles :
 * - src/core pur : zero Phaser/DOM, zero Math.random/Date.now, zero `any`.
 * - RNG dedie et isole (seed ^ 0x51e0) — n'affecte PAS le flux RNG de la sim.
 * - Calcule UNE SEULE fois par partie (pas de RNG par pas de simulation).
 * - terrain_vierge → { clusters: [], obstacles: [] } (sim:check diff 0 garanti).
 *
 * Convention segments absolus :
 *   x, y = point de depart absolu dans le monde
 *   x2, y2 = coordonnees absolues du 2e point (PAS un delta)
 *   Derivation : cx + elem.dx + elem.shape.x2 pour x2
 */

import { Rng } from '@core/rng'
import { CLUSTERS, STAGE_CLUSTERS } from '@content/clusters'
import type { ClusterDef } from '@content/clusters'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes exportees (testables)
// ─────────────────────────────────────────────────────────────────────────────

/** Largeur de la bande sud reservee a la route (px). */
export const ROUTE_BAND = 700

/** Taille d'une cellule de la grille interieure (px). */
export const CELL = 2048

/** Distance minimale entre deux ancres de clusters (px) — anti-chevauchement. */
export const MIN_GAP = 520

/** Rayon de securite autour du spawn : aucun cluster collidable autorise. */
export const SPAWN_SAFE_R = 700

/** Constante XOR pour deriver le RNG siteLayout — isole des autres flux. */
const LAYOUT_XOR = 0x51e0

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces publiques
// ─────────────────────────────────────────────────────────────────────────────

export interface PlacedCluster {
  defId: string
  x: number
  y: number
}

/**
 * Obstacle absolu dans le monde.
 *
 * circle  => x, y = centre ; r = rayon.
 * segment => x, y = point de depart absolu ; x2, y2 = 2e point ABSOLU (pas delta).
 *
 * `blocks` appartient a { 'both', 'enemies' } — jamais 'none'.
 */
export interface Obstacle {
  kind: 'circle' | 'segment'
  x: number
  y: number
  x2?: number
  y2?: number
  r?: number
  thickness?: number
  blocks: 'both' | 'enemies'
}

export interface SiteLayout {
  clusters: PlacedCluster[]
  obstacles: Obstacle[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers prives
// ─────────────────────────────────────────────────────────────────────────────

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/**
 * Retourne true si l'ancre (cx, cy) est trop proche d'une ancre deja placee
 * (distance < MIN_GAP).
 */
function tooClose(cx: number, cy: number, placed: PlacedCluster[]): boolean {
  const minGap2 = MIN_GAP * MIN_GAP
  for (const p of placed) {
    if (dist2(cx, cy, p.x, p.y) < minGap2) {
      return true
    }
  }
  return false
}

/**
 * Retourne true si la def contient au moins un element collidable ET que l'ancre
 * est a moins de SPAWN_SAFE_R du spawn (centre monde).
 */
function violatesSpawnSafe(
  cx: number,
  cy: number,
  def: ClusterDef,
  spawnX: number,
  spawnY: number
): boolean {
  const hasCollidable = def.elements.some((el) => el.collide !== 'none')
  if (!hasCollidable) {
    return false
  }
  return dist2(cx, cy, spawnX, spawnY) < SPAWN_SAFE_R * SPAWN_SAFE_R
}

/**
 * Extrait les obstacles absolus d'un cluster place en (cx, cy).
 */
function extractObstacles(cx: number, cy: number, def: ClusterDef): Obstacle[] {
  const result: Obstacle[] = []
  for (const elem of def.elements) {
    if (elem.collide === 'none') {
      continue
    }
    const blocks = elem.collide // 'both' | 'enemies'
    const ax = cx + elem.dx
    const ay = cy + elem.dy

    // shape est toujours defini quand collide !== 'none' (invariant T1 verifie)
    const shape = elem.shape
    if (shape === undefined) {
      continue
    }

    if (shape.kind === 'circle') {
      result.push({ kind: 'circle', x: ax, y: ay, r: shape.r, blocks })
    } else {
      // segment : x2,y2 = coordonnees absolues du 2e point
      result.push({
        kind: 'segment',
        x: ax,
        y: ay,
        x2: ax + shape.x2,
        y2: ay + shape.y2,
        thickness: shape.thickness,
        blocks
      })
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonction principale
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construit le layout de site (placement des clusters + liste des obstacles absolus)
 * de facon DETERMINISTE : meme (seed, worldW, worldH, stageId) => meme SiteLayout.
 *
 * @param seed    - Seed de la partie (le RNG interne est derive : seed ^ LAYOUT_XOR).
 * @param worldW  - Largeur du monde (px).
 * @param worldH  - Hauteur du monde (px).
 * @param stageId - Identifiant de la phase de chantier (ex. 'terrassement').
 */
export function buildSiteLayout(
  seed: number,
  worldW: number,
  worldH: number,
  stageId: string
): SiteLayout {
  // Garde : terrain_vierge ou stage sans clusters => layout vide (sim:check diff 0)
  const stageEntries = STAGE_CLUSTERS[stageId]
  if (stageEntries === undefined || stageEntries.length === 0) {
    return { clusters: [], obstacles: [] }
  }

  // RNG ISOLE — derive du seed de la partie, n'affecte PAS le RNG de la sim.
  const rng = new Rng((seed ^ LAYOUT_XOR) >>> 0)

  const spawnX = worldW / 2
  const spawnY = worldH / 2

  // Regrouper les entries par role pour faciliter la selection
  const byRole = new Map<string, typeof stageEntries>()
  for (const entry of stageEntries) {
    const list = byRole.get(entry.role)
    if (list !== undefined) {
      list.push(entry)
    } else {
      byRole.set(entry.role, [entry])
    }
  }

  const placed: PlacedCluster[] = []
  const obstacles: Obstacle[] = []

  // ── 1. Route (bord sud) ───────────────────────────────────────────────────
  const routeEntries = byRole.get('route')
  if (routeEntries !== undefined && routeEntries.length > 0) {
    const routeY = worldH - ROUTE_BAND / 2
    const routeCount = routeEntries.length
    const step = worldW / (routeCount + 1)
    for (let i = 0; i < routeCount; i++) {
      const entry = routeEntries[i]
      if (entry === undefined) {
        continue
      }
      const def = CLUSTERS[entry.clusterId]
      if (def === undefined) {
        continue
      }

      const cx = step * (i + 1)
      const cy = routeY

      if (tooClose(cx, cy, placed)) {
        continue
      }

      placed.push({ defId: def.id, x: cx, y: cy })
      for (const obs of extractObstacles(cx, cy, def)) {
        obstacles.push(obs)
      }
    }
  }

  // ── 2. Grille interieure ──────────────────────────────────────────────────
  const interiorH = worldH - ROUTE_BAND
  const colsN = Math.ceil(worldW / CELL)
  const rowsN = Math.ceil(interiorH / CELL)

  for (let row = 0; row < rowsN; row++) {
    for (let col = 0; col < colsN; col++) {
      // Centre de la cellule
      const cellCX = (col + 0.5) * CELL
      const cellCY = (row + 0.5) * CELL

      // Distance a la route (plus grand = plus au nord)
      const d = interiorH - cellCY

      // Role selon distance a la route :
      //   proche route (d <= interiorH * 0.33) => plant / pause
      //   loin (d >= interiorH * 0.66) => excavation
      //   intermediaire => spoil
      let role: string
      if (d >= interiorH * 0.66) {
        role = 'excavation'
      } else if (d <= interiorH * 0.33) {
        role = rng.chance(0.5) ? 'plant' : 'pause'
      } else {
        role = 'spoil'
      }

      const roleEntries = byRole.get(role)
      if (roleEntries === undefined || roleEntries.length === 0) {
        continue
      }

      // Selection de l'entry (tire au sort si plusieurs)
      const entry =
        roleEntries.length === 1
          ? roleEntries[0]
          : roleEntries[rng.int(0, roleEntries.length - 1)]
      if (entry === undefined) {
        continue
      }

      const def = CLUSTERS[entry.clusterId]
      if (def === undefined) {
        continue
      }

      // Jitter dans la cellule (borne pour rester dans la cellule)
      const jitterRange = Math.max(0, CELL / 2 - def.footprintRadius)
      const cx = cellCX + rng.float(-jitterRange, jitterRange)
      const cy = cellCY + rng.float(-jitterRange, jitterRange)

      // Rejet : trop proche d'une autre ancre OU violation de la zone de spawn
      if (tooClose(cx, cy, placed)) {
        continue
      }
      if (violatesSpawnSafe(cx, cy, def, spawnX, spawnY)) {
        continue
      }

      placed.push({ defId: def.id, x: cx, y: cy })
      for (const obs of extractObstacles(cx, cy, def)) {
        obstacles.push(obs)
      }
    }
  }

  return { clusters: placed, obstacles }
}
