import { describe, it, expect } from 'vitest'
import { evaluateTargets } from '../../tools/sim/targets'
import type { BotAggregate } from '../../tools/sim/metrics'

function agg(partial: Partial<BotAggregate>): BotAggregate {
  return {
    bot: 'kite', runs: 10, survivedFullPct: 90, survivalMsMedian: 480000,
    survivalMsMin: 70000, survivalMsMax: 480000, levelAt5minMedian: 9,
    peakEnemiesMedian: 50, bucketSec: 10, hpPctCurve: [], enemiesCurve: [], ...partial
  }
}

describe('evaluateTargets', () => {
  it('PASS quand kite survit, greedy meurt en milieu, idle meurt tôt', () => {
    const rep = evaluateTargets([
      agg({ bot: 'kite', survivedFullPct: 90, levelAt5minMedian: 9, survivalMsMin: 70000 }),
      agg({ bot: 'greedy', survivedFullPct: 0, survivalMsMedian: 240000 }),
      agg({ bot: 'idle', survivedFullPct: 0, survivalMsMedian: 180000 })
    ])
    expect(rep.pass).toBe(true)
    expect(rep.failures).toHaveLength(0)
  })

  it('FAIL si kite meurt avant 1:00 (spawn trop brutal au départ)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', survivalMsMin: 30000 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('kite')
  })

  it('FAIL si greedy survit la run pleine (trop facile)', () => {
    const rep = evaluateTargets([agg({ bot: 'greedy', survivedFullPct: 100, survivalMsMedian: 480000 })])
    expect(rep.pass).toBe(false)
  })
})
