export interface Sample {
  tSec: number
  hpPct: number
  enemies: number
  level: number
  score: number
}

export interface RunResult {
  seed: number
  bot: string
  samples: Sample[]
  /** A atteint la durée pleine vivant. */
  survived: boolean
  /** Instant de mort en ms, ou durée pleine si survie. */
  survivalMs: number
  finalLevel: number
  /** Niveau au plus proche échantillon t ≤ 300 s (climax mini-boss). */
  levelAt5min: number
  peakEnemies: number
  nanSeen: boolean
  minHp: number
  maxEnemies: number
}

export interface BotAggregate {
  bot: string
  runs: number
  survivedFullPct: number
  survivalMsMedian: number
  survivalMsMin: number
  survivalMsMax: number
  levelAt5minMedian: number
  peakEnemiesMedian: number
  /** Taille de bucket des courbes, en secondes. */
  bucketSec: number
  hpPctCurve: number[]
  enemiesCurve: number[]
}

export function median(xs: number[]): number {
  if (xs.length === 0) {
    return 0
  }
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  if (s.length % 2 === 1) {
    return s[mid] ?? 0
  }
  return ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2
}

/** Médiane, colonne par colonne, d'une matrice de courbes (lignes = runs). Suppose des courbes alignées (même longueur) ; les colonnes manquantes d'une courbe plus courte sont comptées comme 0. */
function medianCurve(curves: number[][]): number[] {
  const len = curves.reduce((m, c) => Math.max(m, c.length), 0)
  const out: number[] = []
  for (let i = 0; i < len; i++) {
    out.push(median(curves.map((c) => c[i] ?? 0)))
  }
  return out
}

export function aggregate(results: RunResult[]): BotAggregate {
  const bot = results[0]?.bot ?? 'unknown'
  const runs = results.length
  const survivalMs = results.map((r) => r.survivalMs)
  const bucketSec = results[0]?.samples[1]?.tSec ?? 10
  return {
    bot,
    runs,
    survivedFullPct: runs === 0 ? 0 : (results.filter((r) => r.survived).length / runs) * 100,
    survivalMsMedian: median(survivalMs),
    survivalMsMin: survivalMs.length === 0 ? 0 : Math.min(...survivalMs),
    survivalMsMax: survivalMs.length === 0 ? 0 : Math.max(...survivalMs),
    levelAt5minMedian: median(results.map((r) => r.levelAt5min)),
    peakEnemiesMedian: median(results.map((r) => r.peakEnemies)),
    bucketSec,
    hpPctCurve: medianCurve(results.map((r) => r.samples.map((s) => s.hpPct))),
    enemiesCurve: medianCurve(results.map((r) => r.samples.map((s) => s.enemies)))
  }
}
