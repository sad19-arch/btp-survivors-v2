import type { World } from '../world'

/**
 * Ramène une valeur dans l'intervalle `[min, max]`. Fonction pure.
 */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

/** Dimensions de l'arène (en px). */
export interface WorldBounds {
  width: number
  height: number
}

/**
 * Système de bornage : maintient chaque joueur à l'intérieur du monde
 * `[0,width]×[0,height]`. Empêche le joueur de sortir du cadre (le sol et la
 * caméra sont bornés au monde ; hors-monde, le joueur disparaît hors-champ).
 *
 * Fonction pure sur le World (aucun aléa, aucun temps réel) → déterministe et
 * testable sans navigateur. Itère les entités porteuses d'un composant `player`
 * → prêt-N-joueurs sans player1/player2 codé en dur.
 *
 * Les ennemis ne sont **pas** bornés : ils apparaissent hors-champ (anneau de
 * spawn autour du centroïde, par nature hors du monde) puis convergent vers les
 * joueurs — ils ne s'échappent jamais. Les borner casserait l'apparition
 * hors-champ.
 */
export function worldBoundsSystem(world: World, bounds: WorldBounds): void {
  for (const e of world.query('player', 'position')) {
    const pos = world.get(e, 'position')
    if (pos === undefined) {
      continue
    }
    pos.x = clamp(pos.x, 0, bounds.width)
    pos.y = clamp(pos.y, 0, bounds.height)
  }
}
