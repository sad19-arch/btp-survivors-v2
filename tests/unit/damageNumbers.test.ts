import { describe, it, expect } from 'vitest'
import { hitFlashUntil, damageNumberStyle } from '../../src/render/damageNumbers'
import { PALETTE } from '../../src/ui/palette'

describe('hitFlashUntil', () => {
  it('retourne now+durationMs si amount>0', () => {
    const result = hitFlashUntil(1000, 6, 60)
    expect(result).toBe(1060)
  })

  it('retourne undefined si amount===0', () => {
    const result = hitFlashUntil(1000, 0, 60)
    expect(result).toBeUndefined()
  })

  it('retourne undefined si amount<0 (regen)', () => {
    const result = hitFlashUntil(1000, -2, 60)
    expect(result).toBeUndefined()
  })

  it('fonctionne avec différentes durées', () => {
    expect(hitFlashUntil(500, 1, 100)).toBe(600)
    expect(hitFlashUntil(0, 5, 60)).toBe(60)
  })
})

describe('damageNumberStyle', () => {
  it('ennemi normal → couleur jauneSecurite', () => {
    const style = damageNumberStyle(false, false, 10)
    expect(style.color).toBe(PALETTE.jauneSecurite)
    expect(style.text).toBe('10')
  })

  it('ennemi elite → couleur orangeDanger', () => {
    const style = damageNumberStyle(true, false, 7)
    expect(style.color).toBe(PALETTE.orangeDanger)
    expect(style.text).toBe('7')
  })

  it('boss → couleur orangeDanger', () => {
    const style = damageNumberStyle(false, true, 50)
    expect(style.color).toBe(PALETTE.orangeDanger)
    expect(style.text).toBe('50')
  })

  it('arrondit le montant', () => {
    const style = damageNumberStyle(false, false, 7.6)
    expect(style.text).toBe('8')
  })

  it('fraction inférieure à 0.5 → arrondi vers le bas', () => {
    const style = damageNumberStyle(false, false, 4.3)
    expect(style.text).toBe('4')
  })
})
