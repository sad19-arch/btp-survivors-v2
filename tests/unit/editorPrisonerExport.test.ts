/**
 * Éditeur — OTAGE posable (Volet 1) : pose → export → round-trip → cuisson.
 *
 * Chemin identique aux destructibles : une entrée palette `prisoner:true` posée via
 * `addInstance` est cuite par `exportGameJson` en `EmbeddedElement.prisoner {}`
 * (non-bloquant), préservée par `parseLayout`, et routée par `composedToSiteLayout`
 * vers `SiteLayout.prisoners[]`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@/editor/EditorState'
import { parseLayout } from '@/editor/StageLayoutSchema'
import { composedToSiteLayout } from '@core/siteLayout'
import type { StageLayout } from '@content/stageLayout'

describe('Éditeur — otage posable', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('exportGameJson cuit l’otage en élément prisoner:{} NON-BLOQUANT', () => {
    const s = new EditorState('terrain_vierge')
    s.addInstance('otage', 120, -60)
    const out = JSON.parse(s.exportGameJson()) as StageLayout
    const el = out.instances[0]?.elements?.[0]
    expect(el?.assetKey).toBe('prisoner')
    expect(el?.collide).toBe('none')
    expect(el?.prisoner).toEqual({})
  })

  it('parseLayout PRÉSERVE le champ prisoner (round-trip, pas de perte au reload)', () => {
    const s = new EditorState('terrain_vierge')
    s.addInstance('otage', 0, 0)
    const parsed = parseLayout(s.exportGameJson(), 'terrain_vierge')
    expect(parsed.ok).toBe(true)
    expect(parsed.layout?.instances[0]?.elements?.[0]?.prisoner).toEqual({})
  })

  it('composedToSiteLayout route l’otage exporté vers prisoners[]', () => {
    const s = new EditorState('terrain_vierge')
    s.addInstance('otage', 200, 100)
    const out = JSON.parse(s.exportGameJson()) as StageLayout
    const site = composedToSiteLayout(out)
    expect(site.prisoners?.length).toBe(1)
  })
})
