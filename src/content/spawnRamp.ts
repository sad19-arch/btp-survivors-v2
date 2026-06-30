/**
 * Rampe de spawn temporelle (data-driven). Définit comment la pression
 * ennemie monte dans le temps sur une run de ~10 min :
 *  - 0-1 min : calme (PRD apprentissage), greedy/idle ne sont pas wipés d'emblée.
 *  - 1-5 min : montée régulière ; spike mini-boss à 5:00.
 *  - 5-10 min : escalade brutale → finale dense qui encercle même un kiter
 *    (le joueur, à 200 px/s, distance tout individuellement ; seule la densité
 *    via l'anneau de spawn peut le menacer → HP qui plonge = climax).
 *
 * Un palier = un seuil de temps. Tuné via le harness sim (cibles « skill récompensé »).
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
  { fromSec: 0, intervalMs: 3400, countPerWave: 1 }, // ~0,29/s — 1re minute très indulgente (armes nerfées : début non punitif)
  { fromSec: 45, intervalMs: 2200, countPerWave: 1 }, // ~0,45/s
  { fromSec: 90, intervalMs: 1500, countPerWave: 1 }, // ~0,67/s — fin de l'apprentissage
  { fromSec: 140, intervalMs: 1100, countPerWave: 2 }, // ~1,8/s — la pression dépasse le DPS de base
  { fromSec: 220, intervalMs: 850, countPerWave: 2 }, // ~2,35/s — montée vers le boss
  { fromSec: 300, intervalMs: 650, countPerWave: 3 }, // ~4,6/s — spike mini-boss (5:00)
  { fromSec: 400, intervalMs: 520, countPerWave: 4 }, // ~7,7/s — submerge le campeur
  { fromSec: 480, intervalMs: 430, countPerWave: 5 }, // ~11,6/s — finale, encercle le kiter
  { fromSec: 540, intervalMs: 380, countPerWave: 6 } // ~15,8/s — pic final
]

/** Palier courant : le dernier dont `fromSec` est ≤ au temps écoulé. */
export function spawnParamsAt(
  ramp: readonly SpawnRampStep[],
  elapsedMs: number
): { intervalMs: number; countPerWave: number } {
  const first = ramp[0]
  if (first === undefined) {
    throw new Error('spawnParamsAt: rampe de spawn vide')
  }
  const elapsedSec = elapsedMs / 1000
  let chosen = first
  for (const step of ramp) {
    if (step.fromSec <= elapsedSec) {
      chosen = step
    }
  }
  return { intervalMs: chosen.intervalMs, countPerWave: chosen.countPerWave }
}
