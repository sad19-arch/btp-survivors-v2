import { describe, it, expect } from 'vitest'
import { evaluateTargets } from '../../tools/sim/targets'
import type { BotAggregate } from '../../tools/sim/metrics'

/** Profil kite PASSANT par défaut (arc 11 min, tendu mais gagnable) ; surcharger pour tester un échec. */
function agg(partial: Partial<BotAggregate>): BotAggregate {
  return {
    bot: 'kite', runs: 10, survivedFullPct: 20, winPct: 30, survivalMsMedian: 320000,
    survivalMsMin: 90000, survivalMsMax: 660000, levelAt5minMedian: 11,
    peakEnemiesMedian: 50, minHpPctMedian: 25, bucketSec: 10, hpPctCurve: [100, 80, 35, 55], enemiesCurve: [], ...partial
  }
}

describe('evaluateTargets (tendu mais gagnable, arc 11 min)', () => {
  it('PASS : kite atteint le milieu de run avec PV qui plongent, greedy/idle meurent', () => {
    const rep = evaluateTargets([
      agg({ bot: 'kite' }),
      agg({ bot: 'greedy', survivedFullPct: 0, survivalMsMedian: 120000 }),
      agg({ bot: 'idle', survivedFullPct: 0, survivalMsMedian: 90000 })
    ])
    expect(rep.pass).toBe(true)
    expect(rep.failures).toHaveLength(0)
  })

  it('FAIL si kite meurt trop tôt (départ brutal)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', survivalMsMin: 30000 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('kite')
  })

  it('FAIL si kite est trop fragile (survie médiane faible)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', survivalMsMedian: 100000 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('kite')
  })

  it('FAIL si kite survit trop souvent la run pleine (pas assez tendu)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', survivedFullPct: 90 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('kite')
  })

  it('PASS quand le PV min médian de kite plonge sous 40% (climax)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', minHpPctMedian: 25 })])
    expect(rep.pass).toBe(true)
  })

  it('FAIL quand le PV min médian de kite ne descend jamais sous 40% (trop sûr)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', minHpPctMedian: 90 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('kite')
  })

  it('FAIL si kite ne gagne JAMAIS (jeu non gagnable — cible n°1)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', winPct: 0 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('gagnable')
  })

  it('FAIL si kite gagne trop souvent (trop facile, plus de tension)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', winPct: 90 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('victoire')
  })

  it('PASS si greedy survit RAREMENT (build chanceux ≤ seuil) — jeu gagnable', () => {
    const rep = evaluateTargets([agg({ bot: 'greedy', survivedFullPct: 10, survivalMsMedian: 300000 })])
    expect(rep.pass).toBe(true)
  })

  it('FAIL si greedy survit la run pleine de façon FIABLE (imprudent = doit rester rare)', () => {
    const rep = evaluateTargets([agg({ bot: 'greedy', survivedFullPct: 100, survivalMsMedian: 660000 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('greedy')
  })

  it('FAIL si idle survit la run pleine (immobile = doit mourir)', () => {
    const rep = evaluateTargets([agg({ bot: 'idle', survivedFullPct: 100, survivalMsMedian: 660000 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('idle')
  })

  it('FAIL si greedy meurt dans les toutes premières secondes (< 45s)', () => {
    const rep = evaluateTargets([agg({ bot: 'greedy', survivedFullPct: 0, survivalMsMedian: 30000 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('greedy')
  })

  it('PASS si idle meurt en milieu de run', () => {
    const rep = evaluateTargets([agg({ bot: 'idle', survivedFullPct: 0, survivalMsMedian: 90000 })])
    expect(rep.pass).toBe(true)
  })

  it('PASS si idle survit RAREMENT (grande arène : projectiles pleine portée, ≤ seuil)', () => {
    const rep = evaluateTargets([agg({ bot: 'idle', survivedFullPct: 8, survivalMsMedian: 250000 })])
    expect(rep.pass).toBe(true)
  })
})
