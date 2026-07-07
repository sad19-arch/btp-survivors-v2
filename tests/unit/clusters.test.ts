import { describe, it, expect } from 'vitest'
import { CLUSTERS, STAGE_CLUSTERS } from '@content/clusters'

/**
 * Intégrité des prefabs de clusters (T1 — data pure).
 * Ces tests valident les invariants structurels des définitions de clusters ;
 * ils ne testent pas le placement (T2) ni le rendu (T3).
 */
describe('CLUSTERS — intégrité des définitions', () => {
  it('1. toute assetKey est une chaîne non vide', () => {
    for (const [clusterId, def] of Object.entries(CLUSTERS)) {
      for (const el of def.elements) {
        expect(
          el.assetKey.length > 0,
          `${clusterId}: assetKey vide dans un élément`
        ).toBe(true)
      }
    }
  })

  it('2. cohérence collide / shape : collide!=="none" ⇒ shape défini ; collide==="none" ⇒ shape absent', () => {
    for (const [clusterId, def] of Object.entries(CLUSTERS)) {
      for (const el of def.elements) {
        if (el.collide !== 'none') {
          expect(
            el.shape,
            `${clusterId} assetKey="${el.assetKey}" collide="${el.collide}" mais shape absent`
          ).toBeDefined()
        } else {
          expect(
            el.shape,
            `${clusterId} assetKey="${el.assetKey}" collide="none" mais shape présent`
          ).toBeUndefined()
        }
      }
    }
  })

  it('3. tout cluster ayant au moins un élément collidable a gates.length >= 1', () => {
    for (const [clusterId, def] of Object.entries(CLUSTERS)) {
      const hasCollidable = def.elements.some((el) => el.collide !== 'none')
      if (hasCollidable) {
        expect(
          def.gates.length >= 1,
          `${clusterId} a des éléments collidables mais aucun gate (enclos 100 % fermé)`
        ).toBe(true)
      }
    }
  })

  it('4. footprintRadius > 0 et ≥ à la distance max (|dx,dy|) de ses éléments', () => {
    for (const [clusterId, def] of Object.entries(CLUSTERS)) {
      expect(def.footprintRadius, `${clusterId}: footprintRadius <= 0`).toBeGreaterThan(0)

      for (const el of def.elements) {
        const dist = Math.sqrt(el.dx * el.dx + el.dy * el.dy)
        expect(
          def.footprintRadius >= dist,
          `${clusterId} assetKey="${el.assetKey}" dist=${dist.toFixed(1)} > footprintRadius=${def.footprintRadius}`
        ).toBe(true)
      }
    }
  })
})

describe('STAGE_CLUSTERS — intégrité', () => {
  it('5. STAGE_CLUSTERS["terrain_vierge"] est [] (garde sim:check)', () => {
    expect(STAGE_CLUSTERS['terrain_vierge']).toEqual([])
  })

  it('6a. tout clusterId référencé dans STAGE_CLUSTERS existe dans CLUSTERS', () => {
    for (const [stageId, entries] of Object.entries(STAGE_CLUSTERS)) {
      for (const entry of entries) {
        expect(
          CLUSTERS[entry.clusterId],
          `stage "${stageId}" référence clusterId "${entry.clusterId}" qui n'existe pas dans CLUSTERS`
        ).toBeDefined()
      }
    }
  })

  it('6b. tout role référencé dans STAGE_CLUSTERS est une chaîne non vide cohérente', () => {
    const validRoles = new Set(['route', 'excavation', 'spoil', 'plant', 'pause'])
    for (const [stageId, entries] of Object.entries(STAGE_CLUSTERS)) {
      for (const entry of entries) {
        expect(
          entry.role.length > 0,
          `stage "${stageId}": role vide`
        ).toBe(true)
        expect(
          validRoles.has(entry.role),
          `stage "${stageId}": role "${entry.role}" inconnu (valides: ${[...validRoles].join(', ')})`
        ).toBe(true)
      }
    }
  })
})
