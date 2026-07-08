/**
 * Rampe de spawn temporelle (data-driven). Définit comment la pression
 * ennemie monte dans le temps sur un arc de ~20 min :
 *  - 0-3 min   : calme (PRD apprentissage), greedy/idle ne sont pas wipés d'emblée.
 *  - 3-9 min   : phase de puissance — la PRESSION monte via le NOMBRE (densité de
 *    spawn en forte hausse) pendant que les PV des ennemis montent doucement.
 *    Mini-boss périodiques à 5:00/10:00/15:00 ponctuent l'arc.
 *  - 9-15 min  : montée soutenue — densité croissante, PV en hausse continue.
 *  - 15-20 min : climax final — densité maximum, coup de fouet PV → encerclement
 *    inévitable avant le boss final à 20:00.
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
  { fromSec: 0,    intervalMs: 3000, countPerWave: 1 }, // 0-3 min : fuite, apprentissage
  { fromSec: 45,   intervalMs: 2200, countPerWave: 1 },
  { fromSec: 100,  intervalMs: 1600, countPerWave: 1 },
  { fromSec: 180,  intervalMs: 1200, countPerWave: 2 }, // 3:00 : la puissance commence
  { fromSec: 260,  intervalMs: 950,  countPerWave: 2 },
  { fromSec: 340,  intervalMs: 750,  countPerWave: 3 }, // ~4/s
  { fromSec: 420,  intervalMs: 620,  countPerWave: 3 }, // 7:00 — arc long, pression raisonnable
  { fromSec: 500,  intervalMs: 520,  countPerWave: 4 },
  { fromSec: 540,  intervalMs: 450,  countPerWave: 5 }, // 9:00 : tension progressive
  { fromSec: 600,  intervalMs: 440,  countPerWave: 6 }, // 10:00 + boss mid
  { fromSec: 660,  intervalMs: 340,  countPerWave: 8 }, // 11:00 : montée progressive
  { fromSec: 720,  intervalMs: 295,  countPerWave: 9 }, // 12:00
  { fromSec: 780,  intervalMs: 215,  countPerWave: 10 }, // 13:00
  { fromSec: 840,  intervalMs: 185,  countPerWave: 11 }, // 14:00
  { fromSec: 900,  intervalMs: 160,  countPerWave: 12 }, // 15:00 : boss mid + accélération
  { fromSec: 960,  intervalMs: 138,  countPerWave: 13 }, // 16:00 : vague serrée
  { fromSec: 1020, intervalMs: 118,  countPerWave: 14 }, // 17:00
  { fromSec: 1080, intervalMs: 100,  countPerWave: 15 }, // 18:00
  { fromSec: 1140, intervalMs: 85,   countPerWave: 16 }, // 19:00 : climax final
  { fromSec: 1185, intervalMs: 72,   countPerWave: 17 }  // 19:45 : horde de fin avant boss @20:00
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
 * puis de façon soutenue sur l'arc 9-19 min, avec un dernier coup de fouet avant
 * le boss final à 20:00. Les dégâts de contact et la vitesse (plafonnée) croissent
 * linéairement avec le temps. Déterministe (fonction pure du temps).
 *
 * Arc 20 min (PV de vague, valeurs réelles produites ci-dessous) :
 *   3:00 → hp≈0,97   6:00 → hp≈1,24   9:00 → hp≈1,51
 *  12:00 → hp≈1,81  15:00 → hp≈2,11  18:00 → hp≈2,86  20:00 → hp≈3,96
 */
export function difficultyScaleAt(elapsedMs: number): DifficultyScale {
  const min = Math.max(0, elapsedMs) / 60000
  // PV : montée en trois phases —
  //  [0, 9 min]    : douce (ennemis fondent, apprentissage / montée de build)
  //  [9, 17 min]   : soutenue (build abouti mais horde qui presse)
  //  [17, 20+ min] : coup de fouet (climax avant boss final)
  let hp: number
  if (min <= 9) {
    hp = 0.7 + 0.07 * min   // T5b allégé (0.09→0.07) : 9:00→hp=1.33
  } else if (min <= 17) {
    hp = 0.7 + 0.07 * 9 + 0.09 * (min - 9)  // T5b allégé (0.10→0.09)
  } else {
    hp = 0.7 + 0.07 * 9 + 0.09 * 8 + 0.55 * (min - 17)  // coup de fouet final inchangé
  }
  return {
    hp,
    // Contact punitif mais moins rapide que l'arc 10:30 — le kite doit pouvoir
    // tenir 20 min. T5b : pente légèrement adoucie (0.11→0.09).
    contactDamage: 0.5 + 0.09 * min,
    // Vitesse plafonnée : re-tune phase 8 (terrain tactique). Les clusters
    // (clôtures) ABRITENT le kiter → poursuite rallongée (flux qui contourne)
    // → il fallait remonter la vitesse pour que la horde rattrape autour des
    // obstacles (cap 1.30→1.40, pente 0.030→0.037). Rétablit la tension +
    // évite l'accumulation d'ennemis bloqués (plafond sanity 220).
    speed: Math.min(1.40, 1.0 + 0.037 * min)
  }
}
