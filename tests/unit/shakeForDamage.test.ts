import { describe, expect, it } from 'vitest'
import { shakeForDamage } from '@render/shakeForDamage'

describe('shakeForDamage', () => {
  it('retourne null quand aucune perte (stable)', () => {
    expect(shakeForDamage(100, 100)).toBeNull()
  })

  it('retourne null quand soin (hp augmente)', () => {
    expect(shakeForDamage(80, 100)).toBeNull()
  })

  it('retourne intensité > 0 et durée > 0 quand perte réelle', () => {
    const result = shakeForDamage(100, 90)
    expect(result).not.toBeNull()
    if (result === null) {
      return
    }
    expect(result.intensity).toBeGreaterThan(0)
    expect(result.durationMs).toBeGreaterThan(0)
  })

  it('durée par défaut = 180 ms', () => {
    const result = shakeForDamage(100, 90)
    expect(result).not.toBeNull()
    if (result === null) {
      return
    }
    expect(result.durationMs).toBe(180)
  })

  it("grosse perte → intensité plus forte qu'une petite perte (monotone)", () => {
    const small = shakeForDamage(100, 95) // perte 5
    const big = shakeForDamage(100, 70) // perte 30
    expect(small).not.toBeNull()
    expect(big).not.toBeNull()
    if (small === null || big === null) {
      return
    }
    expect(big.intensity).toBeGreaterThan(small.intensity)
  })

  it('perte énorme → intensité plafonnée à maxIntensity par défaut (0.016)', () => {
    // perte 1000 * 0.0006 = 0.6, bien au-dessus du plafond
    const result = shakeForDamage(1100, 100)
    expect(result).not.toBeNull()
    if (result === null) {
      return
    }
    expect(result.intensity).toBe(0.016)
  })

  it('minLoss : perte égale minLoss → null', () => {
    expect(shakeForDamage(100, 98, { minLoss: 2 })).toBeNull()
  })

  it('minLoss : perte < minLoss → null', () => {
    expect(shakeForDamage(100, 99, { minLoss: 2 })).toBeNull()
  })

  it('minLoss : perte > minLoss → shake', () => {
    const result = shakeForDamage(100, 97, { minLoss: 2 })
    expect(result).not.toBeNull()
    if (result === null) {
      return
    }
    expect(result.intensity).toBeGreaterThan(0)
  })

  it('options custom perHpIntensity et maxIntensity', () => {
    const result = shakeForDamage(100, 90, { perHpIntensity: 0.001, maxIntensity: 0.01 })
    expect(result).not.toBeNull()
    if (result === null) {
      return
    }
    // loss 10 * 0.001 = 0.01, exactement au plafond
    expect(result.intensity).toBe(0.01)
  })

  it('options custom durationMs', () => {
    const result = shakeForDamage(100, 90, { durationMs: 250 })
    expect(result).not.toBeNull()
    if (result === null) {
      return
    }
    expect(result.durationMs).toBe(250)
  })
})
