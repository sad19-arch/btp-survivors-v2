import { describe, expect, it } from 'vitest'
import { CLUSTERS, liveEngineFor } from '@content/clusters'
import type { ClusterDef, ClusterElement } from '@content/clusters'
import { SITE_PROGRAMS } from '@content/sitePrograms'
import { buildSiteLayout } from '@core/siteLayout'
import { buildSitePlan, rectGap } from '@core/sitePlan'
import type { PlacedZone, SitePlan } from '@core/sitePlan'

const W = 10240
const H = 7680
const STAGE = 'fondations'
const SEEDS = [1, 2, 42, 123, 20260708]
const SPAWN = { x: W / 2, y: H / 2 }

const FOUNDATION_SCENES = new Set([
  'scene_foundation_pour_spawn',
  'scene_formwork_bay_active',
  'scene_rebar_ready',
  'scene_rebar_stock',
  'scene_mixer_waiting',
  'scene_small_mixer_patch',
  'scene_concrete_defect_minor',
  'scene_layout_implantation',
  'scene_concrete_preparation',
  'scene_footing_reinforced',
  'scene_slab_in_progress',
  'scene_curing_zone',
])

const REQUIRED_TRADE_SCENES = [
  'scene_foundation_pour_spawn',
  'scene_layout_implantation',
  'scene_concrete_preparation',
  'scene_formwork_bay_active',
  'scene_rebar_stock',
  'scene_footing_reinforced',
  'scene_slab_in_progress',
  'scene_curing_zone',
] as const

function definedCluster(id: string): ClusterDef {
  const def = CLUSTERS[id]
  expect(def, `cluster ${id} missing`).toBeDefined()
  if (def === undefined) {
    throw new Error(`cluster ${id} missing`)
  }
  return def
}

function planFor(seed: number): SitePlan {
  const plan = buildSitePlan(seed, W, H, STAGE)
  expect(plan, 'stage 03 must use SITE_PROGRAMS').not.toBeNull()
  if (plan === null) {
    throw new Error('missing fondations plan')
  }
  return plan
}

function zone(plan: SitePlan, id: string): PlacedZone {
  const z = plan.zones.find((candidate) => candidate.id === id)
  expect(z, `zone ${id} missing`).toBeDefined()
  if (z === undefined) {
    throw new Error(`zone ${id} missing`)
  }
  return z
}

/**
 * Les éléments d'un cluster pour un asset, DÉSIGNÉ PAR SA CLÉ STATIQUE.
 *
 * Ces contrats parlent de sémantique de chantier (« la toupie est près de la
 * pompe », « la coulure est près du béton ») : que la toupie soit posée statique
 * ou sous sa variante ANIMÉE (`LIVE_ENGINES`, machines vivantes) n'y change rien.
 * On résout donc la variante ici, une fois, pour que les tests continuent de
 * nommer les engins par leur nom métier.
 */
function elements(def: ClusterDef, assetKey: string): ClusterElement[] {
  const posed = liveEngineFor(assetKey)?.workKey ?? assetKey
  return def.elements.filter((el) => el.assetKey === posed)
}

function dist(a: ClusterElement, b: ClusterElement): number {
  return Math.hypot(a.dx - b.dx, a.dy - b.dy)
}

function placedSignature(seed: number): { x: number; y: number } {
  const layout = buildSiteLayout(seed, W, H, STAGE)
  const sig = layout.clusters.find((c) => c.defId === 'scene_foundation_pour_spawn')
  expect(sig).toBeDefined()
  if (sig === undefined) {
    throw new Error('signature missing')
  }
  return { x: sig.x, y: sig.y }
}

describe('stage 03 fondations - composition contract', () => {
  it('uses a semantic site program with one signature prefab', () => {
    const program = SITE_PROGRAMS[STAGE]
    expect(program).toBeDefined()
    const signatureZones = program?.zones.filter((z) => z.signature === true) ?? []
    expect(signatureZones).toHaveLength(1)
    expect(signatureZones[0]?.id).toBe('zone_coulage_principal')
    const signaturePrefabs = signatureZones[0]?.prefabs?.filter(
      (pf) => pf.clusterId === 'scene_foundation_pour_spawn'
    ) ?? []
    expect(signaturePrefabs).toHaveLength(1)
    expect(signaturePrefabs[0]?.count).toBe(1)
  })

  it.each(SEEDS)('signature is unique and visible from spawn (seed %i)', (seed) => {
    const layout = buildSiteLayout(seed, W, H, STAGE)
    const signatures = layout.clusters.filter((c) => c.defId === 'scene_foundation_pour_spawn')
    expect(signatures).toHaveLength(1)
    const sig = signatures[0]
    expect(sig).toBeDefined()
    if (sig !== undefined) {
      expect(Math.hypot(sig.x - SPAWN.x, sig.y - SPAWN.y)).toBeLessThanOrEqual(900)
    }
  })

  it.each(SEEDS)('no foundation-important asset is orphaned in the actual layout (seed %i)', (seed) => {
    const layout = buildSiteLayout(seed, W, H, STAGE)
    for (const placed of layout.clusters) {
      const def = definedCluster(placed.defId)
      const hasStage03Asset = def.elements.some((el) => el.assetKey.includes('stage03'))
      if (!hasStage03Asset) {
        continue
      }
      expect(
        FOUNDATION_SCENES.has(placed.defId),
        `${placed.defId} contains stage03 assets but is not an allowed causal scene`
      ).toBe(true)
    }
  })

  it.each(SEEDS)('places all eight trade scenes and three fresh-concrete surfaces (seed %i)', (seed) => {
    const layout = buildSiteLayout(seed, W, H, STAGE)
    const ids = new Set(layout.clusters.map((cluster) => cluster.defId))
    for (const sceneId of REQUIRED_TRADE_SCENES) {
      expect(ids.has(sceneId), `${sceneId} missing`).toBe(true)
    }
    expect(layout.slowZones).toHaveLength(3)
    for (const zone of layout.slowZones ?? []) {
      expect(zone.multiplier).toBe(0.62)
      expect(zone.radius).toBeGreaterThanOrEqual(90)
    }
  })

  it('signature groups slab, bay, rebar, pump, mixer and spill with valid distances', () => {
    const def = definedCluster('scene_foundation_pour_spawn')
    for (const assetKey of [
      'landmark_stage03',
      'struct_stage03_bay',
      'prop_stage03_rebar',
      'prop_stage03_formwork',
      'struct_stage03_pump',
      'struct_stage03_mixer',
      'decal_stage03_spill',
    ]) {
      expect(elements(def, assetKey).length, `${assetKey} missing from signature`).toBeGreaterThan(0)
    }

    const pump = elements(def, 'struct_stage03_pump')[0]
    const mixer = elements(def, 'struct_stage03_mixer')[0]
    const slab = elements(def, 'landmark_stage03')[0]
    const bay = elements(def, 'struct_stage03_bay')[0]
    expect(pump).toBeDefined()
    expect(mixer).toBeDefined()
    expect(slab).toBeDefined()
    expect(bay).toBeDefined()
    if (pump === undefined || mixer === undefined || slab === undefined || bay === undefined) {
      throw new Error('signature machine target missing')
    }

    const pumpToTarget = Math.min(dist(pump, slab), dist(pump, bay))
    expect(pumpToTarget).toBeGreaterThanOrEqual(100)
    expect(pumpToTarget).toBeLessThanOrEqual(350)
    expect(dist(mixer, pump)).toBeGreaterThanOrEqual(100)
    expect(dist(mixer, pump)).toBeLessThanOrEqual(350)
  })

  it('signature reads as a concrete flow from mixer to pump to slab', () => {
    const def = definedCluster('scene_foundation_pour_spawn')
    const slab = elements(def, 'landmark_stage03')[0]
    const bay = elements(def, 'struct_stage03_bay')[0]
    const rebar = elements(def, 'prop_stage03_rebar')[0]
    const pump = elements(def, 'struct_stage03_pump')[0]
    const mixer = elements(def, 'struct_stage03_mixer')[0]
    const spills = elements(def, 'decal_stage03_spill')
    expect(slab).toBeDefined()
    expect(bay).toBeDefined()
    expect(rebar).toBeDefined()
    expect(pump).toBeDefined()
    expect(mixer).toBeDefined()
    if (
      slab === undefined ||
      bay === undefined ||
      rebar === undefined ||
      pump === undefined ||
      mixer === undefined
    ) {
      throw new Error('flow target missing')
    }

    expect(mixer.dx).toBeGreaterThan(pump.dx)
    expect(pump.dx).toBeGreaterThan(slab.dx)
    expect(mixer.flipX).toBe(true)
    expect(spills).toHaveLength(3)
    expect(dist(rebar, slab)).toBeLessThanOrEqual(110)
    expect(dist(bay, slab)).toBeLessThanOrEqual(90)
  })

  it.each(SEEDS)('spawn is on the immediate lower edge of the pour scene (seed %i)', (seed) => {
    const sig = placedSignature(seed)
    const def = definedCluster('scene_foundation_pour_spawn')
    const slab = elements(def, 'landmark_stage03')[0]
    const bay = elements(def, 'struct_stage03_bay')[0]
    const pump = elements(def, 'struct_stage03_pump')[0]
    const mixer = elements(def, 'struct_stage03_mixer')[0]
    expect(slab).toBeDefined()
    expect(bay).toBeDefined()
    expect(pump).toBeDefined()
    expect(mixer).toBeDefined()
    if (slab === undefined || bay === undefined || pump === undefined || mixer === undefined) {
      throw new Error('signature target missing')
    }

    const slabFromSpawn = { x: sig.x + slab.dx - SPAWN.x, y: sig.y + slab.dy - SPAWN.y }
    const bayFromSpawn = { x: sig.x + bay.dx - SPAWN.x, y: sig.y + bay.dy - SPAWN.y }
    const pumpFromSpawn = { x: sig.x + pump.dx - SPAWN.x, y: sig.y + pump.dy - SPAWN.y }
    const mixerFromSpawn = { x: sig.x + mixer.dx - SPAWN.x, y: sig.y + mixer.dy - SPAWN.y }

    expect(slabFromSpawn.y).toBeGreaterThanOrEqual(-230)
    expect(slabFromSpawn.y).toBeLessThanOrEqual(-120)
    expect(bayFromSpawn.y).toBeGreaterThanOrEqual(-260)
    expect(bayFromSpawn.y).toBeLessThanOrEqual(-160)
    expect(Math.hypot(pumpFromSpawn.x, pumpFromSpawn.y)).toBeLessThanOrEqual(360)
    expect(Math.hypot(mixerFromSpawn.x, mixerFromSpawn.y)).toBeLessThanOrEqual(460)
  })

  it.each(SEEDS)('main pour zone and paths do not create an empty crossroad spawn (seed %i)', (seed) => {
    const plan = planFor(seed)
    const active = zone(plan, 'zone_coulage_principal')
    const stock = zone(plan, 'zone_stock_ferraillage')

    expect(active.halfW).toBeLessThanOrEqual(1200)
    expect(active.halfH).toBeLessThanOrEqual(800)
    expect(stock.cy).toBeLessThan(SPAWN.y)

    const horizontalAtSpawn = plan.paths.filter(
      (path) => path.y1 === path.y2 && Math.abs(path.y1 - SPAWN.y) <= 220
    )
    expect(horizontalAtSpawn).toHaveLength(0)
  })

  it.each(SEEDS)('stock, access, active zone and base vie respect distances (seed %i)', (seed) => {
    const plan = planFor(seed)
    const active = zone(plan, 'zone_coulage_principal')
    const stock = zone(plan, 'zone_stock_ferraillage')
    const access = zone(plan, 'zone_acces_beton')
    const baseVie = zone(plan, 'zone_base_vie')

    const stockGap = rectGap(stock, active)
    expect(stockGap).toBeGreaterThanOrEqual(400)
    expect(stockGap).toBeLessThanOrEqual(1600)
    expect(rectGap(access, active)).toBeLessThanOrEqual(1600)
    expect(rectGap(baseVie, active)).toBeGreaterThanOrEqual(900)
  })

  it.each(SEEDS)('spawn has no blocking footprint within 350px (seed %i)', (seed) => {
    const layout = buildSiteLayout(seed, W, H, STAGE)
    for (const placed of layout.clusters) {
      const def = definedCluster(placed.defId)
      for (const el of def.elements) {
        if (el.collide === 'none') {
          continue
        }
        const d = Math.hypot(placed.x + el.dx - SPAWN.x, placed.y + el.dy - SPAWN.y)
        expect(d, `${placed.defId}/${el.assetKey} blocks spawn`).toBeGreaterThanOrEqual(350)
      }
    }
  })

  it.each(SEEDS)('foundation-specific forbidden assets are not violated (seed %i)', (seed) => {
    const layout = buildSiteLayout(seed, W, H, STAGE)
    const usedDefs = layout.clusters.map((c) => definedCluster(c.defId))

    const crackCount = usedDefs.reduce(
      (sum, def) => sum + elements(def, 'decal_stage03_crack').length,
      0
    )
    expect(crackCount).toBeLessThanOrEqual(1)

    for (const def of usedDefs) {
      if (elements(def, 'prop_stage03_concrete_mixer').length > 0) {
        const supportingTools =
          elements(def, 'prop_stage03_formwork').length +
          elements(def, 'prop_stage03_bag_open').length +
          elements(def, 'prop_stage03_wheelbarrow_concrete').length
        expect(supportingTools).toBeGreaterThan(0)
      }

      if (elements(def, 'prop_stage03_rebar').length > 0) {
        expect(
          FOUNDATION_SCENES.has(def.id),
          `${def.id} has rebar outside an allowed foundation scene`
        ).toBe(true)
      }

      for (const spill of elements(def, 'decal_stage03_spill')) {
        // Clés statiques ; `elements()` résout la variante animée le cas échéant.
        const concreteTargets = [
          'landmark_stage03',
          'struct_stage03_bay',
          'prop_stage03_formwork',
          'prop_stage03_concrete_mixer',
          'struct_stage03_mixer',
          'decal_stage03_crack'
        ].flatMap((key) => elements(def, key))
        const nearest = Math.min(...concreteTargets.map((target) => dist(spill, target)))
        expect(nearest, `${def.id} has a spill too far from concrete work`).toBeLessThanOrEqual(250)
      }
    }
  })
})
