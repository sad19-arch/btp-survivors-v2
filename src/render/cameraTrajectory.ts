/**
 * Fonctions PURES de trajectoire caméra — aucun import Phaser, zéro Date/random.
 * Testables en Vitest sans navigateur.
 */

export type Ease = 'linear' | 'easeOut' | 'snap'

export interface CamPose {
  cx: number
  cy: number
  zoom: number
}

/**
 * Courbe d'easing normalisée : applyEase(0)===0, applyEase(1)===1.
 * Clamp automatique de t dans [0,1].
 */
export function applyEase(t: number, ease: Ease): number {
  const c = Math.min(1, Math.max(0, t))
  if (ease === 'snap') {
    return c > 0 ? 1 : 0
  }
  if (ease === 'easeOut') {
    return 1 - (1 - c) * (1 - c) // quadratique out (démarre vite, freine à l'arrivée)
  }
  return c // linear
}

/**
 * Interpole une pose caméra de `from` vers `to` selon `t` ∈ [0,1] et l'easing.
 * Déterministe : mêmes entrées → même sortie.
 */
export function lerpCam(from: CamPose, to: CamPose, t: number, ease: Ease): CamPose {
  const e = applyEase(t, ease)
  return {
    cx: from.cx + (to.cx - from.cx) * e,
    cy: from.cy + (to.cy - from.cy) * e,
    zoom: from.zoom + (to.zoom - from.zoom) * e,
  }
}
