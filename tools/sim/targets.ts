import type { BotAggregate } from './metrics'

export interface TargetReport {
  pass: boolean
  failures: string[]
}

/** Seuils de départ (spec §3.5) — à calibrer en PHASE 3. */
const KITE_MIN_SURVIVE_FULL_PCT = 80
const KITE_MIN_LEVEL_AT_5MIN = 8
const KITE_MIN_FIRST_DEATH_MS = 60000 // ne doit jamais mourir avant 1:00
const KITE_MAX_HP_DIP_PCT = 50 // HP médian doit plonger sous ce seuil (tendu mais gagnable)
/** Un bot non-skillé ne doit pas mourir avant 1:00 (PRD : début non punitif). Au-delà, peu importe quand — tant qu'il ne survit pas la run pleine. */
const UNSKILLED_MIN_DEATH_MS = 60000

export function evaluateTargets(aggs: BotAggregate[]): TargetReport {
  const byBot = new Map(aggs.map((a) => [a.bot, a]))
  const failures: string[] = []

  const kite = byBot.get('kite')
  if (kite !== undefined) {
    if (kite.survivedFullPct < KITE_MIN_SURVIVE_FULL_PCT) {
      failures.push(`kite: survie pleine ${Math.round(kite.survivedFullPct)}% < ${KITE_MIN_SURVIVE_FULL_PCT}%`)
    }
    if (kite.levelAt5minMedian < KITE_MIN_LEVEL_AT_5MIN) {
      failures.push(`kite: niveau @5:00 ${Math.round(kite.levelAt5minMedian)} < ${KITE_MIN_LEVEL_AT_5MIN}`)
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
