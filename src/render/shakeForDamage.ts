/**
 * Décide d'une secousse caméra à partir de la variation de PV totaux du joueur
 * (somme des hp de tous les players) entre deux frames. Pure, déterministe.
 * Retourne null si pas de perte de PV (ou perte négligeable), sinon l'intensité
 * (fraction de viewport, style Phaser) et la durée (ms), bornées.
 */
export function shakeForDamage(
  prevTotalHp: number,
  curTotalHp: number,
  opts?: {
    perHpIntensity?: number
    maxIntensity?: number
    durationMs?: number
    minLoss?: number
  }
): { intensity: number; durationMs: number } | null {
  const loss = prevTotalHp - curTotalHp
  if (loss <= (opts?.minLoss ?? 0)) {
    return null
  }
  const intensity = Math.min(
    loss * (opts?.perHpIntensity ?? 0.0006),
    opts?.maxIntensity ?? 0.016
  )
  return {
    intensity,
    durationMs: opts?.durationMs ?? 180,
  }
}
