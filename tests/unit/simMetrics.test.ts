import { describe, it, expect } from 'vitest'
import { median, aggregate, type RunResult } from '../../tools/sim/metrics'

function run(partial: Partial<RunResult>): RunResult {
  return {
    seed: 1, bot: 'kite', samples: [], survived: false, survivalMs: 0,
    finalLevel: 0, levelAt5min: 0, peakEnemies: 0, nanSeen: false,
    minHp: 100, maxEnemies: 0, ...partial
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
  })
})
