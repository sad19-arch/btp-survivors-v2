/**
 * Utilitaire pur (aucun Math.random / Date.now) pour animer l'entrée des cartes d'upgrade.
 *
 * État d'entrée (reveal) d'une carte à l'instant `elapsedMs` après l'apparition
 * de l'écran, pour la carte d'index `index`. Stagger : chaque carte démarre
 * `index * staggerMs` plus tard. Fondu + glissement vers le haut. Déterministe.
 *
 * Retourne opacity ∈ [0, 1] et translateYpx ∈ [0, rise] (0 quand entré).
 */
export function cardEnterStyle(
  elapsedMs: number,
  index: number,
  opts?: { staggerMs?: number; enterMs?: number; risePx?: number }
): { opacity: number; translateYpx: number } {
  const staggerMs = opts?.staggerMs ?? 70
  const enterMs = opts?.enterMs ?? 180
  const risePx = opts?.risePx ?? 14

  if (elapsedMs < 0) {
    return { opacity: 0, translateYpx: risePx }
  }

  const t = elapsedMs - index * staggerMs
  if (t <= 0) {
    return { opacity: 0, translateYpx: risePx }
  }

  // Progression linéaire bornée [0, 1], lissée avec smoothstep (p² * (3 - 2p))
  const raw = Math.min(t / enterMs, 1)
  const p = raw * raw * (3 - 2 * raw)

  return {
    opacity: p,
    translateYpx: (1 - p) * risePx
  }
}
