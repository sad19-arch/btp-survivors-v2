/**
 * Échelle d'explosion à la mort d'un ennemi selon le temps écoulé. Monte de ×1
 * (début) à un plafond en fin de partie (fin ~20 min). Monotone non-décroissante,
 * bornée. Pure et déterministe (elapsedMs en argument).
 *
 * Utilisé uniquement côté rendu (`src/render`) — jamais dans `src/core`.
 */
export function boomScale(
  elapsedMs: number,
  opts?: { maxScale?: number; fullAtMs?: number }
): number {
  const fullAt = opts?.fullAtMs ?? 1_200_000
  const max = opts?.maxScale ?? 1.8
  const p = Math.max(0, Math.min(elapsedMs / fullAt, 1))
  return 1 + p * (max - 1)
}
