import type { LayoutInstance, LayoutMarker, StageLayout, Vec2 } from './stageLayout'

export type CanonicalZone = 'A' | 'B' | 'C' | 'D' | 'E'

const ZONE_BY_MARKER_TYPE: Readonly<Record<LayoutMarker['type'], CanonicalZone>> = {
  signature_zone: 'A',
  zone_access: 'B',
  zone_storage: 'C',
  zone_secondary: 'D',
  zone_atmosphere: 'E',
}

/** Centre de la boîte d’un marqueur, en coordonnées de composition. */
export function markerCenter(marker: LayoutMarker): Vec2 {
  return { x: marker.x + marker.w / 2, y: marker.y + marker.h / 2 }
}

/** Centres A–E issus exclusivement des marqueurs canoniques du layout. */
export function canonicalZoneCenters(layout: StageLayout): Record<CanonicalZone, Vec2> {
  const centers = {} as Record<CanonicalZone, Vec2>
  for (const marker of layout.markers) {
    const zone = ZONE_BY_MARKER_TYPE[marker.type]
    if (centers[zone] !== undefined) {
      throw new Error(`${layout.stage}: marqueur canonique dupliqué pour la zone ${zone}`)
    }
    centers[zone] = markerCenter(marker)
  }
  for (const zone of ['A', 'B', 'C', 'D', 'E'] as const) {
    if (centers[zone] === undefined) {
      throw new Error(`${layout.stage}: marqueur canonique absent pour la zone ${zone}`)
    }
  }
  return centers
}

export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function isWithinDistance(a: Vec2, b: Vec2, maximum: number): boolean {
  return distanceBetween(a, b) <= maximum
}

export function isAtLeastDistance(a: Vec2, b: Vec2, minimum: number): boolean {
  return distanceBetween(a, b) >= minimum
}

function isPerimeter(instance: LayoutInstance): boolean {
  return instance.prefab.startsWith('obj_building_')
}

function isContinuity(instance: LayoutInstance): boolean {
  return instance.prefab.startsWith('obj_continuity_')
}

function isVisibleClutterElement(instance: LayoutInstance, element: NonNullable<LayoutInstance['elements']>[number]): boolean {
  return instance.elements?.some((candidate) => candidate.prisoner !== undefined) !== true &&
    (element.destructible !== undefined || element.layer === 'prop' || element.layer === 'decal')
}

function clutterCellPosition(instance: LayoutInstance, element: NonNullable<LayoutInstance['elements']>[number]): Vec2 {
  const scale = instance.scale ?? 1
  const angle = (instance.rotation * Math.PI) / 180
  const dx = element.dx * scale
  const dy = element.dy * scale
  return {
    x: instance.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: instance.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  }
}

/**
 * Cellules 320 px occupées par du décor visible léger. Les bâtiments de périmètre,
 * structures de continuité, prisonniers et entités vivantes (paths/PNJ) sont hors
 * métrique : cette mesure reflète le clutter visuel, pas la quantité brute d'instances.
 */
export function clutterCells(layout: StageLayout, cellSize = 320): Set<string> {
  const cells = new Set<string>()
  for (const instance of layout.instances) {
    if (isPerimeter(instance) || isContinuity(instance)) {continue}
    for (const element of instance.elements ?? []) {
      if (!isVisibleClutterElement(instance, element)) {continue}
      const position = clutterCellPosition(instance, element)
      cells.add(`${Math.floor(position.x / cellSize)}:${Math.floor(position.y / cellSize)}`)
    }
  }
  return cells
}

function uniqueAnchor(layout: StageLayout, prefab: string): LayoutInstance {
  const anchors = layout.instances.filter((instance) => instance.prefab === prefab)
  if (anchors.length !== 1) {
    throw new Error(`${layout.stage}: ancre ${prefab} attendue une fois, trouvée ${anchors.length}`)
  }
  const anchor = anchors[0]
  if (anchor === undefined) {throw new Error(`${layout.stage}: ancre ${prefab} absente`)}
  return anchor
}

/** Déplacement spatial d’une même ancre de continuité entre deux compositions. */
export function continuityAnchorDrift(reference: StageLayout, candidate: StageLayout, prefab: string): number {
  return distanceBetween(uniqueAnchor(reference, prefab), uniqueAnchor(candidate, prefab))
}
