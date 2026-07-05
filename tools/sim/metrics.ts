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
  /** A GAGNÉ (boss final tué → `scene === 'won'`) — la vraie mesure de gagnabilité. */
  wonTheGame: boolean
  /** Instant de mort en ms, ou durée pleine si survie. */
  survivalMs: number
  finalLevel: number
  /** Niveau au plus proche échantillon t ≤ 300 s (climax mini-boss). */
  levelAt5min: number
  peakEnemies: number
  nanSeen: boolean
  minHp: number
  /** PV minimum atteint sur le run, en % de maxHp (mesure la tension/climax, morts inclus). */
  minHpPct: number
  maxEnemies: number
}

export interface BotAggregate {
  bot: string
  runs: number
  survivedFullPct: number
  /** % de runs où le bot a tué le boss final (gagnabilité réelle). */
  winPct: number
  survivalMsMedian: number
  survivalMsMin: number
  survivalMsMax: number
  levelAt5minMedian: number
  peakEnemiesMedian: number
  /** Médiane du PV minimum atteint par run (%). Mesure la tension sans biais de survivant. */
  minHpPctMedian: number
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

/**
 * Médiane, colonne par colonne, d'une matrice de courbes (lignes = runs).
 * Un run mort tôt a un tableau plus court (l'échantillonnage s'arrête à sa
 * mort, cf. `runOne`) : ses colonnes manquantes ne sont PAS comptées comme 0
 * (un run mort n'a pas « 0 % de PV » aux instants suivants — il n'a juste plus
 * d'échantillon). On agrège donc chaque colonne uniquement sur les runs
 * encore vivants à cet instant, et on exclut la colonne si aucun run n'y est
 * vivant (plutôt que de la niveler à 0).
 */
function medianCurve(curves: number[][]): number[] {
  const len = curves.reduce((m, c) => Math.max(m, c.length), 0)
  const out: number[] = []
  for (let i = 0; i < len; i++) {
    const alive: number[] = []
    for (const c of curves) {
      const v = c[i]
      if (v !== undefined) {
        alive.push(v)
      }
    }
    if (alive.length > 0) {
      out.push(median(alive))
    }
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
    winPct: runs === 0 ? 0 : (results.filter((r) => r.wonTheGame).length / runs) * 100,
    survivalMsMedian: median(survivalMs),
    survivalMsMin: survivalMs.length === 0 ? 0 : Math.min(...survivalMs),
    survivalMsMax: survivalMs.length === 0 ? 0 : Math.max(...survivalMs),
    levelAt5minMedian: median(results.map((r) => r.levelAt5min)),
    peakEnemiesMedian: median(results.map((r) => r.peakEnemies)),
    minHpPctMedian: median(results.map((r) => r.minHpPct)),
    bucketSec,
    hpPctCurve: medianCurve(results.map((r) => r.samples.map((s) => s.hpPct))),
    enemiesCurve: medianCurve(results.map((r) => r.samples.map((s) => s.enemies)))
  }
}
