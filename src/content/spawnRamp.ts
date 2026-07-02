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
  { fromSec: 0, intervalMs: 3000, countPerWave: 1 }, // ~0,33/s — 1re minute d'apprentissage
  { fromSec: 45, intervalMs: 2000, countPerWave: 1 }, // ~0,5/s
  { fromSec: 95, intervalMs: 1400, countPerWave: 1 }, // ~0,71/s
  { fromSec: 145, intervalMs: 1000, countPerWave: 2 }, // ~2,0/s — la pression monte
  { fromSec: 225, intervalMs: 800, countPerWave: 2 }, // ~2,5/s
  { fromSec: 300, intervalMs: 640, countPerWave: 3 }, // ~4,7/s — boss (5:00) dans la nasse
  { fromSec: 390, intervalMs: 520, countPerWave: 4 }, // ~7,7/s
  { fromSec: 470, intervalMs: 430, countPerWave: 5 }, // ~11,6/s
  { fromSec: 540, intervalMs: 370, countPerWave: 6 } // ~16,2/s — pic final
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

/** Multiplicateurs de stats appliqués aux ennemis de vague selon le temps écoulé. */
export interface DifficultyScale {
  hp: number
  contactDamage: number
  speed: number
}

/**
 * Montée en puissance temporelle des ennemis de vague (pas le boss) : PV et dégâts
 * de contact croissent linéairement avec le temps, la vitesse un peu (plafonnée),
 * pour que la fin de run soit un vrai mur. Déterministe (fonction pure du temps).
 */
export function difficultyScaleAt(elapsedMs: number): DifficultyScale {
  const min = Math.max(0, elapsedMs) / 60000
  // Départ SOUS 1 (ennemis affaiblis → 1re minute clémente) puis montée jusqu'à un
  // mur en fin de run. Courbe « gentille → brutale » = tendu mais gagnable.
  return {
    hp: 0.7 + 0.28 * min, // 0:00→0,70 · 5:00→2,1 · 8:00→3,0
    contactDamage: 0.5 + 0.17 * min, // 0:00→0,50 · 5:00→1,35 · 8:00→1,86
    speed: Math.min(1.2, 0.9 + 0.06 * min) // 0:00→0,9 (esquivable) · ≥5:00→1,2 (dépasse le joueur)
  }
}
