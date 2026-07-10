import { describe, it, expect } from 'vitest'
import { composedToSiteLayout } from '@core/siteLayout'
import { CLUSTERS } from '@content/clusters'
import { emptyLayout, type StageLayout, type LayoutInstance } from '@content/stageLayout'

const OFF_X = 10240 / 2
const OFF_Y = 7680 / 2

function withInstances(insts: LayoutInstance[]): StageLayout {
  const l = emptyLayout('fondations')
  l.instances = insts
  return l
}

function inst(partial: Partial<LayoutInstance> & { prefab: string }): LayoutInstance {
  return { id: 'i', x: 0, y: 0, flipX: false, variant: 0, rotation: 0, locked: false, ...partial }
}

describe('composedToSiteLayout', () => {
  it('layout vide → clusters et obstacles vides', () => {
    const out = composedToSiteLayout(emptyLayout('fondations'))
    expect(out.clusters).toEqual([])
    expect(out.obstacles).toEqual([])
  })

  it('convertit les coordonnées composition (centre monde = origine) en monde', () => {
    const clusterId = Object.keys(CLUSTERS)[0] as string
    const out = composedToSiteLayout(withInstances([inst({ prefab: clusterId, x: 120, y: -420 })]))
    expect(out.clusters).toHaveLength(1)
    expect(out.clusters[0]?.x).toBe(OFF_X + 120)
    expect(out.clusters[0]?.y).toBe(OFF_Y - 420)
    expect(out.clusters[0]?.defId).toBe(clusterId)
  })

  it('un prefab = un cluster connu → collision fine héritée du ClusterDef', () => {
    // scene_dig_active_spawn a des éléments collidables (trou + engins).
    const out = composedToSiteLayout(withInstances([inst({ prefab: 'scene_dig_active_spawn', x: 0, y: 0 })]))
    expect(out.obstacles.length).toBeGreaterThan(0)
  })

  it('prefab inline collide:both (sans shape) → obstacle circulaire déduit à la bonne position', () => {
    const out = composedToSiteLayout(
      withInstances([
        inst({
          prefab: 'obj_inconnu',
          x: 200,
          y: 100,
          elements: [{ assetKey: 'x', dx: 50, dy: 0, scale: 1, collide: 'both' }]
        })
      ])
    )
    expect(out.clusters).toHaveLength(1)
    expect(out.clusters[0]?.elements).toHaveLength(1)
    const circ = out.obstacles.find((o) => o.kind === 'circle')
    expect(circ).toBeDefined()
    expect(circ?.x).toBe(OFF_X + 200 + 50)
    expect(circ?.y).toBe(OFF_Y + 100)
  })

  it('collide:both avec shape segment (clôture) → obstacle segment préservé', () => {
    const out = composedToSiteLayout(
      withInstances([
        inst({
          prefab: 'obj_cloture',
          x: 0,
          y: 0,
          elements: [
            { assetKey: 'fence', dx: 10, dy: 20, scale: 1, collide: 'both', shape: { kind: 'segment', x2: 80, y2: 0, thickness: 10 } }
          ]
        })
      ])
    )
    const seg = out.obstacles.find((o) => o.kind === 'segment')
    expect(seg).toBeDefined()
    expect(seg?.x).toBe(OFF_X + 10)
    expect(seg?.y).toBe(OFF_Y + 20)
    if (seg?.kind === 'segment') {
      expect(seg.x2).toBe(OFF_X + 10 + 80)
      expect(seg.y2).toBe(OFF_Y + 20)
    }
  })

  it('collide:enemies → obstacle qui ne bloque que les ennemis', () => {
    const out = composedToSiteLayout(
      withInstances([
        inst({ prefab: 'p', x: 0, y: 0, elements: [{ assetKey: 'e', dx: 0, dy: 0, scale: 1, collide: 'enemies', shape: { kind: 'circle', r: 40 } }] })
      ])
    )
    const circ = out.obstacles.find((o) => o.kind === 'circle')
    expect(circ?.blocks).toBe('enemies')
  })

  it('prefab inline collide:none → aucun obstacle', () => {
    const out = composedToSiteLayout(
      withInstances([
        inst({ prefab: 'obj_decor', x: 0, y: 0, elements: [{ assetKey: 'd', dx: 0, dy: 0, scale: 1, collide: 'none' }] })
      ])
    )
    expect(out.obstacles).toEqual([])
  })

  it('flipX miroir l\'offset de l\'élément inline', () => {
    const base = composedToSiteLayout(
      withInstances([inst({ prefab: 'p', x: 0, y: 0, elements: [{ assetKey: 'x', dx: 60, dy: 0, scale: 1, collide: 'both' }] })])
    )
    const flipped = composedToSiteLayout(
      withInstances([inst({ prefab: 'p', x: 0, y: 0, flipX: true, elements: [{ assetKey: 'x', dx: 60, dy: 0, scale: 1, collide: 'both' }] })])
    )
    expect(base.obstacles[0]?.x).toBe(OFF_X + 60)
    expect(flipped.obstacles[0]?.x).toBe(OFF_X - 60)
  })

  it('prefab inconnu SANS éléments → ignoré', () => {
    const out = composedToSiteLayout(withInstances([inst({ prefab: 'nexiste_pas', x: 0, y: 0 })]))
    expect(out.clusters).toEqual([])
    expect(out.obstacles).toEqual([])
  })

  it('déterministe : mêmes entrées ⇒ même sortie', () => {
    const l = withInstances([inst({ prefab: 'scene_dig_active_spawn', x: 10, y: 20 })])
    expect(composedToSiteLayout(l)).toEqual(composedToSiteLayout(l))
  })
})
