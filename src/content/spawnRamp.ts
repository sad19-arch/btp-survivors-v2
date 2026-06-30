/**
 * Rampe de spawn temporelle (data-driven). Définit comment la pression
 * ennemie monte dans le temps : 0-1 min calme (PRD apprentissage) → montée
 * → pic vers le climax mini-boss (5:00).
 *
 * Valeurs initiales = équivalentes au spawn plat historique (no-op).
 * Le tuning fait évoluer ce tableau (un palier = un seuil de temps).
 */
export interface SpawnRampStep {
  /** Seuil de temps (s) à partir duquel ce palier s'applique. */
  fromSec: number
  /** Intervalle entre deux vagues, en ms. */
  intervalMs: number
  /** Nombre d'ennemis par vague. */
  countPerWave: number
}

export const SPAWN_RAMP: readonly SpawnRampStep[] = [
  { fromSec: 0, intervalMs: 1400, countPerWave: 1 }
]

/** Palier courant : le dernier dont `fromSec` est ≤ au temps écoulé. */
export function spawnParamsAt(
  ramp: readonly SpawnRampStep[],
  elapsedMs: number
): { intervalMs: number; countPerWave: number } {
  const elapsedSec = elapsedMs / 1000
  let chosen = ramp[0]
  for (const step of ramp) {
    if (step.fromSec <= elapsedSec) {
      chosen = step
    }
  }
  return {
    intervalMs: chosen?.intervalMs ?? 1400,
    countPerWave: chosen?.countPerWave ?? 1
  }
}
