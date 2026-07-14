/**
 * T3 — Résolution de collision obstacle → entité (push-out).
 *
 * Repousse joueurs et ennemis hors des obstacles statiques du site (siteLayout).
 * Appelé après le mouvement normal, puis une seconde fois après le recul physique.
 *
 * Règles :
 * - `blocks === 'both'`    → joueur ET ennemi repoussés.
 * - `blocks === 'enemies'` → ennemi uniquement repoussé (le joueur passe librement).
 * - Ordre d'itération : tableau `obstacles` dans l'ordre (stable → déterministe).
 * - Zéro `Math.random`, zéro `Date.now`, zéro `any`. Pur src/core.
 */

import type { World } from '../world'
import type { Obstacle } from '../siteLayout'
import { HITBOX } from '@content/config'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers géométriques (purs, exportés pour les tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Point le plus proche sur un segment [a→b] du point p (projection clampée sur [0,1]).
 * Retourne les coordonnées absolues du point le plus proche.
 */
export function closestPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): { x: number; y: number } {
  const dxAB = bx - ax
  const dyAB = by - ay
  const len2 = dxAB * dxAB + dyAB * dyAB
  if (len2 === 0) {
    // Segment dégénéré (point) : le plus proche est l'extrémité.
    return { x: ax, y: ay }
  }
  const t = Math.min(1, Math.max(0, ((px - ax) * dxAB + (py - ay) * dyAB) / len2))
  return { x: ax + t * dxAB, y: ay + t * dyAB }
}

/**
 * Repousse l'entité (centre `pos`) à l'extérieur d'un obstacle `circle`.
 * - Si `d < R + obs.r` : repousse le long de (pos - centre_obstacle).
 * - Si `d === 0`        : repousse dans la direction +x (déterministe).
 * Retourne `true` si la position a été modifiée.
 */
function pushOutCircle(
  pos: { x: number; y: number },
  R: number,
  obs: Obstacle
): boolean {
  const ox = obs.x
  const oy = obs.y
  const r = obs.r ?? 0
  const minDist = R + r
  const dx = pos.x - ox
  const dy = pos.y - oy
  const d = Math.hypot(dx, dy)
  if (d >= minDist) {
    return false
  }
  if (d === 0) {
    // Dégénéré : repousse en +x.
    pos.x = ox + minDist
    return true
  }
  const scale = minDist / d
  pos.x = ox + dx * scale
  pos.y = oy + dy * scale
  return true
}

/**
 * Repousse l'entité (centre `pos`) à l'extérieur d'un obstacle `segment`.
 * Retourne `true` si la position a été modifiée.
 */
function pushOutSegment(
  pos: { x: number; y: number },
  R: number,
  obs: Obstacle
): boolean {
  const ax = obs.x
  const ay = obs.y
  const bx = obs.x2 ?? obs.x
  const by = obs.y2 ?? obs.y
  const thickness = obs.thickness ?? 0
  const minDist = R + thickness / 2

  const closest = closestPointOnSegment(pos.x, pos.y, ax, ay, bx, by)
  const dx = pos.x - closest.x
  const dy = pos.y - closest.y
  const d = Math.hypot(dx, dy)

  if (d >= minDist) {
    return false
  }
  if (d === 0) {
    // Dégénéré : repousse en +x.
    pos.x = closest.x + minDist
    return true
  }
  const scale = minDist / d
  pos.x = closest.x + dx * scale
  pos.y = closest.y + dy * scale
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonction principale
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Repousse joueurs et ennemis hors des obstacles (push-out, déterministe).
 *
 * Appelé après le mouvement des entités, puis après `knockbackSystem` pour empêcher
 * une impulsion de traverser le décor. Avec `obstacles` vide : no-op total.
 */
export function resolveObstacleCollisions(world: World, obstacles: readonly Obstacle[]): void {
  if (obstacles.length === 0) {
    return
  }

  // ── Joueurs : repoussés uniquement par `blocks === 'both'` ────────────────
  for (const e of world.query('player', 'position')) {
    const pos = world.get(e, 'position')
    if (pos === undefined) {
      continue
    }
    const R = HITBOX.player
    for (const obs of obstacles) {
      if (obs.blocks !== 'both') {
        continue
      }
      if (obs.kind === 'circle') {
        pushOutCircle(pos, R, obs)
      } else {
        pushOutSegment(pos, R, obs)
      }
    }
  }

  // ── Ennemis : repoussés par `blocks === 'both'` ET `blocks === 'enemies'` ─
  for (const e of world.query('enemy', 'position')) {
    const pos = world.get(e, 'position')
    if (pos === undefined) {
      continue
    }
    const R = HITBOX.enemy
    for (const obs of obstacles) {
      if (obs.kind === 'circle') {
        pushOutCircle(pos, R, obs)
      } else {
        pushOutSegment(pos, R, obs)
      }
    }
  }
}
