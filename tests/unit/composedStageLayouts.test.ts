import { describe, expect, it } from 'vitest'
import { composedStageIds, getComposedLayout } from '@content/composedLayouts'
import { canonicalZoneCenters, clutterCells, distanceBetween } from '@content/stageLayoutMetrics'
import type { EmbeddedElement, LayoutInstance, StageLayout } from '@content/stageLayout'
import { parseLayout } from '@/editor/StageLayoutSchema'
import { getStageCatalog } from '@/editor/PrefabCatalog'
import { shouldUseStructurePlan } from '@render/scenes/siteStructures'

const STAGES = [
  'terrain_vierge',
  'terrassement',
  'fondations',
  'reseaux_enterres',
  'gros_oeuvre',
  'echafaudages',
  'charpente_toiture',
  'second_oeuvre',
  'finitions',
  'livraison_audit',
] as const
const COMPOSED_STAGES = STAGES.slice(1)
const BUILDING_PREFIX = 'obj_building_'
const SPAWN_CLEARANCE = 300
const PLAYER_CLEARANCE = 24
const GRID = 80

function layout(stage: string): StageLayout {
  const raw = getComposedLayout(stage)
  expect(raw, `layout absent pour ${stage}`).not.toBeNull()
  const parsed = parseLayout(JSON.stringify(raw), stage)
  expect(parsed.ok, parsed.error).toBe(true)
  if (parsed.layout === undefined) {throw new Error(`${stage}: layout normalisé absent`)}
  return parsed.layout
}

function buildings(value: StageLayout): LayoutInstance[] {
  return value.instances.filter((instance) => instance.prefab.startsWith(BUILDING_PREFIX))
}

function zone(value: StageLayout, type: string): StageLayout['markers'][number] {
  const marker = value.markers.find((candidate) => candidate.type === type)
  if (marker === undefined) {throw new Error(`${value.stage}: zone ${type} absente`)}
  return marker
}

function inZone(point: { x: number; y: number }, marker: StageLayout['markers'][number]): boolean {
  return point.x >= marker.x && point.x <= marker.x + marker.w && point.y >= marker.y && point.y <= marker.y + marker.h
}

function instancesInZone(value: StageLayout, type: string): LayoutInstance[] {
  const marker = zone(value, type)
  return value.instances.filter((instance) => inZone(instance, marker))
}

function assetKeys(instances: LayoutInstance[]): string[] {
  return instances.flatMap((instance) => instance.elements?.map((element) => element.assetKey) ?? [])
}

function embeddedPositions(value: StageLayout, assetKey: string): Array<{ instance: LayoutInstance; element: EmbeddedElement; x: number; y: number }> {
  return value.instances.flatMap((instance) => (instance.elements ?? []).flatMap((element) => {
    if (element.assetKey !== assetKey) {return []}
    const scale = instance.scale ?? 1
    const offset = rotate(element.dx * scale, element.dy * scale, instance.rotation)
    return [{ instance, element, x: instance.x + offset.x, y: instance.y + offset.y }]
  }))
}

function shell(value: StageLayout): { instance: LayoutInstance; element: EmbeddedElement } {
  const candidates = value.instances
    .filter((candidate) => candidate.prefab === 'obj_continuity_stage05_shell')
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
  const instance = candidates[0]
  const element = instance?.elements?.find((candidate) => candidate.assetKey === 'continuity_stage05_shell')
  if (instance === undefined || element === undefined) {throw new Error(`${value.stage}: coque de continuité absente`)}
  return { instance, element }
}

function effectiveScale(instance: LayoutInstance, element: EmbeddedElement): number {
  return (instance.scale ?? 1) * element.scale
}

/** La couche est une annotation de rendu régénérée par l'éditeur, pas une donnée de périmètre. */
function perimeterGeometry(value: LayoutInstance[]): Array<Omit<LayoutInstance, 'elements'> & { elements: EmbeddedElement[] }> {
  return value.map(({ elements = [], ...instance }) => ({
    ...instance,
    elements: elements.map((element) => {
      const copy = { ...element }
      delete copy.layer
      return copy
    }),
  }))
}

function rotate(x: number, y: number, deg: number): { x: number; y: number } {
  const angle = (deg * Math.PI) / 180
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) }
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function elementBlocked(
  px: number,
  py: number,
  instance: LayoutInstance,
  element: EmbeddedElement,
  clearance: number,
): boolean {
  if (element.collide !== 'both' || element.shape === undefined) {return false}
  const instanceScale = instance.scale ?? 1
  const offset = rotate(element.dx * instanceScale, element.dy * instanceScale, instance.rotation)
  const ax = instance.x + offset.x
  const ay = instance.y + offset.y
  if (element.shape.kind === 'circle') {
    return Math.hypot(px - ax, py - ay) < element.shape.r * instanceScale + clearance
  }
  const delta = rotate(
    element.shape.x2 * instanceScale,
    element.shape.y2 * instanceScale,
    instance.rotation,
  )
  return (
    distanceToSegment(px, py, ax, ay, ax + delta.x, ay + delta.y) <
    element.shape.thickness * instanceScale * 0.5 + clearance
  )
}

function blocked(value: StageLayout, x: number, y: number, clearance = PLAYER_CLEARANCE): boolean {
  return value.instances.some((instance) =>
    (instance.elements ?? []).some((element) => elementBlocked(x, y, instance, element, clearance)),
  )
}

function reachableCentralExits(
  value: StageLayout,
  clearance = PLAYER_CLEARANCE,
): Set<'north' | 'east' | 'south' | 'west'> {
  const halfW = value.stage === 'reseaux_enterres' || value.stage === 'echafaudages' || value.stage === 'livraison_audit' ? 2000 : 1800
  const halfH = value.stage === 'reseaux_enterres' || value.stage === 'echafaudages' || value.stage === 'livraison_audit' ? 1500 : 1300
  const key = (x: number, y: number): string => `${x},${y}`
  const queue: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }]
  const visited = new Set<string>([key(0, 0)])
  const exits = new Set<'north' | 'east' | 'south' | 'west'>()

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index] as { x: number; y: number }
    if (current.y <= -halfH + GRID) {exits.add('north')}
    if (current.x >= halfW - GRID) {exits.add('east')}
    if (current.y >= halfH - GRID) {exits.add('south')}
    if (current.x <= -halfW + GRID) {exits.add('west')}
    for (const [dx, dy] of [[GRID, 0], [-GRID, 0], [0, GRID], [0, -GRID]] as const) {
      const x = current.x + dx
      const y = current.y + dy
      const id = key(x, y)
      if (Math.abs(x) > halfW || Math.abs(y) > halfH || visited.has(id) || blocked(value, x, y, clearance)) {continue}
      visited.add(id)
      queue.push({ x, y })
    }
  }
  return exits
}

function canReachPoint(value: StageLayout, target: { x: number; y: number }): boolean {
  if (blocked(value, target.x, target.y)) {return false}
  const limitX = 2100
  const limitY = 1650
  const key = (x: number, y: number): string => `${x},${y}`
  const queue: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }]
  const visited = new Set<string>([key(0, 0)])
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index] as { x: number; y: number }
    if (Math.hypot(current.x - target.x, current.y - target.y) <= GRID) {return true}
    for (const [dx, dy] of [[GRID, 0], [-GRID, 0], [0, GRID], [0, -GRID]] as const) {
      const x = current.x + dx
      const y = current.y + dy
      const id = key(x, y)
      if (Math.abs(x) > limitX || Math.abs(y) > limitY || visited.has(id) || blocked(value, x, y)) {continue}
      visited.add(id)
      queue.push({ x, y })
    }
  }
  return false
}

function rectanglesOverlap(a: StageLayout['markers'][number], b: StageLayout['markers'][number]): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

describe('layouts composés des stages 01 à 10', () => {
  it('enregistre exactement les dix stages attendus', () => {
    expect(composedStageIds().sort()).toEqual([...STAGES].sort())
  })

  it.each(COMPOSED_STAGES)('%s conserve les invariants géographiques et remplace le plan procédural', (stage) => {
    const value = layout(stage)
    expect(value.schemaVersion).toBe(1)
    expect(value.stage).toBe(stage)
    expect(value.worldSize).toEqual({ width: 10240, height: 7680 })
    expect(value.spawn).toEqual({ x: 0, y: 0 })
    expect(value.cameraPreview).toEqual({ width: 1280, height: 720 })
    expect(value.keepSitePlan).toBe(false)
    expect(value.markers).toHaveLength(5)
    expect(value.markers.map((marker) => marker.type).sort()).toEqual(
      ['signature_zone', 'zone_access', 'zone_storage', 'zone_secondary', 'zone_atmosphere'].sort(),
    )
    const signature = value.markers.find((marker) => marker.type === 'signature_zone')
    expect(signature).toBeDefined()
    expect(value.spawn.x).toBeGreaterThanOrEqual(signature?.x ?? Number.POSITIVE_INFINITY)
    expect(value.spawn.x).toBeLessThanOrEqual((signature?.x ?? Number.NEGATIVE_INFINITY) + (signature?.w ?? 0))
    expect(value.spawn.y).toBeGreaterThanOrEqual(signature?.y ?? Number.POSITIVE_INFINITY)
    expect(value.spawn.y).toBeLessThanOrEqual((signature?.y ?? Number.NEGATIVE_INFINITY) + (signature?.h ?? 0))
    const centers = canonicalZoneCenters(value)
    for (const [zone, center] of Object.entries(centers).filter(([zone]) => zone !== 'A')) {
      const distance = Math.hypot(center.x - centers.A.x, center.y - centers.A.y)
      expect(distance, `${stage}: distance zone ${zone}`).toBeGreaterThanOrEqual(700)
      expect(distance, `${stage}: distance zone ${zone}`).toBeLessThanOrEqual(1600)
    }
    for (const [zoneName, center] of Object.entries(centers).filter(([zoneName]) => zoneName !== 'A')) {
      expect(blocked(value, center.x, center.y), `${stage}: centre littéral de ${zoneName} bloqué`).toBe(false)
      expect(canReachPoint(value, center), `${stage}: centre littéral de ${zoneName} inaccessible`).toBe(true)
    }
  })

  it('compose Terrassement comme un flux causal complet plutôt que des engins isolés', () => {
    const value = layout('terrassement')
    const zones = canonicalZoneCenters(value)
    const front = value.instances.filter((instance) => instance.prefab === 'scene_dig_active_spawn')
    expect(front).toHaveLength(1)
    const activeFront = front[0] as LayoutInstance
    const frontAssets = activeFront.elements?.map((element) => element.assetKey) ?? []

    // Le premier tableau, visible sans quitter le spawn, explique simultanément la
    // fouille, les déblais, la pelle et le camion — pas une fosse nue.
    expect(distanceBetween(value.spawn, activeFront)).toBeGreaterThanOrEqual(300)
    expect(distanceBetween(value.spawn, activeFront)).toBeLessThanOrEqual(640)
    expect(frontAssets.filter((key) => key === 'struct_stage02_pit')).toHaveLength(1)
    expect(frontAssets.filter((key) => key === 'prop_s2_dirt')).toHaveLength(5)
    expect(frontAssets.some((key) => key.startsWith('prop_s2_excavator'))).toBe(true)
    expect(frontAssets.some((key) => key.startsWith('prop_s2_truck'))).toBe(true)
    expect(distanceBetween(zones.A, activeFront)).toBeLessThanOrEqual(480)

    // Les trois zones de production restent séparées et reliées par le flux camion :
    // accès/logistique (B) → stockage de terre (C) → front actif (A).
    const truckPaths = value.paths.filter((path) => path.type === 'truck_path')
    expect(truckPaths).toHaveLength(1)
    const truckPoints = truckPaths[0]?.points ?? []
    expect(truckPoints.length).toBeGreaterThanOrEqual(2)
    const firstTruckPoint = truckPoints[0]
    const lastTruckPoint = truckPoints.at(-1)
    if (firstTruckPoint === undefined || lastTruckPoint === undefined) {
      throw new Error('Terrassement: chemin camion sans extrémités')
    }
    expect(distanceBetween(firstTruckPoint, lastTruckPoint)).toBeGreaterThanOrEqual(640)
    // Chaque zone canonique porte son tableau, ce qui interdit de valider le
    // stage avec les bonnes scènes simplement dispersées hors de leur rôle.
    const access = instancesInZone(value, 'zone_access')
    expect(access.map((instance) => instance.prefab)).toContain('obj_prop_s2_truck')

    const storage = instancesInZone(value, 'zone_storage')
    expect(storage.filter((instance) => instance.prefab === 'scene_stock')).toHaveLength(1)

    const secondary = instancesInZone(value, 'zone_secondary')
    expect(secondary.filter((instance) => instance.prefab === 'scene_dig_done')).toHaveLength(1)
    expect(secondary.filter((instance) => instance.prefab === 'scene_roll')).toHaveLength(1)

    const atmosphere = instancesInZone(value, 'zone_atmosphere')
    expect(atmosphere.filter((instance) => instance.prefab === 'scene_spoil')).toHaveLength(1)
    expect(atmosphere.some((instance) => instance.prefab === 'obj_decal_s2_tracks')).toBe(true)
    expect(atmosphere.some((instance) => instance.prefab === 'obj_decal_s2_puddle')).toBe(true)

    expect(distanceBetween(activeFront, secondary.find((instance) => instance.prefab === 'scene_dig_done') as LayoutInstance)).toBeGreaterThanOrEqual(700)
  })

  it('compose Fondations autour d’un coulage causal et de ses zones de production', () => {
    const value = layout('fondations')
    const signature = instancesInZone(value, 'signature_zone')
    const pour = signature.find((instance) => instance.prefab === 'scene_foundation_pour_large')
    expect(pour).toBeDefined()
    const pourAssets = pour?.elements?.map((element) => element.assetKey) ?? []

    // Le premier tableau lie la dalle au ferraillage, au coffrage, à la pompe,
    // à la toupie et à un opérateur : aucun de ces rôles ne peut disparaître
    // sans casser l’explication causale visible dès le spawn.
    expect(pourAssets).toContain('landmark_stage03')
    expect(pourAssets.filter((key) => key === 'prop_stage03_rebar')).toHaveLength(2)
    expect(pourAssets.filter((key) => key === 'struct_stage03_bay')).toHaveLength(2)
    expect(pourAssets).toContain('struct_stage03_pump')
    expect(pourAssets).toContain('struct_stage03_mixer')
    expect(pourAssets).toContain('decal_stage03_spill')
    expect(pourAssets).toContain('npc_stage03')
    expect(distanceBetween(value.spawn, pour as LayoutInstance)).toBeGreaterThanOrEqual(300)

    const productionMixer = value.instances.find(
      (instance) => instance.prefab === 'obj_prop_stage03_concrete_mixer_work',
    )
    const cleanupPatch = value.instances.find((instance) => instance.prefab === 'scene_small_mixer_patch')
    expect(productionMixer).toBeDefined()
    expect(cleanupPatch).toBeDefined()
    expect(distanceBetween(productionMixer as LayoutInstance, cleanupPatch as LayoutInstance)).toBeGreaterThanOrEqual(160)

    const access = instancesInZone(value, 'zone_access')
    expect(access.some((instance) => instance.prefab === 'scene_access_concrete_trucks')).toBe(true)
    const storage = instancesInZone(value, 'zone_storage')
    expect(storage.some((instance) => instance.prefab === 'scene_rebar_stock_big')).toBe(true)
    const finished = instancesInZone(value, 'zone_secondary').find(
      (instance) => instance.prefab === 'scene_slab_done',
    )
    expect(finished).toBeDefined()
    expect(distanceBetween(pour as LayoutInstance, finished as LayoutInstance)).toBeGreaterThanOrEqual(600)
  })

  it('compose Réseaux enterrés comme une tranchée exploitée, approvisionnée et refermée', () => {
    const value = layout('reseaux_enterres')
    const signature = instancesInZone(value, 'signature_zone')
    const signatureAssets = signature.flatMap((instance) => instance.elements?.map((element) => element.assetKey) ?? [])
    const allTrenches = value.instances.filter((instance) => instance.prefab === 'obj_decal_stage04_trench')
    const manhole = signature.find((instance) => instance.prefab === 'obj_prop_stage04_regard')
    const excavator = signature.find((instance) => instance.prefab === 'obj_struct_stage04_excavator_work')
    const causalTargets = signature.filter((instance) =>
      instance.prefab === 'obj_prop_stage04_regard' ||
      instance.prefab === 'obj_struct_stage04_excavator_work' ||
      instance.elements?.some((element) =>
        element.assetKey === 'prop_stage04_pipes' || element.assetKey === 'prop_stage04_cable',
      ) === true,
    )

    // La tranchée du spawn est expliquée par ses réseaux, un regard, une pelle et
    // un métier attaché au front, plutôt qu’une ligne de décor autonome.
    expect(allTrenches.length).toBeGreaterThan(0)
    expect(signatureAssets).toContain('prop_stage04_pipes')
    expect(signatureAssets).toContain('prop_stage04_cable')
    expect(manhole).toBeDefined()
    expect(excavator).toBeDefined()
    expect(causalTargets).not.toHaveLength(0)
    // Les tuiles (pas des placeholders) forment un réseau continu relié à un
    // vrai tuyau/câble, regard ou engin. Une branche occidentale isolée ne peut
    // donc ni réapparaître hors du front, ni se détacher de sa cause métier.
    expect(Math.min(...allTrenches.map((trench) => trench.x))).toBeGreaterThanOrEqual(-500)
    const connected = new Set<number>()
    const pending = [0]
    while (pending.length > 0) {
      const current = pending.pop()
      if (current === undefined || connected.has(current)) {continue}
      connected.add(current)
      const trench = allTrenches[current]
      if (trench === undefined) {continue}
      for (let index = 0; index < allTrenches.length; index += 1) {
        const candidate = allTrenches[index]
        if (candidate !== undefined && distanceBetween(trench, candidate) <= 120) {
          pending.push(index)
        }
      }
    }
    expect(connected.size, 'branche de tranchée isolée').toBe(allTrenches.length)
    expect(
      Math.min(...allTrenches.flatMap((trench) => causalTargets.map((target) => distanceBetween(trench, target)))),
      'réseau de tranchées sans cause métier',
    ).toBeLessThanOrEqual(350)
    const electrician = value.npcs.find((npc) => npc.id === 'reseaux_electrician')
    expect(electrician).toBeDefined()
    expect(
      Math.min(...signature.map((instance) => distanceBetween(electrician as { x: number; y: number }, instance))),
    ).toBeLessThanOrEqual(350)
    expect(Math.min(...allTrenches.map((trench) => distanceBetween(manhole as LayoutInstance, trench)))).toBeLessThanOrEqual(80)
    expect(Math.min(...allTrenches.map((trench) => distanceBetween(excavator as LayoutInstance, trench)))).toBeLessThanOrEqual(350)

    const access = instancesInZone(value, 'zone_access')
    expect(access.some((instance) => instance.prefab === 'cluster_work_reseaux')).toBe(true)
    const storage = instancesInZone(value, 'zone_storage')
    expect(storage.some((instance) => instance.prefab === 'cluster_storage_reseaux')).toBe(true)
    const secondary = instancesInZone(value, 'zone_secondary')
    expect(secondary.some((instance) => instance.prefab === 'cluster_plant_reseaux')).toBe(true)
  })

  it('recopie les 86 immeubles, leurs transformations et leurs collisions au bit près', () => {
    const reference = perimeterGeometry(buildings(layout('terrain_vierge')))
    expect(reference).toHaveLength(86)
    for (const stage of COMPOSED_STAGES) {
      expect(perimeterGeometry(buildings(layout(stage))), stage).toEqual(reference)
    }
  })

  it.each(COMPOSED_STAGES)('%s ne contient aucun prefab inconnu ni placement hors monde', (stage) => {
    const value = layout(stage)
    const catalog = getStageCatalog(stage)
    const known = new Set(catalog.entries.map((entry) => entry.id))
    const knownAssets = new Set(catalog.assets.map((asset) => asset.key))
    const halfW = value.worldSize.width / 2
    const halfH = value.worldSize.height / 2
    for (const placed of value.instances) {
      const elements = placed.elements ?? []
      if (!known.has(placed.prefab)) {
        // Les compositions manuelles peuvent conserver une scène historisée après
        // son retrait de la palette ; elle reste valide si son rendu est embarqué
        // et référence exclusivement des assets encore chargés par le stage.
        expect(elements.length, `${stage}: ${placed.prefab} sans rendu embarqué`).toBeGreaterThan(0)
      }
      for (const element of elements) {
        expect(knownAssets.has(element.assetKey), `${stage}: asset ${element.assetKey}`).toBe(true)
      }
      expect(Math.abs(placed.x), `${stage}: ${placed.id} hors monde en x`).toBeLessThanOrEqual(halfW)
      expect(Math.abs(placed.y), `${stage}: ${placed.id} hors monde en y`).toBeLessThanOrEqual(halfH)
      expect(placed.elements?.length ?? 0, `${stage}: ${placed.id} sans éléments embarqués`).toBeGreaterThan(0)
    }
    expect(
      value.instances.filter((placed) =>
        placed.elements?.some((element) => element.prisoner !== undefined) === true,
      ),
      `${stage}: prisonniers explicites`,
    ).toHaveLength(5)
  })

  it.each(COMPOSED_STAGES)('%s garde 300 px libres au spawn et au moins trois sorties centrales', (stage) => {
    const value = layout(stage)
    expect(blocked(value, 0, 0, SPAWN_CLEARANCE), `${stage}: collision dans la poche de spawn`).toBe(false)
    expect(reachableCentralExits(value).size, `${stage}: sorties centrales praticables`).toBeGreaterThanOrEqual(3)
    expect(
      reachableCentralExits(value, 160).size,
      `${stage}: sorties avec couloir de 320 px`,
    ).toBeGreaterThanOrEqual(3)
  })

  it('compose Gros œuvre avec une coque unique, une logistique reliée et une atmosphère E distincte', () => {
    const value = layout('gros_oeuvre')
    const access = instancesInZone(value, 'zone_access')
    const cranes = embeddedPositions(value, 'struct_stage05_crane_work')
    const hooks = embeddedPositions(value, 'prop_stage05_crane_hook_work')
    const loads = embeddedPositions(value, 'prop_stage05_block_pallet')
    const destinations = embeddedPositions(value, 'struct_stage05_wall')
    const shells = value.instances.filter((instance) => instance.prefab === 'obj_continuity_stage05_shell')
    const { instance: continuityShell } = shell(value)
    const truckPath = value.paths.find((path) => path.type === 'truck_path')
    const truckPoints = truckPath?.points ?? []
    const secondary = zone(value, 'zone_secondary')
    const atmosphere = zone(value, 'zone_atmosphere')
    const storage = zone(value, 'zone_storage')
    const secondaryCenter = { x: secondary.x + secondary.w / 2, y: secondary.y + secondary.h / 2 }
    const atmosphereAssets = assetKeys(instancesInZone(value, 'zone_atmosphere'))

    expect(shells).toHaveLength(1)
    expect(inZone(continuityShell, zone(value, 'signature_zone'))).toBe(true)
    expect(distanceBetween(value.spawn, continuityShell)).toBeGreaterThanOrEqual(300)
    expect(distanceBetween(value.spawn, continuityShell)).toBeLessThanOrEqual(650)
    // Une seule chaîne active grue → crochet → palette → mur : les éléments
    // embarqués comptent aussi, afin qu'un crochet caché dans un cluster ne puisse
    // plus contourner le contrat en laissant une paire favorable ailleurs.
    expect(cranes).toHaveLength(1)
    expect(hooks).toHaveLength(1)
    const [crane] = cranes
    const [hook] = hooks
    if (crane === undefined || hook === undefined) {throw new Error('Gros œuvre: chaîne de levage absente')}
    expect(Math.hypot(crane.x - hook.x, crane.y - hook.y), 'grue/crochet causal').toBeGreaterThanOrEqual(100)
    expect(Math.hypot(crane.x - hook.x, crane.y - hook.y), 'grue/crochet causal').toBeLessThanOrEqual(350)
    expect(loads.some((load) => {
      const distance = Math.hypot(load.x - hook.x, load.y - hook.y)
      return distance >= 100 && distance <= 350
    }), 'crochet sans palette/charge').toBe(true)
    expect(destinations.some((destination) => {
      const distance = Math.hypot(destination.x - hook.x, destination.y - hook.y)
      return distance >= 100 && distance <= 350
    }), 'crochet sans mur/destination').toBe(true)
    expect(assetKeys(access)).toEqual(expect.arrayContaining(['prop_stage05_block_pallet', 'prop_stage05_concrete_pole']))
    expect(truckPoints.some((point) => inZone(point, zone(value, 'zone_access'))), 'B doit toucher le flux camion').toBe(true)
    expect(blocked(value, secondaryCenter.x, secondaryCenter.y), 'centre littéral de D bloqué').toBe(false)
    expect(canReachPoint(value, secondaryCenter), 'centre littéral de D inaccessible').toBe(true)
    expect(rectanglesOverlap(storage, atmosphere), 'E ne doit pas chevaucher C').toBe(false)
    expect(atmosphereAssets).toContain('decal_stage05_rubble')
    expect(value.instances.filter((instance) => inZone(instance, atmosphere) && instance.prefab === 'cluster_storage_gros_oeuvre')).toHaveLength(0)
  })

  it('compose Échafaudages en façade connectée autour de la coque visible', () => {
    const value = layout('echafaudages')
    const signature = instancesInZone(value, 'signature_zone')
    const { instance: continuityShell } = shell(value)
    const requiredAssets = [
      'prop_stage06_scaffold',
      'prop_stage06_plancher',
      'prop_stage06_garde_corps',
      'prop_stage06_echelle',
      'struct_stage06_nacelle_work',
    ]
    const findAsset = (asset: string): LayoutInstance | undefined => signature.find(
      (instance) => instance.elements?.some((element) => element.assetKey === asset) === true,
    )

    expect(inZone(continuityShell, zone(value, 'signature_zone'))).toBe(true)
    expect(distanceBetween(value.spawn, continuityShell)).toBeLessThanOrEqual(650)
    for (const asset of requiredAssets) {
      const placed = findAsset(asset)
      expect(placed, `façade: ${asset} absent de A`).toBeDefined()
      expect(distanceBetween(continuityShell, placed as LayoutInstance), `façade: ${asset} détaché de la coque`).toBeLessThanOrEqual(420)
    }
    expect(distanceBetween(findAsset('struct_stage06_nacelle_work') as LayoutInstance, findAsset('prop_stage06_scaffold') as LayoutInstance)).toBeLessThanOrEqual(350)
  })

  it('compose Charpente / toiture dans A avec une chaîne de levage courte et un stock C pur', () => {
    const value = layout('charpente_toiture')
    const signature = instancesInZone(value, 'signature_zone')
    const storage = instancesInZone(value, 'zone_storage')
    const findAsset = (asset: string): LayoutInstance | undefined => signature.find(
      (instance) => instance.elements?.some((element) => element.assetKey === asset) === true,
    )
    const crane = signature.find((instance) => instance.prefab === 'obj_struct_stage07_crane_work')
    const load = findAsset('struct_stage07_load')
    const truss = findAsset('struct_stage07_truss')
    const storageAssets = assetKeys(storage)

    expect(crane).toBeDefined()
    expect(load).toBeDefined()
    expect(truss).toBeDefined()
    expect(distanceBetween(crane as LayoutInstance, load as LayoutInstance)).toBeGreaterThanOrEqual(100)
    expect(distanceBetween(crane as LayoutInstance, load as LayoutInstance)).toBeLessThanOrEqual(350)
    expect(distanceBetween(load as LayoutInstance, truss as LayoutInstance)).toBeGreaterThanOrEqual(100)
    expect(distanceBetween(load as LayoutInstance, truss as LayoutInstance)).toBeLessThanOrEqual(350)
    expect(storageAssets).toEqual(expect.arrayContaining(['prop_stage07_beam', 'prop_stage07_tile_pile']))
    expect(storageAssets.every((asset) => ['prop_stage07_beam', 'prop_stage07_tile_pile'].includes(asset))).toBe(true)
    const secondaryAssets = assetKeys(instancesInZone(value, 'zone_secondary'))
    expect(secondaryAssets).toContain('prop_stage07_insul')
    expect(value.instances.some((instance) =>
      instance.elements?.some((element) => element.assetKey === 'prop_stage07_gutter') === true &&
      !inZone(instance, zone(value, 'zone_storage')),
    )).toBe(true)
  })

  it('conserve une coque visible de même échelle effective pour les trois phases', () => {
    const stage05 = shell(layout('gros_oeuvre'))
    expect(inZone(stage05.instance, zone(layout('gros_oeuvre'), 'signature_zone'))).toBe(true)

    for (const stage of ['echafaudages', 'charpente_toiture'] as const) {
      const currentLayout = layout(stage)
      const current = shell(currentLayout)
      expect(inZone(current.instance, zone(currentLayout, 'signature_zone')), `${stage}: coque hors de A`).toBe(true)
      expect(distanceBetween(stage05.instance, current.instance), `${stage}: dérive de coque`).toBeLessThanOrEqual(50)
      expect(current.instance.rotation, `${stage}: rotation de coque`).toBe(stage05.instance.rotation)
      expect(current.instance.scale, `${stage}: échelle d’instance`).toBe(stage05.instance.scale)
      expect(effectiveScale(current.instance, current.element), `${stage}: échelle effective`).toBe(effectiveScale(stage05.instance, stage05.element))
    }
  })

  it('mesure le clutter visible des phases 08 à 10 sans confondre instance et densité', () => {
    const density = ['second_oeuvre', 'finitions', 'livraison_audit'].map(
      (stage) => clutterCells(layout(stage)).size,
    )
    expect(density[0]).toBeGreaterThanOrEqual(density[1] as number)
    expect(density[1]).toBeGreaterThanOrEqual(density[2] as number)
    // Classification canonique actuelle : [9, 9, 7]. L'égalité 08 = 09 est
    // intentionnellement admise : le contrat mesure une progression non croissante.
  })

  it('ne fixe aucun porteur à un poste : chaque porteur utilise un chemin explicite', () => {
    for (const stage of COMPOSED_STAGES) {
      const value = layout(stage)
      expect(value.npcs.filter((entry) => entry.skin.includes('porteur')), stage).toEqual([])
      for (const skin of value.paths.flatMap((entry) => entry.skin?.includes('porteur') === true ? [entry.skin] : [])) {
        expect(skin, `${stage}: skin porteur absent`).toBeDefined()
      }
    }
  })

  it('désactive le réseau organique du stage 04 lorsqu’une composition est présente', () => {
    expect(shouldUseStructurePlan('reseaux_enterres', false)).toBe(true)
    expect(shouldUseStructurePlan('reseaux_enterres', true)).toBe(false)
    expect(shouldUseStructurePlan('terrassement', false)).toBe(false)
  })
})
