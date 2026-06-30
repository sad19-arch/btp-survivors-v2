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
    expect(rep.failures.join(' ')).toContain('greedy')
  })

  it('FAIL si idle survit la run pleine (immobile = trop facile)', () => {
    const rep = evaluateTargets([agg({ bot: 'idle', survivedFullPct: 100, survivalMsMedian: 480000 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('idle')
  })

  it('PASS quand le HP de kite plonge sous 50% (jeu tendu mais gagnable)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', hpPctCurve: [100, 80, 45, 60] })])
    expect(rep.pass).toBe(true)
  })

  it('FAIL quand le HP de kite ne descend jamais sous 50% (trop sûr, pas de climax)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', hpPctCurve: [100, 95, 90, 100] })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('kite')
  })

  it('FAIL si greedy meurt avant 1:00 (punitif au démarrage)', () => {
    const rep = evaluateTargets([agg({ bot: 'greedy', survivedFullPct: 0, survivalMsMedian: 40000 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('greedy')
  })

  it('PASS si greedy meurt en milieu de run, même hors ancienne fenêtre', () => {
    const rep = evaluateTargets([agg({ bot: 'greedy', survivedFullPct: 0, survivalMsMedian: 90000 })])
    expect(rep.pass).toBe(true)
  })

  it('FAIL si idle meurt avant 1:00 (punitif au démarrage)', () => {
    const rep = evaluateTargets([agg({ bot: 'idle', survivedFullPct: 0, survivalMsMedian: 40000 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('idle')
  })

  it('PASS si idle meurt en milieu de run, même hors ancienne fenêtre', () => {
    const rep = evaluateTargets([agg({ bot: 'idle', survivedFullPct: 0, survivalMsMedian: 90000 })])
    expect(rep.pass).toBe(true)
  })
})
