import { describe, it, expect } from 'vitest'
import { sparkline, renderSummaryTable, renderDiff } from '../../tools/sim/render'
import type { BotAggregate } from '../../tools/sim/metrics'

function agg(partial: Partial<BotAggregate>): BotAggregate {
  return {
    bot: 'kite', runs: 10, survivedFullPct: 80, survivalMsMedian: 480000,
    survivalMsMin: 300000, survivalMsMax: 480000, levelAt5minMedian: 8,
    peakEnemiesMedian: 50, bucketSec: 10, hpPctCurve: [], enemiesCurve: [], ...partial
  }
}

describe('sparkline', () => {
  it('mappe min→premier bloc, max→dernier bloc', () => {
    const s = sparkline([0, 50, 100])
    expect(s).toHaveLength(3)
    expect(s.charAt(0)).toBe('▁')
    expect(s.charAt(2)).toBe('█')
  })
  it('valeurs constantes → bloc bas, pas de NaN', () => {
    expect(sparkline([5, 5, 5])).toBe('▁▁▁')
  })
  it('liste vide → chaîne vide', () => expect(sparkline([])).toBe(''))
})

describe('renderSummaryTable', () => {
  it('contient le bot et les colonnes clés', () => {
    const out = renderSummaryTable([agg({ bot: 'kite' })])
    expect(out).toContain('kite')
    expect(out).toContain('survie')
  })
})

describe('renderDiff', () => {
  it('montre le delta de survie médiane', () => {
    const out = renderDiff([agg({ survivalMsMedian: 480000 })], [agg({ survivalMsMedian: 300000 })])
    expect(out).toContain('kite')
    expect(out).toMatch(/\+|180/) // +180s ou un delta visible
  })
})
