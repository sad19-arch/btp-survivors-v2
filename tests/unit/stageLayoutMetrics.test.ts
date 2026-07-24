import { describe, expect, it } from 'vitest'
import {
  canonicalZoneCenters,
  clutterCells,
  continuityAnchorDrift,
  distanceBetween,
  isAtLeastDistance,
  isWithinDistance,
  markerCenter,
} from '@content/stageLayoutMetrics'
import { emptyLayout, type LayoutInstance, type StageLayout } from '@content/stageLayout'

function layoutWithInstances(instances: LayoutInstance[]): StageLayout {
  return { ...emptyLayout('synthetic'), instances }
}

function instance(id: string, x: number, y: number, elements: LayoutInstance['elements']): LayoutInstance {
  const value: LayoutInstance = { id, prefab: 'obj_prop_test', x, y, flipX: false, variant: 0, rotation: 0, locked: false }
  if (elements !== undefined) {value.elements = elements}
  return value
}

describe('stage layout metrics', () => {
  it('maps the five canonical marker centers by zone letter', () => {
    const layout = emptyLayout('synthetic')
    layout.markers = [
      { id: 'a', type: 'signature_zone', x: -100, y: -50, w: 200, h: 100 },
      { id: 'b', type: 'zone_access', x: 100, y: 50, w: 100, h: 100 },
      { id: 'c', type: 'zone_storage', x: 300, y: 50, w: 100, h: 100 },
      { id: 'd', type: 'zone_secondary', x: 500, y: 50, w: 100, h: 100 },
      { id: 'e', type: 'zone_atmosphere', x: 700, y: 50, w: 100, h: 100 },
    ]

    const signature = layout.markers[0]
    if (signature === undefined) {throw new Error('marqueur A absent')}
    expect(markerCenter(signature)).toEqual({ x: 0, y: 0 })
    expect(canonicalZoneCenters(layout)).toEqual({
      A: { x: 0, y: 0 }, B: { x: 150, y: 100 }, C: { x: 350, y: 100 }, D: { x: 550, y: 100 }, E: { x: 750, y: 100 },
    })
  })

  it('provides causal distance boundaries without rounding ambiguity', () => {
    const active = { x: 0, y: 0 }
    expect(distanceBetween(active, { x: 100, y: 0 })).toBe(100)
    expect(isWithinDistance(active, { x: 350, y: 0 }, 350)).toBe(true)
    expect(isWithinDistance(active, { x: 350.01, y: 0 }, 350)).toBe(false)
    expect(isWithinDistance(active, { x: 250, y: 0 }, 250)).toBe(true)
    expect(isAtLeastDistance(active, { x: 600, y: 0 }, 600)).toBe(true)
    expect(isAtLeastDistance(active, { x: 599.99, y: 0 }, 600)).toBe(false)
  })

  it('deduplicates visible prop and decal clutter into 320px cells', () => {
    const layout = layoutWithInstances([
      instance('prop-a', 10, 10, [{ assetKey: 'a', dx: 0, dy: 0, scale: 1, layer: 'prop' }]),
      instance('decal-same-cell', 319, 319, [{ assetKey: 'b', dx: 0, dy: 0, scale: 1, layer: 'decal' }]),
      instance('prop-next-cell', 320, 10, [{ assetKey: 'c', dx: 0, dy: 0, scale: 1, layer: 'prop' }]),
      instance('multi-element', 0, 640, [
        { assetKey: 'd', dx: 0, dy: 0, scale: 1, layer: 'prop' },
        { assetKey: 'e', dx: 330, dy: 0, scale: 1, layer: 'decal' },
      ]),
    ])

    expect([...clutterCells(layout)].sort()).toEqual(['0:0', '0:2', '1:0', '1:2'])
  })

  it('excludes perimeter, continuity, prisoners, paths, and NPCs from clutter', () => {
    const layout = layoutWithInstances([
      { ...instance('perimeter', 0, 0, [{ assetKey: 'building', dx: 0, dy: 0, scale: 1, layer: 'prop' }]), prefab: 'obj_building_apartment' },
      { ...instance('continuity', 320, 0, [{ assetKey: 'shell', dx: 0, dy: 0, scale: 1, layer: 'prop' }]), prefab: 'obj_continuity_stage05_shell' },
      instance('prisoner', 640, 0, [{ assetKey: 'prisoner', dx: 0, dy: 0, scale: 1, prisoner: {} }]),
      instance('structure', 960, 0, [{ assetKey: 'wall', dx: 0, dy: 0, scale: 1, layer: 'struct' }]),
      instance('destructible', 1280, 0, [{ assetKey: 'crate', dx: 0, dy: 0, scale: 1, destructible: { typeId: 'crate' } }]),
    ])
    layout.paths = [{ id: 'path', type: 'worker_path', points: [{ x: 1600, y: 0 }, { x: 1920, y: 0 }] }]
    layout.npcs = [{ id: 'npc', skin: 'worker', kind: 'worker', x: 2240, y: 0 }]

    expect([...clutterCells(layout)]).toEqual(['4:0'])
  })

  it('measures continuity anchor drift across layouts', () => {
    const before = layoutWithInstances([{ ...instance('shell', 100, 200, []), prefab: 'obj_continuity_stage05_shell' }])
    const after = layoutWithInstances([{ ...instance('shell', 280, 440, []), prefab: 'obj_continuity_stage05_shell' }])

    expect(continuityAnchorDrift(before, after, 'obj_continuity_stage05_shell')).toBe(300)
  })
})
