import { describe, it, expect, afterEach } from 'vitest'
import { setRuntimeLayout, resolveComposedLayout } from '@content/runtimeLayouts'
import { getComposedLayout } from '@content/composedLayouts'
import { emptyLayout } from '@content/stageLayout'

/**
 * Override runtime des compositions (layout édité par le joueur, injecté au boot).
 * Garde-fou clé : sans override, `resolveComposedLayout` DOIT retomber exactement
 * sur la compo committée (`getComposedLayout`) → déterminisme sim préservé (le
 * harness/e2e n'appellent jamais `setRuntimeLayout`).
 */
describe('runtimeLayouts (override runtime des compos)', () => {
  afterEach(() => {
    // Nettoyage : on retire tout override posé par un test.
    setRuntimeLayout('terrassement', null)
    setRuntimeLayout('terrain_vierge', null)
  })

  it('sans override : resolveComposedLayout === getComposedLayout (parité sim)', () => {
    expect(resolveComposedLayout('terrassement')).toBe(getComposedLayout('terrassement'))
    expect(resolveComposedLayout('terrain_vierge')).toBe(getComposedLayout('terrain_vierge'))
  })

  it('avec override : resolveComposedLayout renvoie le layout injecté', () => {
    const custom = emptyLayout('terrassement')
    custom.spawn = { x: 123, y: -45 }
    setRuntimeLayout('terrassement', custom)
    const resolved = resolveComposedLayout('terrassement')
    expect(resolved).toBe(custom)
    expect(resolved?.spawn).toEqual({ x: 123, y: -45 })
  })

  it('setRuntimeLayout(stage, null) retire l\'override et rétablit la compo committée', () => {
    setRuntimeLayout('terrassement', emptyLayout('terrassement'))
    setRuntimeLayout('terrassement', null)
    expect(resolveComposedLayout('terrassement')).toBe(getComposedLayout('terrassement'))
  })

  it('un override sur un stage n\'affecte pas les autres stages', () => {
    setRuntimeLayout('terrassement', emptyLayout('terrassement'))
    expect(resolveComposedLayout('terrain_vierge')).toBe(getComposedLayout('terrain_vierge'))
  })
})
