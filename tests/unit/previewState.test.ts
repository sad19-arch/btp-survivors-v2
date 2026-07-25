import { describe, it, expect } from 'vitest'
import { buildPreviewViewState } from '@/editor/previewState'

/**
 * L'état synthétique de preview projette le strict nécessaire pour SiteWorkers :
 * un « joueur » au centre caméra + zéro ennemi (vie calme, sans combat).
 */
describe('buildPreviewViewState', () => {
  it('place le joueur synthétique au point fourni (centre caméra)', () => {
    const s = buildPreviewViewState(1234, 5678)
    expect(s.players[0]?.x).toBe(1234)
    expect(s.players[0]?.y).toBe(5678)
  })

  it('aucun ennemi → pas de fuite, vie calme', () => {
    const s = buildPreviewViewState(0, 0)
    expect(s.enemies).toEqual([])
  })
})
