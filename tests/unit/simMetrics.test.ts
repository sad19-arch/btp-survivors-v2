import { describe, it, expect } from 'vitest'
import { median, aggregate, type RunResult } from '../../tools/sim/metrics'

function run(partial: Partial<RunResult>): RunResult {
  return {
    seed: 1, bot: 'kite', samples: [], survived: false, wonTheGame: false, survivalMs: 0,
    finalLevel: 0, levelAt5min: 0, peakEnemies: 0, nanSeen: false,
    minHp: 100, minHpPct: 100, maxEnemies: 0,
    earlyGame: {
      observationMs: 90000, firstEnemyMs: null, firstKillMs: null, firstLevelUpMs: null,
      longestKillGapMs: 90000, enemyFreeMs: 90000, killsPer15Sec: [0, 0, 0, 0, 0, 0], hpLostPct: 0
    },
    ...partial
  }
}

describe('median', () => {
  it('renvoie 0 sur liste vide', () => expect(median([])).toBe(0))
  it('médiane impaire', () => expect(median([3, 1, 2])).toBe(2))
  it('médiane paire = moyenne des deux centraux', () => expect(median([1, 2, 3, 4])).toBe(2.5))
})

describe('aggregate', () => {
  it('calcule % de survie pleine, survie médiane et niveau médian @5min', () => {
    const results: RunResult[] = [
      run({ seed: 1, survived: true, survivalMs: 480000, levelAt5min: 10, peakEnemies: 40,
            samples: [{ tSec: 0, hpPct: 100, enemies: 0, level: 1, score: 0 },
                      { tSec: 10, hpPct: 80, enemies: 5, level: 2, score: 20 }] }),
      run({ seed: 2, survived: false, survivalMs: 240000, levelAt5min: 6, peakEnemies: 60,
            samples: [{ tSec: 0, hpPct: 100, enemies: 0, level: 1, score: 0 },
                      { tSec: 10, hpPct: 60, enemies: 9, level: 2, score: 10 }] })
    ]
    const a = aggregate(results)
    expect(a.runs).toBe(2)
    expect(a.survivedFullPct).toBe(50)
    expect(a.survivalMsMedian).toBe(360000) // (240000+480000)/2
    expect(a.levelAt5minMedian).toBe(8)     // (10+6)/2
    expect(a.peakEnemiesMedian).toBe(50)
    expect(a.hpPctCurve).toEqual([100, 70]) // médiane par bucket
    expect(a.enemiesCurve).toEqual([0, 7])
    expect(a.bucketSec).toBe(10)
    expect(a.survivalMsMin).toBe(240000)
    expect(a.survivalMsMax).toBe(480000)
  })

  it('agrège une liste vide sans planter (valeurs neutres)', () => {
    const a = aggregate([])
    expect(a.runs).toBe(0)
    expect(a.survivedFullPct).toBe(0)
    expect(a.survivalMsMin).toBe(0)
    expect(a.survivalMsMax).toBe(0)
    expect(a.survivalMsMedian).toBe(0)
  })

  it('un bucket tardif exclut les runs déjà morts (pas de 0-padding) — médiane des survivants', () => {
    // 2 runs meurent tôt (échantillonnage qui s'arrête à la mort, cf. runOne), 3 runs survivent.
    const dead = (n: number): { tSec: number; hpPct: number; enemies: number; level: number; score: number }[] =>
      [{ tSec: 0, hpPct: 100, enemies: 0, level: 1, score: 0 }].slice(0, n)
    const results: RunResult[] = [
      run({ seed: 1, survived: false, samples: dead(1) }), // mort avant le bucket tardif
      run({ seed: 2, survived: false, samples: dead(1) }), // idem
      run({ seed: 3, survived: true, samples: [{ tSec: 0, hpPct: 100, enemies: 0, level: 1, score: 0 }, { tSec: 10, hpPct: 20, enemies: 5, level: 3, score: 30 }] }),
      run({ seed: 4, survived: true, samples: [{ tSec: 0, hpPct: 100, enemies: 0, level: 1, score: 0 }, { tSec: 10, hpPct: 40, enemies: 5, level: 3, score: 30 }] }),
      run({ seed: 5, survived: true, samples: [{ tSec: 0, hpPct: 100, enemies: 0, level: 1, score: 0 }, { tSec: 10, hpPct: 60, enemies: 5, level: 3, score: 30 }] })
    ]
    const a = aggregate(results)
    // Bucket 1 (tardif) : seuls les 3 runs vivants y contribuent → médiane 40, PAS la médiane
    // avec 0-padding des 2 runs morts (qui donnerait 20).
    expect(a.hpPctCurve[1]).toBe(40)
  })
})
