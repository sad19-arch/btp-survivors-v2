/**
 * Fonctions PURES de comportement des ouvriers navetteurs.
 *
 * Aucun import Phaser/DOM, aucun Math.random, aucun Date.now.
 * Tout le temps est passé en argument → testable en Vitest sans environnement.
 */

import type { StageLayout } from '@content/stageLayout'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes exportées (testables)
// ─────────────────────────────────────────────────────────────────────────────

/** Rayon d'approche d'ennemi déclenchant la panique (px). */
export const PANIC_R = 180

/** Distance à partir de laquelle on considère que le worker est « à l'extrémité » (px). */
export const AT_END_THRESHOLD = 24

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Résultat de la navette : position, leg en cours, proximité d'une extrémité. */
export interface CommuteResult {
  x: number
  y: number
  /** 'ab' = trajet A→B (aller), 'ba' = retour B→A. */
  leg: 'ab' | 'ba'
  /** true si l'ouvrier est à moins de AT_END_THRESHOLD px d'une extrémité. */
  atEnd: boolean
}

/** Résultat de la décision de panique. */
export interface PanicResult {
  flee: boolean
  /** Direction de fuite normalisée (x). Zéro si flee=false. */
  fx: number
  /** Direction de fuite normalisée (y). Zéro si flee=false. */
  fy: number
}

// ─────────────────────────────────────────────────────────────────────────────
// commutePos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Position sur la navette A↔B à l'instant tMs (aller-retour continu).
 *
 * Principe :
 *   - D = distance euclidienne A→B.
 *   - Période totale T = 2D / speedPxPerSec secondes.
 *   - phase = (tMs / 1000 * speedPxPerSec) modulo 2D.
 *   - Si phase < D : leg 'ab', interpolation A→B sur D.
 *   - Sinon       : leg 'ba', interpolation B→A sur D.
 *   - atEnd = true si le worker est à moins de AT_END_THRESHOLD px d'une extrémité.
 *
 * @param ax              Coordonnée x du point A.
 * @param ay              Coordonnée y du point A.
 * @param bx              Coordonnée x du point B.
 * @param by              Coordonnée y du point B.
 * @param tMs             Temps courant en millisecondes.
 * @param speedPxPerSec   Vitesse de déplacement en px/s.
 */
export function commutePos(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tMs: number,
  speedPxPerSec: number
): CommuteResult {
  const dx = bx - ax
  const dy = by - ay
  const d = Math.sqrt(dx * dx + dy * dy)

  // Cas dégénéré : A et B confondus → le worker reste immobile en A.
  if (d < 0.001) {
    return { x: ax, y: ay, leg: 'ab', atEnd: true }
  }

  const tSec = tMs / 1000
  const traveled = tSec * speedPxPerSec
  // Phase dans le cycle aller-retour (0..2D).
  const phase = traveled % (2 * d)

  let leg: 'ab' | 'ba'
  let t: number // interpolation 0..1 dans le leg courant

  if (phase < d) {
    leg = 'ab'
    t = phase / d
  } else {
    leg = 'ba'
    t = (phase - d) / d
  }

  let x: number
  let y: number
  if (leg === 'ab') {
    x = ax + dx * t
    y = ay + dy * t
  } else {
    // Retour : de B vers A
    x = bx - dx * t
    y = by - dy * t
  }

  // atEnd : le worker est proche d'une extrémité (A ou B).
  const distToA = Math.sqrt((x - ax) * (x - ax) + (y - ay) * (y - ay))
  const distToB = Math.sqrt((x - bx) * (x - bx) + (y - by) * (y - by))
  const atEnd = distToA < AT_END_THRESHOLD || distToB < AT_END_THRESHOLD

  return { x, y, leg, atEnd }
}

// ─────────────────────────────────────────────────────────────────────────────
// pathFollow
// ─────────────────────────────────────────────────────────────────────────────

/** Point 2D minimal (compatible avec {x,y}). */
export interface PathPoint {
  x: number
  y: number
}

/** Résultat du suivi de polyligne. */
export interface PathResult {
  x: number
  y: number
  /** Index du segment courant. */
  seg: number
  /** Direction de déplacement normalisée (pour orienter le sprite / flipX). */
  dirX: number
  dirY: number
  atEnd: boolean
  /**
   * false = marcheur CACHÉ (sens unique, entre la sortie et la réapparition).
   * Sans ce champ, un camion en sens unique se téléporterait À VUE du bout au
   * départ — l'artefact visuel que le sens unique est censé éviter.
   */
  visible: boolean
}

/** Réglages de parcours. Absent = aller-retour continu (comportement historique). */
export interface PathOpts {
  /**
   * Aller-retour : arrêt VISIBLE à chaque extrémité (livraison, chargement).
   * Sens unique : temps INVISIBLE entre la sortie et la réapparition au départ
   * (= espacement du flux). Deux sens distincts, assumés : dans un cas le
   * marcheur attend, dans l'autre il est parti.
   */
  pauseMs?: number
  /** true = A→B puis disparaît et réapparaît en A (flux). false = aller-retour. */
  oneWay?: boolean
}

/**
 * `atEnd` = PROXIMITÉ d'une extrémité de la polyligne (0 ou `total`), à partir
 * de la distance parcourue depuis le début.
 *
 * Sémantique historique (commutePos, et l'ancien pathFollow avant 06415cf) :
 * vrai si on est à moins de AT_END_THRESHOLD px de A OU de B, que ce soit à
 * l'aller, au retour, ou à l'arrêt. Ce n'est PAS une phase de cycle (pause vs
 * marche) — un marcheur en pause à une extrémité y est, un marcheur à 10 px du
 * bout aussi. Piège corrigé : mettre `atEnd` en dur selon la branche (pause ou
 * non) désynchronise le champ de la position réelle dès que pauseMs=0.
 */
function atEndFromDist(dist: number, total: number): boolean {
  return dist < AT_END_THRESHOLD || total - dist < AT_END_THRESHOLD
}

/** Position à `dist` px du début de la polyligne (0..total). */
function pointAtDistance(
  points: ReadonlyArray<PathPoint>,
  segLen: ReadonlyArray<number>,
  dist: number
): { x: number; y: number; seg: number; dirX: number; dirY: number } {
  let d = dist
  for (let i = 0; i < segLen.length; i++) {
    const l = segLen[i] as number
    const a = points[i] as PathPoint
    const b = points[i + 1] as PathPoint
    if (d <= l || i === segLen.length - 1) {
      const t = l < 0.001 ? 0 : Math.min(1, Math.max(0, d / l))
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      return {
        x: a.x + dx * t,
        y: a.y + dy * t,
        seg: i,
        dirX: dx / len,
        dirY: dy / len
      }
    }
    d -= l
  }
  const first = points[0] as PathPoint
  return { x: first.x, y: first.y, seg: 0, dirX: 1, dirY: 0 }
}

/**
 * Position sur une POLYLIGNE, en fonction PURE du temps.
 *
 * Le raisonnement est en TEMPS, pas en distance : une pause est du temps. Soit
 * `tTrajet = longueur / vitesse` et `pause = pauseMs / 1000` :
 *
 *  - aller-retour : cycle = 2·tTrajet + 2·pause
 *      aller → pause VISIBLE en B → retour → pause VISIBLE en A → …
 *  - sens unique  : cycle = tTrajet + pause
 *      aller → INVISIBLE pendant `pause` → réapparaît en A
 *
 * Cas dégénérés : 0 point → origine ; 1 point, longueur nulle, ou vitesse ≤ 0
 * → immobile au départ (jamais de division par zéro, jamais de NaN).
 */
export function pathFollow(
  points: ReadonlyArray<PathPoint>,
  tMs: number,
  speedPxPerSec: number,
  opts?: PathOpts
): PathResult {
  const n = points.length
  if (n === 0) {
    return { x: 0, y: 0, seg: 0, dirX: 1, dirY: 0, atEnd: true, visible: true }
  }
  const first = points[0] as PathPoint
  const still = (): PathResult => ({
    x: first.x, y: first.y, seg: 0, dirX: 1, dirY: 0, atEnd: true, visible: true
  })
  if (n === 1 || speedPxPerSec <= 0) {
    return still()
  }

  const segLen: number[] = []
  let total = 0
  for (let i = 0; i < n - 1; i++) {
    const a = points[i] as PathPoint
    const b = points[i + 1] as PathPoint
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    segLen.push(l)
    total += l
  }
  if (total < 0.001) {
    return still()
  }

  const tTravel = total / speedPxPerSec
  const pause = Math.max(0, opts?.pauseMs ?? 0) / 1000
  const t = Math.max(0, tMs) / 1000
  const oneWay = opts?.oneWay === true

  if (oneWay) {
    const cycle = tTravel + pause
    const u = cycle <= 0 ? 0 : t % cycle
    if (u >= tTravel) {
      // Sorti : caché jusqu'à la réapparition en A. Physiquement en B (dist=total)
      // → atEnd vrai par proximité, pas parce qu'on est « dans la fenêtre de pause ».
      const p = pointAtDistance(points, segLen, total)
      return { ...p, atEnd: atEndFromDist(total, total), visible: false }
    }
    const dist = u * speedPxPerSec
    const p = pointAtDistance(points, segLen, dist)
    return { ...p, atEnd: atEndFromDist(dist, total), visible: true }
  }

  const cycle = 2 * tTravel + 2 * pause
  const u = cycle <= 0 ? 0 : t % cycle
  if (u < tTravel) {
    const dist = u * speedPxPerSec
    const p = pointAtDistance(points, segLen, dist)
    return { ...p, atEnd: atEndFromDist(dist, total), visible: true }
  }
  if (u < tTravel + pause) {
    // Arrêt visible en B, face au sens d'arrivée. dist=total → atEnd vrai par proximité.
    const p = pointAtDistance(points, segLen, total)
    return { ...p, atEnd: atEndFromDist(total, total), visible: true }
  }
  if (u < 2 * tTravel + pause) {
    const back = u - (tTravel + pause)
    const dist = total - back * speedPxPerSec
    const p = pointAtDistance(points, segLen, dist)
    return { ...p, dirX: -p.dirX, dirY: -p.dirY, atEnd: atEndFromDist(dist, total), visible: true }
  }
  // Arrêt visible en A, face au sens d'arrivée (le retour). dist=0 → atEnd vrai par proximité.
  const p = pointAtDistance(points, segLen, 0)
  return { ...p, dirX: -p.dirX, dirY: -p.dirY, atEnd: atEndFromDist(0, total), visible: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// loadVisible
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge visible : le worker porte quelque chose à l'aller (A→B), mains vides au retour.
 * Sémantique : aller = évacuer les déblais, retour = revenir chercher.
 */
export function loadVisible(leg: 'ab' | 'ba'): boolean {
  return leg === 'ab'
}

// ─────────────────────────────────────────────────────────────────────────────
// panicDecision
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Décision de panique : si un ennemi est dans PANIC_R px, le worker fuit à l'opposé.
 *
 * @param wx        Position x du worker.
 * @param wy        Position y du worker.
 * @param ex        Position x de l'ennemi le plus proche (null = aucun ennemi).
 * @param ey        Position y de l'ennemi le plus proche (null = aucun ennemi).
 * @param panicR    Rayon de panique (px).
 */
export function panicDecision(
  wx: number,
  wy: number,
  ex: number | null,
  ey: number | null,
  panicR: number
): PanicResult {
  if (ex === null || ey === null) {
    return { flee: false, fx: 0, fy: 0 }
  }
  const dx = wx - ex
  const dy = wy - ey
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist >= panicR) {
    return { flee: false, fx: 0, fy: 0 }
  }
  if (dist < 0.001) {
    // Coincident : fuite vers le haut par convention
    return { flee: true, fx: 0, fy: -1 }
  }
  return { flee: true, fx: dx / dist, fy: dy / dist }
}

/**
 * Vitesse de FUITE d'un ouvrier mobile face aux ennemis (pur, cosmétique).
 * Si l'ennemi le plus proche est dans `fleeRadius`, renvoie une vitesse de norme
 * `speed` dirigée à l'OPPOSÉ de cet ennemi ; sinon `{0,0}`. Dist 0 → immobile
 * (évite NaN). Aucun impact gameplay/collision : le rendu observe `state.enemies`.
 */
export function fleeVelocity(
  pos: { x: number; y: number },
  enemies: ReadonlyArray<{ x: number; y: number }>,
  fleeRadius: number,
  speed: number
): { vx: number; vy: number } {
  let nx = 0
  let ny = 0
  let best = fleeRadius
  for (const e of enemies) {
    const dx = pos.x - e.x
    const dy = pos.y - e.y
    const d = Math.hypot(dx, dy)
    if (d < best && d > 0.0001) {
      best = d
      nx = dx / d
      ny = dy / d
    }
  }
  return { vx: nx * speed, vy: ny * speed }
}

/**
 * PNJ posés dans une compo → jobs de rendu (pur, testable, sans Phaser).
 * Convertit les coords composition (origine = centre monde) en monde.
 * `worker` → mobile (marche + fuite), sinon `trade` → fixe animé.
 */
export function planNpcJobs(
  layout: StageLayout,
  worldW: number,
  worldH: number
): Array<{ role: 'npc_trade' | 'npc_worker'; x: number; y: number; skin: string }> {
  const offX = worldW / 2
  const offY = worldH / 2
  return layout.npcs.map((n) => ({
    role: n.kind === 'worker' ? 'npc_worker' : 'npc_trade',
    x: offX + n.x,
    y: offY + n.y,
    skin: n.skin
  }))
}
