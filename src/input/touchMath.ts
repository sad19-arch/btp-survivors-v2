import type { Vec2 } from '@core/types'

/**
 * Math PUR du stick tactile virtuel (aucun DOM, aucun Phaser → testable Vitest).
 * Le repère est celui de l'écran/sim : `+x` droite, `+y` BAS (pousser le pouce vers
 * le bas déplace vers le bas, comme le clavier/manette).
 */

/** Magnitude après deadzone RE-SCALÉE : sous le seuil → 0 ; au-delà, [dz,1] ré-étiré en [0,1]. */
function deadzonedMagnitude(mag: number, deadzone: number): number {
  if (mag <= deadzone) {
    return 0
  }
  return Math.min(1, (mag - deadzone) / (1 - deadzone))
}

/**
 * Vecteur de déplacement d'un stick tactile, à partir du delta doigt→origine (px).
 * `radius` = rayon max du stick (px) ; `deadzone` ∈ [0,1[ = fraction du rayon sous
 * laquelle on renvoie 0. Résultat : Vec2 dans [-1,1] par axe, magnitude ≤ 1.
 */
export function stickVector(dx: number, dy: number, radius: number, deadzone: number): Vec2 {
  const m = Math.hypot(dx, dy)
  if (m === 0 || radius <= 0) {
    return { x: 0, y: 0 }
  }
  const norm = Math.min(1, m / radius)
  const mag = deadzonedMagnitude(norm, deadzone)
  if (mag === 0) {
    return { x: 0, y: 0 }
  }
  return { x: (dx / m) * mag, y: (dy / m) * mag }
}

/** Position du nub clampée au rayon (px), pour le rendu visuel du stick. DOM-free. */
export function clampToRadius(dx: number, dy: number, radius: number): Vec2 {
  const m = Math.hypot(dx, dy)
  if (m <= radius || m === 0) {
    return { x: dx, y: dy }
  }
  return { x: (dx / m) * radius, y: (dy / m) * radius }
}
