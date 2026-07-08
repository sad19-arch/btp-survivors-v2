/**
 * Fonctions PURES de comportement des ouvriers navetteurs.
 *
 * Aucun import Phaser/DOM, aucun Math.random, aucun Date.now.
 * Tout le temps est passé en argument → testable en Vitest sans environnement.
 */

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
