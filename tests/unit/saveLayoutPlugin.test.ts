import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

const temporaryRepositories: string[] = []

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true })
  }
})

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

  it('refuse un identifiant hors du registre fermé des dix stages', () => {
    expect(validate('../hors-depot', layoutJson('../hors-depot'))).toBe('stage invalide')
  })
})

describe('saveLayoutPlugin — publication officielle', () => {
  it('écrit le JSON et régénère le registre dans une racine temporaire', () => {
    const repository = mkdtempSync(join(tmpdir(), 'btp-layout-publication-'))
    temporaryRepositories.push(repository)
    const json = layoutJson('terrassement')

    const result = saveLayout.publishOfficialLayout('terrassement', json, repository)

    expect(result).toEqual({
      stage: 'terrassement',
      layoutPath: 'src/content/layouts/terrassement.json',
      registryPath: 'src/content/composedLayouts.ts'
    })
    expect(readFileSync(join(repository, result.layoutPath), 'utf8')).toBe(json)
    const registry = readFileSync(join(repository, result.registryPath), 'utf8')
    expect(registry).toContain("import l0 from './layouts/terrassement.json'")
    expect(registry).toContain("'terrassement': l0 as unknown as StageLayout")
  })

  it('ne crée aucun fichier quand le stage tente de sortir du registre officiel', () => {
    const repository = mkdtempSync(join(tmpdir(), 'btp-layout-publication-'))
    temporaryRepositories.push(repository)

    expect(() =>
      saveLayout.publishOfficialLayout('../hors-depot', layoutJson('../hors-depot'), repository)
    ).toThrow('stage invalide')
    expect(existsSync(join(repository, 'src'))).toBe(false)
  })
})
