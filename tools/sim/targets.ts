import type { BotAggregate } from './metrics'

export interface TargetReport {
  pass: boolean
  failures: string[]
}

/**
 * Cibles « tendu mais gagnable » (refonte playtest). Le kite-bot est un joueur
 * moyen ; un humain fait mieux. On vise donc :
 *  - le kite atteint le milieu/la fin (le boss ~5:00 est atteignable par un humain),
 *  - mais il NE survit PAS trivialement toute la run (sinon trop sûr),
 *  - ses PV plongent (climax), sans mort punitive au tout début,
 *  - greedy/idle meurent (imprudents) mais pas instantanément.
 * Oracle final = playtest humain ; ces seuils sont un garde-fou de régression.
 */
const KITE_MIN_SURVIVAL_MEDIAN_MS = 150000 // survie médiane ≥ 2:30 (atteint le milieu de run)
const KITE_MAX_SURVIVE_FULL_PCT = 60 // ne doit PAS survivre passivement toute la run
const KITE_MIN_FIRST_DEATH_MS = 45000 // aucune run ne meurt avant 0:45 (départ non punitif)
const KITE_MAX_HP_DIP_PCT = 45 // les PV médians doivent plonger sous ce seuil (tension)
/** Un bot non-skillé meurt, mais pas dans les toutes premières secondes. */
const UNSKILLED_MIN_DEATH_MS = 40000

export function evaluateTargets(aggs: BotAggregate[]): TargetReport {
  const byBot = new Map(aggs.map((a) => [a.bot, a]))
  const failures: string[] = []

  const kite = byBot.get('kite')
  if (kite !== undefined) {
    if (kite.survivalMsMedian < KITE_MIN_SURVIVAL_MEDIAN_MS) {
      failures.push(
        `kite: survie médiane ${Math.round(kite.survivalMsMedian / 1000)}s < ${KITE_MIN_SURVIVAL_MEDIAN_MS / 1000}s (trop fragile)`
      )
    }
    if (kite.survivedFullPct > KITE_MAX_SURVIVE_FULL_PCT) {
      failures.push(
        `kite: survie pleine ${Math.round(kite.survivedFullPct)}% > ${KITE_MAX_SURVIVE_FULL_PCT}% (trop sûr, pas assez tendu)`
      )
    }
    if (kite.survivalMsMin < KITE_MIN_FIRST_DEATH_MS) {
      failures.push(`kite: une run meurt à ${Math.round(kite.survivalMsMin / 1000)}s (< ${KITE_MIN_FIRST_DEATH_MS / 1000}s, départ trop brutal)`)
    }
    if (kite.hpPctCurve.length > 0) {
      const minHpPct = Math.min(...kite.hpPctCurve)
      if (minHpPct >= KITE_MAX_HP_DIP_PCT) {
        failures.push(
          `kite: HP médian jamais sous ${KITE_MAX_HP_DIP_PCT}% (creux ${Math.round(minHpPct)}%) — jeu trop sûr, pas de climax`
        )
      }
    }
  }

  const greedy = byBot.get('greedy')
  if (greedy !== undefined) {
    if (greedy.survivedFullPct > 0) {
      failures.push(`greedy: ${Math.round(greedy.survivedFullPct)}% survivent la run pleine (trop facile pour l'imprudent)`)
    } else if (greedy.survivalMsMedian < UNSKILLED_MIN_DEATH_MS) {
      failures.push(`greedy: mort médiane ${Math.round(greedy.survivalMsMedian / 1000)}s < ${UNSKILLED_MIN_DEATH_MS / 1000}s (punitif au démarrage)`)
    }
  }

  const idle = byBot.get('idle')
  if (idle !== undefined) {
    if (idle.survivedFullPct > 0) {
      failures.push(`idle: ${Math.round(idle.survivedFullPct)}% survivent la run pleine (immobile, trop facile)`)
    } else if (idle.survivalMsMedian < UNSKILLED_MIN_DEATH_MS) {
      failures.push(`idle: mort médiane ${Math.round(idle.survivalMsMedian / 1000)}s < ${UNSKILLED_MIN_DEATH_MS / 1000}s (punitif au démarrage)`)
    }
  }

  return { pass: failures.length === 0, failures }
}
