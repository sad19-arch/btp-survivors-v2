/**
 * StageLayoutSchema — sérialisation/validation JSON du Stage Composer Editor.
 *
 * Les TYPES du format vivent dans `@content/stageLayout` (data pure partagée
 * par core/content/éditeur) ; ce fichier les ré-exporte pour ne pas casser les
 * imports de l'éditeur, et fournit le parse tolérant + la sérialisation.
 * Ne dépend NI de Phaser NI du DOM.
 */

import { emptyLayout, type EmbeddedElement, type EmbeddedShape, type LayoutInstance, type LayoutMarker, type MarkerType, type LayoutNpc, type LayoutPath, type NpcKind, type StageLayout, type Vec2, PATH_LIMITS } from '@content/stageLayout'
import { ZONE_BY_TYPE } from './zones'

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

/** Borne une valeur numérique, ou `undefined` si ce n'est pas un nombre fini. */
function clampNum(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) { return undefined }
  return Math.min(max, Math.max(min, v))
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
    // Couche de rendu : préserver, sinon un aller-retour sauvegarde/chargement
    // la perd et les routes/décals remontent à hauteur de prop (même classe de
    // bug que `destructible` juste en dessous).
    if (o.layer === 'ground' || o.layer === 'decal' || o.layer === 'prop' || o.layer === 'struct') {e.layer = o.layer}
    // Plaque de sol : sans ça, une plaque rechargée redeviendrait une image
    // ÉTIRÉE de 64 px — le sol posé disparaîtrait à la première sauvegarde.
    if (typeof o.tile === 'object' && o.tile !== null) {
      const t = o.tile as Record<string, unknown>
      if (typeof t.w === 'number' && typeof t.h === 'number') {e.tile = { w: t.w, h: t.h }}
    }
    const shape = parseShape(o.shape)
    if (shape !== undefined) {e.shape = shape}
    // Objet DESTRUCTIBLE : préserver le routage vers les entités cassables (sim).
    // Sans ça, un layout joueur réinjecté au boot (applyUserLayouts → parseLayout)
    // perd sa casse → « les objets cassables ne se cassent pas » en jeu.
    if (typeof o.destructible === 'object' && o.destructible !== null) {
      const d = o.destructible as Record<string, unknown>
      if (typeof d.typeId === 'string') {e.destructible = { typeId: d.typeId }}
    }
    // Otage : préserver le routage vers les entités prisonniers (sim). Sans ça, un
    // layout joueur réinjecté au boot perdrait ses otages (même bug que destructible).
    if (typeof o.prisoner === 'object' && o.prisoner !== null) {
      e.prisoner = {}
    }
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

  // Sol de fond choisi pour la compo (tuile d'un AUTRE stage possible).
  if (typeof d.groundKey === 'string' && d.groundKey !== '') {
    base.groundKey = d.groundKey
  }

  // keepSitePlan:false : préserver, sinon la compo redemanderait le plan de
  // chantier procédural par-dessus elle à chaque rechargement (même classe de
  // bug que `destructible`/`layer`/`tile`/les réglages de chemin ci-dessous).
  if (typeof d.keepSitePlan === 'boolean') {
    base.keepSitePlan = d.keepSitePlan
  }

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
          scale: num(o.scale, 1),
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
        // Accepte les 4 macro-zones (A=signature_zone + B/C/D) via ZONE_DEFS ;
        // rejette tout autre type. Tailles par défaut = celles de la zone.
        const def = typeof o.type === 'string' ? ZONE_BY_TYPE.get(o.type as MarkerType) : undefined
        if (def === undefined) {return null}
        return {
          id: typeof o.id === 'string' ? o.id : def.type,
          type: def.type,
          x: num(o.x, -def.w / 2),
          y: num(o.y, -def.h / 2),
          w: num(o.w, def.w),
          h: num(o.h, def.h)
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
        const lp: LayoutPath = { id: typeof o.id === 'string' ? o.id : `${t}_${i + 1}`, type: t, points: pts }
        // Réglages du chemin : PRÉSERVER, sinon ils disparaissent en silence à la
        // première sauvegarde (déjà vécu 3× ici : destructible, layer, tile).
        if (typeof o.name === 'string' && o.name !== '') { lp.name = o.name }
        if (typeof o.skin === 'string' && o.skin !== '') { lp.skin = o.skin }
        const count = clampNum(o.count, PATH_LIMITS.count.min, PATH_LIMITS.count.max)
        if (count !== undefined) { lp.count = Math.round(count) }
        const speed = clampNum(o.speed, PATH_LIMITS.speed.min, PATH_LIMITS.speed.max)
        if (speed !== undefined) { lp.speed = speed }
        const pauseMs = clampNum(o.pauseMs, PATH_LIMITS.pauseMs.min, PATH_LIMITS.pauseMs.max)
        if (pauseMs !== undefined) { lp.pauseMs = pauseMs }
        if (typeof o.oneWay === 'boolean') { lp.oneWay = o.oneWay }
        return lp
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
