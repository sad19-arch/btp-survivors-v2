/**
 * T4 — Champ de flux (flow field) BFS pour le pathfinding ennemi.
 *
 * Principe : un BFS partagé depuis la cellule du joueur (leader) construit,
 * pour chaque cellule de la fenêtre, une direction normalisée qui pointe vers
 * le joueur le long du plus court chemin sans obstacle. Tous les ennemis
 * échantillonnent ce champ : coût quasi nul (partagé + throttlé).
 *
 * Règles :
 * - src/core PUR : zéro Phaser/DOM/Math.random/Date.now/any.
 * - BFS déterministe : file FIFO, ordre des voisins FIXE (N,S,E,O,NE,NO,SE,SO).
 * - Zéro RNG (le BFS est entièrement déterministe).
 * - Construit ET utilisé UNIQUEMENT si obstacles.length > 0.
 *   Si pas d'obstacles (stage 01) → le champ n'est jamais créé → enemyAi reste
 *   byte-identique → sim:check diff 0 garanti.
 */

import type { Obstacle } from '@core/siteLayout'
import { closestPointOnSegment } from './obstacleCollision'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes (exportées pour les tests)
// ─────────────────────────────────────────────────────────────────────────────

/** Taille d'une cellule de la grille de flux (px). */
export const CELL_FLOW = 128

/** Demi-côté de la fenêtre carrée centrée sur le joueur (px). */
export const HALF_FLOW = 2048

// ─────────────────────────────────────────────────────────────────────────────
// Interface publique
// ─────────────────────────────────────────────────────────────────────────────

export interface FlowField {
  /** Coin haut-gauche de la fenêtre (monde). */
  originX: number
  originY: number
  /** Taille d'une cellule (px). */
  cell: number
  /** Nombre de colonnes. */
  cols: number
  /** Nombre de lignes. */
  rows: number
  /** Direction X normalisée vers le joueur par cellule (0 si inatteignable). */
  dirX: Float64Array
  /** Direction Y normalisée vers le joueur par cellule (0 si inatteignable). */
  dirY: Float64Array
}

// ─────────────────────────────────────────────────────────────────────────────
// Ordre fixe des voisins 8-connexes : N, S, E, O, NE, NO, SE, SO
// Immuable → déterminisme garanti.
// ─────────────────────────────────────────────────────────────────────────────

const NEIGHBOR_DR: readonly number[] = [-1,  1,  0,  0, -1, -1,  1,  1]
const NEIGHBOR_DC: readonly number[] = [ 0,  0,  1, -1,  1, -1,  1, -1]

// ─────────────────────────────────────────────────────────────────────────────
// Passabilité
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne vrai si le centre de cellule (cx, cy) est bloqué par l'obstacle.
 * Les ennemis sont bloqués par `both` ET `enemies`.
 * Marge de sécurité : `cell / 2`.
 */
function isCellBlockedByObstacle(
  cx: number,
  cy: number,
  obs: Obstacle,
  halfCell: number
): boolean {
  if (obs.kind === 'circle') {
    const r = obs.r ?? 0
    const dx = cx - obs.x
    const dy = cy - obs.y
    const d = Math.sqrt(dx * dx + dy * dy)
    return d < r + halfCell
  } else {
    // segment
    const ax = obs.x
    const ay = obs.y
    const bx = obs.x2 ?? obs.x
    const by = obs.y2 ?? obs.y
    const thickness = obs.thickness ?? 0
    const closest = closestPointOnSegment(cx, cy, ax, ay, bx, by)
    const dx = cx - closest.x
    const dy = cy - closest.y
    const d = Math.sqrt(dx * dx + dy * dy)
    return d < thickness / 2 + halfCell
  }
}

/**
 * Construit le tableau de passabilité des cellules.
 * 1 = cellule passable (les ennemis peuvent y passer), 0 = bloquée.
 */
function buildPassability(
  originX: number,
  originY: number,
  cell: number,
  cols: number,
  rows: number,
  obstacles: readonly Obstacle[]
): Uint8Array {
  const halfCell = cell / 2
  const passable = new Uint8Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = originX + (col + 0.5) * cell
      const cy = originY + (row + 0.5) * cell
      let blocked = false
      for (const obs of obstacles) {
        // Les ennemis sont bloqués par 'both' ET 'enemies'
        if (isCellBlockedByObstacle(cx, cy, obs, halfCell)) {
          blocked = true
          break
        }
      }
      passable[row * cols + col] = blocked ? 0 : 1
    }
  }
  return passable
}

// ─────────────────────────────────────────────────────────────────────────────
// BFS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construit le champ de flux par BFS depuis la cellule du joueur.
 *
 * @param px        - Position X du joueur (monde).
 * @param py        - Position Y du joueur (monde).
 * @param obstacles - Obstacles statiques du site.
 * @param cell      - Taille d'une cellule (px). Suggestion : CELL_FLOW = 128.
 * @param half      - Demi-côté de la fenêtre (px). Suggestion : HALF_FLOW = 2048.
 */
export function buildFlowField(
  px: number,
  py: number,
  obstacles: readonly Obstacle[],
  cell: number,
  half: number
): FlowField {
  const cols = Math.round((2 * half) / cell)
  const rows = cols
  const originX = px - half
  const originY = py - half

  const dirX = new Float64Array(cols * rows)
  const dirY = new Float64Array(cols * rows)

  // Passabilité
  const passable = buildPassability(originX, originY, cell, cols, rows, obstacles)

  // Cellule du joueur
  const playerCol = Math.floor((px - originX) / cell)
  const playerRow = Math.floor((py - originY) / cell)

  // Vérifie que la cellule du joueur est dans les bornes
  if (
    playerCol >= 0 && playerCol < cols &&
    playerRow >= 0 && playerRow < rows
  ) {
    const playerIdx = playerRow * cols + playerCol

    // Tableau parent : indice de la cellule parent (celle d'où on vient dans le BFS).
    // -1 = non visité, -2 = source (cellule du joueur).
    const parent = new Int32Array(cols * rows).fill(-1)
    parent[playerIdx] = -2 // source

    // File FIFO (tableau simple — taille max = nombre de cellules)
    const queue = new Int32Array(cols * rows)
    let head = 0
    let tail = 0
    queue[tail++] = playerIdx

    while (head < tail) {
      // head < tail garantit qu'il y a un élément à lire
      const currentIdx: number = queue[head] as number
      head++
      const curRow = Math.floor(currentIdx / cols)
      const curCol = currentIdx - curRow * cols

      for (let k = 0; k < 8; k++) {
        const dr: number = NEIGHBOR_DR[k] as number
        const dc: number = NEIGHBOR_DC[k] as number
        const nr = curRow + dr
        const nc = curCol + dc
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
          continue
        }
        const nIdx = nr * cols + nc
        if ((parent[nIdx] as number) !== -1) {
          continue // déjà visité
        }
        if ((passable[nIdx] as number) === 0) {
          continue // bloqué
        }
        parent[nIdx] = currentIdx
        queue[tail++] = nIdx
      }
    }

    // Calcul des directions : dir(cellule) = normalize(centre_parent - centre_cellule)
    // = pointe vers le joueur le long du chemin BFS.
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col
        const p: number = parent[idx] as number
        if (p === -2) {
          // Cellule source (joueur) : déjà arrivé → (0, 0)
          dirX[idx] = 0
          dirY[idx] = 0
        } else if (p === -1) {
          // Non atteint (muré ou hors BFS) → (0, 0)
          dirX[idx] = 0
          dirY[idx] = 0
        } else {
          // Direction = centre_parent - centre_cellule, normalisée
          const pRow = Math.floor(p / cols)
          const pCol = p - pRow * cols
          const dx = (pCol - col) * cell
          const dy = (pRow - row) * cell
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len === 0) {
            dirX[idx] = 0
            dirY[idx] = 0
          } else {
            dirX[idx] = dx / len
            dirY[idx] = dy / len
          }
        }
      }
    }
  }
  // Si le joueur est hors fenêtre → tout reste à (0,0)

  return { originX, originY, cell, cols, rows, dirX, dirY }
}

// ─────────────────────────────────────────────────────────────────────────────
// Échantillonnage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne la direction de flux en (x, y) (monde).
 * Retourne {fx: 0, fy: 0} si hors fenêtre ou cellule inatteignable.
 */
export function sampleFlow(f: FlowField, x: number, y: number): { fx: number; fy: number } {
  const col = Math.floor((x - f.originX) / f.cell)
  const row = Math.floor((y - f.originY) / f.cell)
  if (col < 0 || col >= f.cols || row < 0 || row >= f.rows) {
    return { fx: 0, fy: 0 }
  }
  const idx = row * f.cols + col
  const fx: number = f.dirX[idx] as number
  const fy: number = f.dirY[idx] as number
  return { fx, fy }
}
