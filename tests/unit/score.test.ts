import { describe, it, expect } from 'vitest'
import { computeRunScore, type RunScoreInput } from '@content/score'

/** Rapport « moyen » de référence, réutilisé et modifié champ par champ ci-dessous. */
const BASE: RunScoreInput = {
  kills: 40,
  elapsedMs: 180_000,
  level: 6,
  coins: 250,
  outcome: 'defeat',
}

describe('computeRunScore — score de classement (kills + temps + niveau + or)', () => {
  it('est monotone sur les kills : plus de kills ne peut jamais faire baisser le score', () => {
    const low = computeRunScore({ ...BASE, kills: 10 })
    const high = computeRunScore({ ...BASE, kills: 50 })
    expect(high).toBeGreaterThanOrEqual(low)
  })

  it('est monotone sur le temps écoulé : plus de secondes ne peut jamais faire baisser le score', () => {
    const low = computeRunScore({ ...BASE, elapsedMs: 60_000 })
    const high = computeRunScore({ ...BASE, elapsedMs: 300_000 })
    expect(high).toBeGreaterThanOrEqual(low)
  })

  it('est monotone sur le niveau : plus de niveau ne peut jamais faire baisser le score', () => {
    const low = computeRunScore({ ...BASE, level: 1 })
    const high = computeRunScore({ ...BASE, level: 10 })
    expect(high).toBeGreaterThanOrEqual(low)
  })

  it('est monotone sur l’or : plus de pièces ne peut jamais faire baisser le score', () => {
    const low = computeRunScore({ ...BASE, coins: 0 })
    const high = computeRunScore({ ...BASE, coins: 500 })
    expect(high).toBeGreaterThanOrEqual(low)
  })

  it('renvoie toujours un entier', () => {
    expect(Number.isInteger(computeRunScore(BASE))).toBe(true)
    expect(Number.isInteger(computeRunScore({ ...BASE, outcome: 'victory' }))).toBe(true)
    // Un temps écoulé qui ne tombe pas rond en secondes ne doit pas laisser de reste.
    expect(Number.isInteger(computeRunScore({ ...BASE, elapsedMs: 12_345 }))).toBe(true)
  })

  it('n’est jamais négatif', () => {
    expect(computeRunScore(BASE)).toBeGreaterThanOrEqual(0)
    expect(computeRunScore({ kills: 0, elapsedMs: 0, level: 0, coins: 0, outcome: 'defeat' })).toBeGreaterThanOrEqual(0)
  })

  it('entrées à zéro : pas de NaN, pas de crash', () => {
    const zero = computeRunScore({ kills: 0, elapsedMs: 0, level: 0, coins: 0, outcome: 'defeat' })
    expect(Number.isNaN(zero)).toBe(false)
    expect(zero).toBe(0)
  })

  it('une victoire rapporte plus qu’une défaite à entrées strictement égales', () => {
    const defeat = computeRunScore({ ...BASE, outcome: 'defeat' })
    const victory = computeRunScore({ ...BASE, outcome: 'victory' })
    expect(victory).toBeGreaterThan(defeat)
  })
})
