import { describe, it, expect } from 'vitest'
import { parseLayout } from '@/editor/StageLayoutSchema'

/**
 * `keepSitePlan` doit SURVIVRE à l'aller-retour sauvegarde → chargement.
 * `parseLayout` a déjà perdu `destructible`, `layer`, `tile` et les réglages
 * de chemin en silence : un champ non recopié ici disparaît sans erreur.
 */

function layoutWith(extra: Record<string, unknown>): string {
  return JSON.stringify({
    version: 1,
    stage: 'terrain_vierge',
    worldSize: { width: 10240, height: 7680 },
    instances: [],
    ...extra
  })
}

describe('parseLayout — keepSitePlan PRÉSERVÉ', () => {
  it('une compo avec keepSitePlan:false survit à parseLayout', () => {
    const res = parseLayout(layoutWith({ keepSitePlan: false }), 'terrain_vierge')
    expect(res.ok).toBe(true)
    if (res.layout === undefined) { throw new Error("parseLayout n'a rien rendu") }
    expect(res.layout.keepSitePlan).toBe(false)
  })

  it('keepSitePlan absent ⇒ undefined (pas false : aucune migration silencieuse)', () => {
    const res = parseLayout(layoutWith({}), 'terrain_vierge')
    expect(res.ok).toBe(true)
    if (res.layout === undefined) { throw new Error("parseLayout n'a rien rendu") }
    expect(res.layout.keepSitePlan).toBeUndefined()
  })
})
