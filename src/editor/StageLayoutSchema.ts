/**
 * StageLayoutSchema — sérialisation/validation JSON du Stage Composer Editor.
 *
 * Les TYPES du format vivent dans `@content/stageLayout` (data pure partagée
 * par core/content/éditeur) ; ce fichier les ré-exporte pour ne pas casser les
 * imports de l'éditeur, et fournit le parse tolérant + la sérialisation.
 * Ne dépend NI de Phaser NI du DOM.
 */

import { emptyLayout, type EmbeddedElement, type EmbeddedShape, type LayoutInstance, type LayoutMarker, type LayoutNpc, type LayoutPath, type NpcKind, type StageLayout, type Vec2 } from '@content/stageLayout'

export { SCHEMA_VERSION, emptyLayout } from '@content/stageLayout'
export type { Vec2, LayoutInstance, LayoutMarker, LayoutPath, LayoutNpc, NpcKind, StageLayout, MarkerType, PathType, EmbeddedElement, EmbeddedShape } from '@content/stageLayout'

export interface ParseResult {
  ok: boolean
  layout?: StageLayout
  error?: string
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** Parse une forme collidable embarquée (cercle ou segment). null si invalide. */
function parseShape(v: unknown): EmbeddedShape | undefined {
  if (typeof v !== 'object' || v === null) {return undefined}
  const o = v as Record<string, unknown>
  if (o.kind === 'segment') {
    return { kind: 'segment', x2: num(o.x2, 0), y2: num(o.y2, 0), thickness: num(o.thickness, 24) }
  }
  if (o.kind === 'circle') {
    return { kind: 'circle', r: num(o.r, 40) }
  }
  return undefined
}

/** Parse les éléments résolus embarqués d'une instance (sauvegarde « jeu » / import généré). */
function parseElements(v: unknown): EmbeddedElement[] | undefined {
  if (!Array.isArray(v)) {return undefined}
  const out: EmbeddedElement[] = []
  for (const it of v) {
    if (typeof it !== 'object' || it === null) {continue}
    const o = it as Record<string, unknown>
    if (typeof o.assetKey !== 'string') {continue}
    const e: EmbeddedElement = { assetKey: o.assetKey, dx: num(o.dx, 0), dy: num(o.dy, 0), scale: num(o.scale, 1) }
    if (o.flipX === true) {e.flipX = true}
    if (o.collide === 'both' || o.collide === 'enemies' || o.collide === 'none') {e.collide = o.collide}
    const shape = parseShape(o.shape)
    if (shape !== undefined) {e.shape = shape}
    out.push(e)
  }
  return out.length > 0 ? out : undefined
}

/**
 * Parse + normalise un JSON externe en StageLayout robuste (tolérant : les
 * champs manquants prennent une valeur par défaut). Renvoie ok:false + message
 * si le JSON est invalide ou n'a pas la forme attendue.
 */
export function parseLayout(raw: string, fallbackStage: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (e) {
    return { ok: false, error: 'JSON invalide : ' + (e instanceof Error ? e.message : String(e)) }
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'Racine JSON attendue = objet.' }
  }
  const d = data as Record<string, unknown>
  const base = emptyLayout(typeof d.stage === 'string' ? d.stage : fallbackStage)

  const ws = (d.worldSize ?? {}) as Record<string, unknown>
  base.worldSize = { width: num(ws.width, 10240), height: num(ws.height, 7680) }

  const sp = (d.spawn ?? {}) as Record<string, unknown>
  base.spawn = { x: num(sp.x, 0), y: num(sp.y, 0) }

  const cp = (d.cameraPreview ?? {}) as Record<string, unknown>
  base.cameraPreview = { width: num(cp.width, 1280), height: num(cp.height, 720) }

  if (Array.isArray(d.instances)) {
    base.instances = d.instances
      .map((it, i): LayoutInstance | null => {
        if (typeof it !== 'object' || it === null) {return null}
        const o = it as Record<string, unknown>
        if (typeof o.prefab !== 'string') {return null}
        const li: LayoutInstance = {
          id: typeof o.id === 'string' ? o.id : `instance_${i + 1}`,
          prefab: o.prefab,
          x: num(o.x, 0),
          y: num(o.y, 0),
          flipX: o.flipX === true,
          variant: num(o.variant, 0),
          rotation: num(o.rotation, 0),
          locked: o.locked === true
        }
        const els = parseElements(o.elements)
        if (els !== undefined) {li.elements = els}
        return li
      })
      .filter((v): v is LayoutInstance => v !== null)
  }

  if (Array.isArray(d.markers)) {
    base.markers = d.markers
      .map((it): LayoutMarker | null => {
        if (typeof it !== 'object' || it === null) {return null}
        const o = it as Record<string, unknown>
        if (o.type !== 'signature_zone') {return null}
        return {
          id: typeof o.id === 'string' ? o.id : 'signature_zone',
          type: 'signature_zone',
          x: num(o.x, -700),
          y: num(o.y, -500),
          w: num(o.w, 1400),
          h: num(o.h, 1000)
        }
      })
      .filter((v): v is LayoutMarker => v !== null)
  }

  if (Array.isArray(d.paths)) {
    base.paths = d.paths
      .map((it, i): LayoutPath | null => {
        if (typeof it !== 'object' || it === null) {return null}
        const o = it as Record<string, unknown>
        const t = o.type === 'worker_path' ? 'worker_path' : 'truck_path'
        const pts = Array.isArray(o.points)
          ? o.points
              .map((p): Vec2 | null => {
                if (typeof p !== 'object' || p === null) {return null}
                const pp = p as Record<string, unknown>
                return { x: num(pp.x, 0), y: num(pp.y, 0) }
              })
              .filter((v): v is Vec2 => v !== null)
          : []
        return { id: typeof o.id === 'string' ? o.id : `${t}_${i + 1}`, type: t, points: pts }
      })
      .filter((v): v is LayoutPath => v !== null)
  }

  if (Array.isArray(d.npcs)) {
    base.npcs = d.npcs
      .map((it, i): LayoutNpc | null => {
        if (typeof it !== 'object' || it === null) {return null}
        const o = it as Record<string, unknown>
        if (typeof o.skin !== 'string') {return null}
        const kind: NpcKind = o.kind === 'worker' ? 'worker' : 'trade'
        return { id: typeof o.id === 'string' ? o.id : `npc_${i + 1}`, skin: o.skin, kind, x: num(o.x, 0), y: num(o.y, 0) }
      })
      .filter((v): v is LayoutNpc => v !== null)
  }

  return { ok: true, layout: base }
}

/** Sérialise un layout en JSON indenté (2 espaces). */
export function serializeLayout(layout: StageLayout): string {
  return JSON.stringify(layout, null, 2)
}
