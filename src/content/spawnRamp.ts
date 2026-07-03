/**
 * Rampe de spawn temporelle (data-driven). Définit comment la pression
 * ennemie monte dans le temps sur une run de ~10:30 :
 *  - 0-3 min : calme (PRD apprentissage), greedy/idle ne sont pas wipés d'emblée.
 *  - 3-9 min : phase de puissance — la PRESSION monte via le NOMBRE (densité de
 *    spawn en forte hausse) pendant que les PV des ennemis montent doucement
 *    (ils fondent encore) ; mini-boss dans cette fenêtre.
 *  - 9-10:30 min : mur — PV en coup de fouet (cf. `difficultyScaleAt`), densité
 *    au maximum → climax qui encercle même un kiter avant le boss final.
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
  { fromSec: 0, intervalMs: 3000, countPerWave: 1 }, // 0-3 min : fuite, apprentissage
  { fromSec: 45, intervalMs: 2200, countPerWave: 1 },
  { fromSec: 100, intervalMs: 1600, countPerWave: 1 },
  { fromSec: 180, intervalMs: 1100, countPerWave: 2 }, // 3:00 : la puissance commence, densité ↑
  { fromSec: 260, intervalMs: 850, countPerWave: 2 },
  { fromSec: 340, intervalMs: 650, countPerWave: 3 }, // ~4,6/s
  { fromSec: 420, intervalMs: 520, countPerWave: 4 }, // ~7,7/s — on fauche
  { fromSec: 500, intervalMs: 430, countPerWave: 5 },
  { fromSec: 540, intervalMs: 330, countPerWave: 7 }, // 9:00 : tension
  { fromSec: 600, intervalMs: 280, countPerWave: 8 }, // 10:00
  { fromSec: 630, intervalMs: 230, countPerWave: 9 } // 10:30 : climax + boss final
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
 * Montée en puissance temporelle des ennemis de vague (pas le boss) : les PV
 * croissent doucement (les ennemis fondent) pendant la phase de puissance (≤9:00)
 * puis en coup de fouet après (mur de fin de run) ; les dégâts de contact et la
 * vitesse (plafonnée) croissent linéairement avec le temps. Déterministe (fonction
 * pure du temps).
 */
export function difficultyScaleAt(elapsedMs: number): DifficultyScale {
  const min = Math.max(0, elapsedMs) / 60000
  // PV : montée DOUCE pendant la puissance (fondent) puis coup de fouet après 8:30 (mur).
  const hp = min <= 8.5 ? 0.7 + 0.12 * min : 0.7 + 0.12 * 8.5 + 1.3 * (min - 8.5)
  return {
    hp, // 3:00→1,06 · 6:00→1,42 · 8:30→1,72 · 11:00→5,0
    contactDamage: 0.5 + 0.18 * min,
    speed: Math.min(1.2, 1.0 + 0.04 * min)
  }
}
