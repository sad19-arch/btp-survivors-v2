import { describe, it, expect } from 'vitest'
import { parseBootOptions } from '@/app/bootOptions'

describe('parseBootOptions', () => {
  it('renvoie des valeurs par défaut sans paramètres', () => {
    expect(parseBootOptions('')).toEqual({ autostart: null, seed: 1, test: false, level: null, lite: false })
  })

  it('lit autostart, seed et test', () => {
    expect(parseBootOptions('?autostart=solo&seed=42&test=1')).toEqual({
      autostart: 'solo',
      seed: 42,
      test: true,
      level: null,
      lite: false
    })
  })

  it('accepte les modes coop et le niveau', () => {
    expect(parseBootOptions('?autostart=coop4&level=fondations')).toEqual({
      autostart: 'coop4',
      seed: 1,
      test: false,
      level: 'fondations',
      lite: false
    })
  })

  it('lit le mode allégé (lite)', () => {
    expect(parseBootOptions('?test=1&lite=1').lite).toBe(true)
    expect(parseBootOptions('?test=1').lite).toBe(false)
  })

  it('ignore un mode invalide (autostart=null)', () => {
    expect(parseBootOptions('?autostart=foo').autostart).toBeNull()
  })

  it('ignore une seed non numérique et garde le défaut', () => {
    expect(parseBootOptions('?seed=abc').seed).toBe(1)
  })
})
