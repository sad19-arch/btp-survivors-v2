import { describe, expect, it } from 'vitest'
import * as saveLayout from '../../tools/vite/saveLayoutPlugin'

const CANONICAL_ZONES = [
  'signature_zone',
  'zone_access',
  'zone_storage',
  'zone_secondary',
  'zone_atmosphere'
] as const

type SaveLayoutModule = typeof saveLayout & {
  validateSaveLayoutRequest?: (stage: string, json: string) => string | null
}

function layoutJson(stage: string, markerTypes = [...CANONICAL_ZONES]): string {
  return JSON.stringify({
    stage,
    markers: markerTypes.map((type, index) => ({ id: `zone_${index}`, type, x: index, y: 0, w: 1, h: 1 }))
  })
}

describe('saveLayoutPlugin — garde avant écriture', () => {
  function validate(stage: string, json: string): string | null {
    const fn = (saveLayout as SaveLayoutModule).validateSaveLayoutRequest
    expect(fn).toBeTypeOf('function')
    if (fn === undefined) {return 'validateur absent'}
    return fn(stage, json)
  }

  it('refuse un JSON dont le stage interne diffère de la route demandée', () => {
    expect(validate('terrassement', layoutJson('fondations'))).toBe('stage JSON incohérent')
  })

  it('refuse une zone canonique manquante', () => {
    expect(validate('terrassement', layoutJson('terrassement', CANONICAL_ZONES.slice(0, -1)))).toBe(
      'zones canoniques invalides'
    )
  })

  it('refuse une zone canonique dupliquée', () => {
    expect(validate('terrassement', layoutJson('terrassement', [...CANONICAL_ZONES, 'zone_access']))).toBe(
      'zones canoniques invalides'
    )
  })

  it('accepte exactement les cinq zones canoniques', () => {
    expect(validate('terrassement', layoutJson('terrassement'))).toBeNull()
  })
})
