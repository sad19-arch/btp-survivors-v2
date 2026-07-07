import { describe, it, expect } from 'vitest'
import { approach } from '@ui/anim'

describe('approach (util pur, déterministe)', () => {
  it('déjà à la cible → retourne exactement current (immobile)', () => {
    expect(approach(0.5, 0.5, 16)).toBe(0.5)
    expect(approach(0, 0, 16)).toBe(0)
    expect(approach(1, 1, 16)).toBe(1)
  })

  it('monte vers une cible supérieure par étape partielle (petit dt)', () => {
    const result = approach(0, 1, 16) // dt=16ms, rate=6 → step=0.096
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(1)
  })

  it("n'atteint jamais la cible instantanement avec petit dt (facteur < 1)", () => {
    // ratePerSec=6, dt=16ms → factor = 6 * 0.016 = 0.096 < 1 → result < target
    const result = approach(0, 1, 16)
    expect(result).toBeCloseTo(0.096, 6)
  })

  it('atteint (≈) la cible pour un grand dt (facteur borné à 1)', () => {
    // dt=10000ms → factor=1 → result === target
    const result = approach(0, 1, 10000)
    expect(result).toBe(1)
  })

  it('ne dépasse pas la cible même avec un grand dt (cible inférieure)', () => {
    const result = approach(0.8, 0.3, 10000)
    expect(result).toBe(0.3)
  })

  it('current > target → redescend vers target sans passer en dessous', () => {
    // Ex: level-up reset d'XP — la barre affichée est à 0.9, la cible est 0
    const result = approach(0.9, 0, 16) // factor=0.096, step=(0-0.9)*0.096=-0.0864
    expect(result).toBeCloseTo(0.9 - 0.0864, 6)
    expect(result).toBeLessThan(0.9)
    expect(result).toBeGreaterThan(0) // ne passe pas en dessous de la cible
  })

  it('current > target + grand dt → descend exactement à target', () => {
    const result = approach(1, 0, 10000)
    expect(result).toBe(0)
  })

  it('ratePerSec personnalisé est respecté', () => {
    // ratePerSec=2, dt=500ms → factor = 2 * 0.5 = 1.0 → atteint la cible
    const result = approach(0, 1, 500, 2)
    expect(result).toBe(1)

    // ratePerSec=2, dt=100ms → factor = 2 * 0.1 = 0.2 → step = 0.2
    const result2 = approach(0, 1, 100, 2)
    expect(result2).toBeCloseTo(0.2, 6)
  })
})
