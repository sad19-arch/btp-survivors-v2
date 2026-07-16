/**
 * EditorState — état mutable du Stage Composer Editor (instances, spawn, zone
 * signature, chemins, sélection, grille/snap). Émet un événement à chaque
 * changement (la scène Phaser et le DOM s'y abonnent) et persiste dans
 * localStorage. Pas de Phaser ici : logique d'état pure + stockage navigateur.
 */

import {
  emptyLayout,
  parseLayout,
  serializeLayout,
  type EmbeddedElement,
  type EmbeddedShape,
  type LayoutInstance,
  type LayoutMarker,
  type MarkerType,
  type LayoutNpc,
  type LayoutPath,
  type NpcKind,
  type StageLayout,
  type Vec2
} from './StageLayoutSchema'
import { editorAsset, paletteEntry, type AssetRole } from './PrefabCatalog'
import type { RenderLayer } from '@content/stageLayout'

/**
 * Rôle de palette → couche d'affichage en jeu. La correspondance est explicite
 * pour que le rendu n'ait plus à deviner la profondeur depuis le préfixe de la
 * clé d'asset (cf. `RenderLayer` : `piste_strip` s'affichait à hauteur de prop).
 * `ground` et `worker` sont rendus par d'autres chemins → pas de couche ici.
 */
function layerForRole(role: AssetRole | undefined): RenderLayer | undefined {
  switch (role) {
    case 'decal': return 'decal'
    case 'landmark':
    case 'structure':
    case 'column': return 'struct'
    case 'prop':
    case 'destructible': return 'prop'
    default: return undefined
  }
}
import { ZONE_DEFS, ZONE_BY_TYPE } from './zones'
import { CLUSTERS } from '@content/clusters'
import { destructibleDef } from '@content/destructibles'
import { SHARED_WORKER_NPCS, stageRender } from '@render/stages'
import { buildSiteLayout } from '@core/siteLayout'

const WORLD_W = 10240
const WORLD_H = 7680

const LS_PREFIX = 'stageComposer:'

let idCounter = 0
function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`
}

export interface Warning {
  level: 'error' | 'warn'
  message: string
}

export class EditorState {
  private layout: StageLayout
  /** Sélection MULTIPLE : ids d'instances ET de npcs (espace d'ids partagé). */
  private selectedIds = new Set<string>()
  /** Élément « primaire » (dernier cliqué) — ce que l'inspecteur mono affiche. */
  private primaryId: string | null = null
  /** Presse-papier (copier/coller multi) : instances + npcs clonés, ids retirés au collage. */
  private clipboard: { instances: LayoutInstance[]; npcs: LayoutNpc[] } | null = null
  /** Macro-zone actuellement sélectionnée (état SÉPARÉ des instances/npcs). */
  private selectedZoneType: MarkerType | null = null
  /** Coalescence d'historique : pendant un batch, les mutations ne poussent pas de snapshot. */
  private batching = false
  private listeners: Array<() => void> = []
  grid = true
  snap = false
  gridSize = 128

  // Historique annuler/rétablir : piles de layouts sérialisés (bornées).
  private history: string[] = []
  private future: string[] = []
  private lastCommitted = ''
  private static readonly HISTORY_MAX = 80

  constructor(private readonly stage: string) {
    this.layout = this.load() ?? emptyLayout(stage)
    this.lastCommitted = serializeLayout(this.layout)
  }

  // ── abonnement ────────────────────────────────────────────────────────────
  onChange(fn: () => void): void {
    this.listeners.push(fn)
  }
  /** Émet un changement : enregistre l'historique SI le layout a bougé, puis notifie. */
  private emit(): void {
    // Pendant un batch (glisser de groupe), on rafraîchit l'affichage sans pousser
    // de snapshot : `endBatch()` en poussera UN seul pour toute l'opération.
    if (this.batching) {
      this.notify()
      return
    }
    const cur = serializeLayout(this.layout)
    if (cur !== this.lastCommitted) {
      this.history.push(this.lastCommitted)
      if (this.history.length > EditorState.HISTORY_MAX) {
        this.history.shift()
      }
      this.lastCommitted = cur
      this.future = []
    }
    this.notify()
  }
  /** Sauvegarde + notifie SANS toucher à l'historique (undo/redo/sélection). */
  private notify(): void {
    this.save()
    for (const fn of this.listeners) {fn()}
  }

  // ── annuler / rétablir ──────────────────────────────────────────────────────
  get canUndo(): boolean {
    return this.history.length > 0
  }
  get canRedo(): boolean {
    return this.future.length > 0
  }
  undo(): void {
    const prev = this.history.pop()
    if (prev === undefined) {return}
    this.future.push(serializeLayout(this.layout))
    this.applySerialized(prev)
  }
  redo(): void {
    const next = this.future.pop()
    if (next === undefined) {return}
    this.history.push(serializeLayout(this.layout))
    this.applySerialized(next)
  }
  private applySerialized(raw: string): void {
    const res = parseLayout(raw, this.stage)
    if (res.layout !== undefined) {
      this.layout = res.layout
    }
    this.lastCommitted = raw
    this.selectOnly(null)
    this.notify()
  }

  // ── accès lecture ───────────────────────────────────────────────────────────
  get instances(): readonly LayoutInstance[] {
    return this.layout.instances
  }
  get npcs(): readonly LayoutNpc[] {
    return this.layout.npcs
  }
  get spawn(): Vec2 {
    return this.layout.spawn
  }
  get signature(): LayoutMarker | null {
    return this.zoneOf('signature_zone')
  }
  /** Marqueur d'une macro-zone donnée (singleton par type), ou null. */
  zoneOf(type: MarkerType): LayoutMarker | null {
    return this.layout.markers.find((m) => m.type === type) ?? null
  }
  /** Type de la macro-zone actuellement sélectionnée, ou null. */
  get selectedZone(): MarkerType | null {
    return this.selectedZoneType
  }
  get paths(): readonly LayoutPath[] {
    return this.layout.paths
  }
  get cameraPreview(): { width: number; height: number } {
    return this.layout.cameraPreview
  }
  /** Id primaire (dernier cliqué) — rétro-compat mono. */
  get selected(): string | null {
    return this.primaryId
  }
  /** Ids de TOUTE la sélection (instances + npcs). */
  selectedIdSet(): string[] {
    return [...this.selectedIds]
  }
  get selectionCount(): number {
    return this.selectedIds.size
  }
  isSelected(id: string): boolean {
    return this.selectedIds.has(id)
  }
  selectedInstance(): LayoutInstance | null {
    return this.layout.instances.find((i) => i.id === this.primaryId) ?? null
  }
  selectedNpc(): LayoutNpc | null {
    return this.layout.npcs.find((n) => n.id === this.primaryId) ?? null
  }

  // ── sélection ───────────────────────────────────────────────────────────────
  /** Fixe la sélection mono (ou vide) SANS émettre — usage interne. */
  private selectOnly(id: string | null): void {
    this.selectedIds.clear()
    if (id !== null) {
      this.selectedIds.add(id)
    }
    this.primaryId = id
  }
  /** Sélection mono (remplace) — API historique. */
  select(id: string | null): void {
    this.selectOnly(id)
    this.emit()
  }
  /** Sélectionne un ensemble d'ids (le dernier devient primaire). */
  selectMany(ids: string[]): void {
    this.selectedIds = new Set(ids)
    this.primaryId = ids.length > 0 ? (ids[ids.length - 1] ?? null) : null
    this.emit()
  }
  /** Ajoute/retire un id de la sélection (clic Maj/Ctrl sur un objet). */
  toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id)
      if (this.primaryId === id) {
        const rest = [...this.selectedIds]
        this.primaryId = rest.length > 0 ? (rest[rest.length - 1] ?? null) : null
      }
    } else {
      this.selectedIds.add(id)
      this.primaryId = id
    }
    this.emit()
  }
  clearSelection(): void {
    this.selectOnly(null)
    this.emit()
  }

  // ── batch d'historique (glisser de groupe = 1 seul pas d'undo) ───────────────
  beginBatch(): void {
    this.batching = true
  }
  endBatch(): void {
    this.batching = false
    this.emit()
  }

  // ── déplacement / presse-papier de la sélection ─────────────────────────────
  /** Déplace TOUTE la sélection de (dx,dy) — instances non verrouillées + npcs. */
  moveSelectionBy(dx: number, dy: number): void {
    let changed = false
    for (const id of this.selectedIds) {
      const inst = this.layout.instances.find((i) => i.id === id)
      if (inst !== undefined) {
        if (!inst.locked) {
          inst.x += dx
          inst.y += dy
          changed = true
        }
        continue
      }
      const npc = this.layout.npcs.find((n) => n.id === id)
      if (npc !== undefined) {
        npc.x += dx
        npc.y += dy
        changed = true
      }
    }
    if (changed) {
      this.emit()
    }
  }
  /** Copie la sélection (instances + npcs) dans le presse-papier (clone profond). */
  copySelection(): void {
    const ids = this.selectedIds
    const instances = this.layout.instances.filter((i) => ids.has(i.id)).map((i) => JSON.parse(JSON.stringify(i)) as LayoutInstance)
    const npcs = this.layout.npcs.filter((n) => ids.has(n.id)).map((n) => ({ ...n }))
    if (instances.length === 0 && npcs.length === 0) {
      return
    }
    this.clipboard = { instances, npcs }
    this.notify()
  }
  get hasClipboard(): boolean {
    return this.clipboard !== null
  }
  /**
   * Colle le presse-papier. Si (atX,atY) est fourni (coords COMPO), le groupe est
   * translaté pour que son coin haut-gauche s'y place ; sinon décalage +64,+64.
   * Un seul `emit()` (via `selectMany`) → 1 pas d'undo ; sélectionne les collages.
   */
  paste(atX?: number, atY?: number): void {
    const clip = this.clipboard
    if (clip === null || (clip.instances.length === 0 && clip.npcs.length === 0)) {
      return
    }
    const xs = [...clip.instances.map((i) => i.x), ...clip.npcs.map((n) => n.x)]
    const ys = [...clip.instances.map((i) => i.y), ...clip.npcs.map((n) => n.y)]
    const refX = Math.min(...xs)
    const refY = Math.min(...ys)
    const offX = atX !== undefined ? atX - refX : 64
    const offY = atY !== undefined ? atY - refY : 64
    const newSel: string[] = []
    for (const i of clip.instances) {
      const copy: LayoutInstance = { ...(JSON.parse(JSON.stringify(i)) as LayoutInstance), id: newId('instance'), x: i.x + offX, y: i.y + offY }
      this.layout.instances.push(copy)
      newSel.push(copy.id)
    }
    for (const n of clip.npcs) {
      const copy: LayoutNpc = { ...n, id: newId('npc'), x: n.x + offX, y: n.y + offY }
      this.layout.npcs.push(copy)
      newSel.push(copy.id)
    }
    this.selectMany(newSel)
  }

  // ── instances ─────────────────────────────────────────────────────────────
  addInstance(prefab: string, x: number, y: number): LayoutInstance {
    const inst: LayoutInstance = { id: newId('instance'), prefab, x, y, flipX: false, variant: 0, rotation: 0, scale: 1, locked: false }
    this.layout.instances.push(inst)
    this.selectOnly(inst.id)
    this.emit()
    return inst
  }
  moveInstance(id: string, x: number, y: number): void {
    const inst = this.layout.instances.find((i) => i.id === id)
    if (inst === undefined || inst.locked) {return}
    inst.x = x
    inst.y = y
    this.emit()
  }
  /** Décale la sélection (flèches clavier) — déplace TOUT le set. */
  nudge(dx: number, dy: number): void {
    this.moveSelectionBy(dx, dy)
  }
  /** Supprime TOUTE la sélection (instances + npcs). */
  deleteSelected(): void {
    if (this.selectedIds.size === 0) {return}
    const ids = this.selectedIds
    this.layout.instances = this.layout.instances.filter((i) => !ids.has(i.id))
    this.layout.npcs = this.layout.npcs.filter((n) => !ids.has(n.id))
    this.selectOnly(null)
    this.emit()
  }
  /** Duplique TOUTE la sélection (offset +96) et sélectionne les copies. */
  duplicateSelected(): void {
    const ids = [...this.selectedIds]
    if (ids.length === 0) {return}
    const newSel: string[] = []
    for (const id of ids) {
      const inst = this.layout.instances.find((i) => i.id === id)
      if (inst !== undefined) {
        const copy: LayoutInstance = { ...inst, id: newId('instance'), x: inst.x + 96, y: inst.y + 96 }
        this.layout.instances.push(copy)
        newSel.push(copy.id)
        continue
      }
      const npc = this.layout.npcs.find((n) => n.id === id)
      if (npc !== undefined) {
        const copy: LayoutNpc = { ...npc, id: newId('npc'), x: npc.x + 96, y: npc.y + 96 }
        this.layout.npcs.push(copy)
        newSel.push(copy.id)
      }
    }
    this.selectMany(newSel)
  }
  flipSelected(): void {
    const inst = this.selectedInstance()
    if (inst === null) {return}
    inst.flipX = !inst.flipX
    this.emit()
  }
  cycleVariant(): void {
    const inst = this.selectedInstance()
    if (inst === null) {return}
    inst.variant = (inst.variant + 1) % 4
    this.emit()
  }
  rotateSelected(deg: number): void {
    const inst = this.selectedInstance()
    if (inst === null || inst.locked) {return}
    inst.rotation = (((inst.rotation + deg) % 360) + 360) % 360
    this.emit()
  }
  /** Échelle UNIFORME de l'instance primaire (redimensionnement sans déformation). */
  static readonly SCALE_MIN = 0.25
  static readonly SCALE_MAX = 5
  /** Fixe l'échelle (bornée [0.25, 5]). */
  setSelectedScale(value: number): void {
    const inst = this.selectedInstance()
    if (inst === null || inst.locked) {return}
    inst.scale = Math.min(EditorState.SCALE_MAX, Math.max(EditorState.SCALE_MIN, value))
    this.emit()
  }
  /** Ajuste l'échelle d'un pas additif (boutons +/− et clavier). */
  nudgeSelectedScale(step: number): void {
    const inst = this.selectedInstance()
    if (inst === null || inst.locked) {return}
    this.setSelectedScale((inst.scale ?? 1) + step)
  }
  toggleLockSelected(): void {
    const inst = this.selectedInstance()
    if (inst === null) {return}
    inst.locked = !inst.locked
    this.emit()
  }
  /** Ordre de plan : passe l'instance primaire devant (fin du tableau = dessus). */
  bringSelectedToFront(): void {
    const id = this.primaryId
    if (id === null) {return}
    const i = this.layout.instances.findIndex((x) => x.id === id)
    if (i < 0) {return}
    const [it] = this.layout.instances.splice(i, 1)
    if (it !== undefined) {
      this.layout.instances.push(it)
    }
    this.emit()
  }
  sendSelectedToBack(): void {
    const id = this.primaryId
    if (id === null) {return}
    const i = this.layout.instances.findIndex((x) => x.id === id)
    if (i < 0) {return}
    const [it] = this.layout.instances.splice(i, 1)
    if (it !== undefined) {
      this.layout.instances.unshift(it)
    }
    this.emit()
  }

  // ── PNJ (métier fixe / ouvrier mobile) ──────────────────────────────────────
  /**
   * Pose un PNJ. `worldX/worldY` sont en coords MONDE (origine coin haut-gauche) ;
   * on les convertit en coords COMPO (origine = centre monde) pour le stockage.
   */
  addNpc(skin: string, kind: NpcKind, worldX: number, worldY: number): LayoutNpc {
    const npc: LayoutNpc = { id: newId('npc'), skin, kind, x: worldX - WORLD_W / 2, y: worldY - WORLD_H / 2 }
    this.layout.npcs.push(npc)
    this.selectOnly(npc.id)
    this.emit()
    return npc
  }
  /** Déplace un PNJ (coords MONDE en entrée, converties en compo). */
  moveNpc(id: string, worldX: number, worldY: number): void {
    const npc = this.layout.npcs.find((n) => n.id === id)
    if (npc === undefined) {return}
    npc.x = worldX - WORLD_W / 2
    npc.y = worldY - WORLD_H / 2
    this.emit()
  }

  // ── spawn ───────────────────────────────────────────────────────────────────
  setSpawn(x: number, y: number): void {
    this.layout.spawn = { x, y }
    this.emit()
  }

  // ── macro-zones (outil de conception : marqueurs ÉDITEUR-only, jamais exportés) ─
  private static readonly ZONE_MIN = 200
  private static readonly ZONE_MAX = 20000
  private clampZone(v: number): number {
    return Math.min(EditorState.ZONE_MAX, Math.max(EditorState.ZONE_MIN, v))
  }
  /** Pose (ou recentre si déjà présente) la macro-zone `type` sur (x,y) — 1 par type. */
  placeZone(type: MarkerType, x: number, y: number): void {
    const def = ZONE_BY_TYPE.get(type)
    if (def === undefined) {return}
    const existing = this.zoneOf(type)
    if (existing !== null) {
      existing.x = x - existing.w / 2
      existing.y = y - existing.h / 2
    } else {
      this.layout.markers.push({ id: type, type, x: x - def.w / 2, y: y - def.h / 2, w: def.w, h: def.h })
    }
    this.selectedZoneType = type
    this.emit()
  }
  /** Taille ABSOLUE (bornée) d'une zone — libre (poignée de coin, peut re-proportionner). */
  setZoneSize(type: MarkerType, w: number, h: number): void {
    const z = this.zoneOf(type)
    if (z === null) {return}
    z.w = this.clampZone(w)
    z.h = this.clampZone(h)
    this.emit()
  }
  /**
   * Agrandit/réduit une zone d'un FACTEUR uniforme — ratio conservé, centre fixe
   * (« sans déformer »). Le facteur est borné pour rester dans [MIN, MAX] sur les
   * deux axes, donc les proportions restent exactes même aux limites.
   */
  scaleZone(type: MarkerType, factor: number): void {
    const z = this.zoneOf(type)
    if (z === null) {return}
    const lo = EditorState.ZONE_MIN / Math.min(z.w, z.h)
    const hi = EditorState.ZONE_MAX / Math.max(z.w, z.h)
    const f = Math.min(hi, Math.max(lo, factor))
    const cx = z.x + z.w / 2
    const cy = z.y + z.h / 2
    z.w *= f
    z.h *= f
    z.x = cx - z.w / 2
    z.y = cy - z.h / 2
    this.emit()
  }
  /** Rétablit la taille par défaut de la zone (centre conservé). */
  resetZoneSize(type: MarkerType): void {
    const z = this.zoneOf(type)
    const def = ZONE_BY_TYPE.get(type)
    if (z === null || def === undefined) {return}
    const cx = z.x + z.w / 2
    const cy = z.y + z.h / 2
    z.w = def.w
    z.h = def.h
    z.x = cx - z.w / 2
    z.y = cy - z.h / 2
    this.emit()
  }
  /** Déplace une zone de (dx,dy). */
  moveZone(type: MarkerType, dx: number, dy: number): void {
    const z = this.zoneOf(type)
    if (z === null) {return}
    z.x += dx
    z.y += dy
    this.emit()
  }
  /** Supprime une zone. */
  deleteZone(type: MarkerType): void {
    this.layout.markers = this.layout.markers.filter((m) => m.type !== type)
    if (this.selectedZoneType === type) {this.selectedZoneType = null}
    this.emit()
  }
  /** Sélectionne (ou désélectionne avec null) une macro-zone. Indépendant des instances. */
  selectZone(type: MarkerType | null): void {
    this.selectedZoneType = type
    this.emit()
  }

  // ── chemins ─────────────────────────────────────────────────────────────────
  addPath(type: 'truck_path' | 'worker_path', points: Vec2[]): void {
    this.layout.paths.push({ id: newId(type), type, points })
    this.emit()
  }

  // ── grille / snap ─────────────────────────────────────────────────────────
  toggleGrid(): void {
    this.grid = !this.grid
    this.emit()
  }
  toggleSnap(): void {
    this.snap = !this.snap
    this.emit()
  }
  applySnap(x: number, y: number): Vec2 {
    if (!this.snap) {return { x, y }}
    const g = this.gridSize
    return { x: Math.round(x / g) * g, y: Math.round(y / g) * g }
  }

  // ── import / export ───────────────────────────────────────────────────────
  exportJson(): string {
    return serializeLayout(this.layout)
  }
  /**
   * Layout « jeu » : chaque instance dont le prefab N'EST PAS un cluster connu
   * (`CLUSTERS`) reçoit ses `elements` RÉSOLUS (assetKey/dx/dy/scale/flipX +
   * `collide` et `layer` dérivés du rôle) → le cœur peut le consommer sans le
   * catalogue. Les prefabs qui SONT des clusters gardent leur collision fine.
   */
  exportGameJson(): string {
    const clone = JSON.parse(serializeLayout(this.layout)) as StageLayout
    for (const inst of clone.instances) {
      if (CLUSTERS[inst.prefab] !== undefined) {
        continue
      }
      const entry = paletteEntry(inst.prefab)
      if (entry === undefined) {
        continue
      }
      // Destructible : un seul élément NON-BLOQUANT portant `destructible.typeId`
      // → `composedToSiteLayout` le route vers les entités destructibles (sim).
      if (entry.destructibleTypeId !== undefined) {
        const el = entry.elements?.[0]
        inst.elements =
          el === undefined
            ? []
            : [{ assetKey: el.assetKey, dx: el.dx, dy: el.dy, scale: el.scale, collide: 'none', destructible: { typeId: entry.destructibleTypeId } }]
        continue
      }
      if (entry.elements === undefined) {
        continue
      }
      inst.elements = entry.elements.map((el): EmbeddedElement => {
        const role = editorAsset(el.assetKey)?.role
        const block = role === 'landmark' || role === 'structure' || role === 'column'
        const e: EmbeddedElement = { assetKey: el.assetKey, dx: el.dx, dy: el.dy, scale: el.scale, collide: block ? 'both' : 'none' }
        // Le rôle était consommé pour décider la collision puis JETÉ : le rendu
        // devait ensuite redeviner la profondeur depuis le préfixe de la clé, et
        // se trompait (cf. `RenderLayer`). On le transporte désormais.
        const layer = layerForRole(role)
        if (layer !== undefined) {
          e.layer = layer
        }
        if (block) {
          e.shape = { kind: 'circle', r: Math.max(16, el.scale * 40) }
        }
        if (el.flipX === true) {
          e.flipX = true
        }
        return e
      })
    }
    // Cuit l'échelle UNIFORME de l'instance dans ses éléments résolus (résolus
    // ci-dessus OU embarqués via import) : redimensionnement sans déformation →
    // le jeu rend les éléments à `scale × inst.scale` (collision incluse).
    for (const inst of clone.instances) {
      const s = inst.scale ?? 1
      if (s === 1 || inst.elements === undefined) {continue}
      inst.elements = inst.elements.map((e): EmbeddedElement => {
        const scaled: EmbeddedElement = { ...e, scale: e.scale * s }
        if (scaled.shape?.kind === 'circle') {
          scaled.shape = { kind: 'circle', r: scaled.shape.r * s }
        }
        return scaled
      })
      inst.scale = 1
    }
    return serializeLayout(clone)
  }

  /**
   * IMPORTE le stage GÉNÉRÉ (celui que le jeu produit aujourd'hui) comme base de
   * travail éditable : chaque cluster devient une instance avec ses ÉLÉMENTS
   * embarqués (clôtures en segments, trous en cercles — préservés ; ENGINS/héros
   * non-collidables passés BLOQUANTS). Écrase la compo courante de ce stage.
   */
  importGenerated(): void {
    const gen = buildSiteLayout(1, WORLD_W, WORLD_H, this.stage)
    const offX = WORLD_W / 2
    const offY = WORLD_H / 2
    const instances: LayoutInstance[] = []
    for (const c of gen.clusters) {
      if (c.defId === 'cluster_route') {
        continue // la route/piste n'est pas une instance éditable
      }
      const def = CLUSTERS[c.defId]
      if (def === undefined) {
        continue
      }
      const elements: EmbeddedElement[] = def.elements.map((el): EmbeddedElement => {
        const role = editorAsset(el.assetKey)?.role
        // Un engin/structure/landmark = corps solide → collision. On reconnaît le
        // rôle via le catalogue actif OU, en repli, via la convention de nommage
        // (les engins/landmarks sont préfixés `struct_`/`landmark`), pour couvrir
        // les assets absents du catalogue courant.
        const key = el.assetKey
        const isEngine =
          role === 'structure' ||
          role === 'landmark' ||
          key.startsWith('struct_') ||
          key.startsWith('landmark')
        let collide: 'none' | 'both' | 'enemies' = el.collide
        let shape: EmbeddedShape | undefined =
          el.shape === undefined
            ? undefined
            : el.shape.kind === 'circle'
              ? { kind: 'circle', r: el.shape.r }
              : { kind: 'segment', x2: el.shape.x2, y2: el.shape.y2, thickness: el.shape.thickness }
        // Engins/héros décoratifs → rendus BLOQUANTS (cercle).
        if (isEngine && collide === 'none') {
          collide = 'both'
          shape = { kind: 'circle', r: Math.max(24, el.scale * 44) }
        }
        const e: EmbeddedElement = { assetKey: el.assetKey, dx: el.dx, dy: el.dy, scale: el.scale, collide }
        if (el.flipX === true) {
          e.flipX = true
        }
        if (shape !== undefined) {
          e.shape = shape
        }
        return e
      })
      instances.push({
        id: newId('instance'),
        prefab: c.defId,
        x: c.x - offX,
        y: c.y - offY,
        flipX: c.flipX ?? false,
        variant: 0,
        rotation: c.rotationDeg ?? 0,
        locked: false,
        elements
      })
    }
    // PNJ auto du stage → `LayoutNpc` ÉDITABLES (point de départ) : les métiers
    // du stage (`ambient`) + un ouvrier générique partagé. Positions dérivées
    // simples (petit anneau autour du centre) — l'utilisateur ajuste ensuite.
    const ambient = stageRender(this.stage).ambient ?? []
    const worker0 = SHARED_WORKER_NPCS[0]
    const seeds: Array<{ skin: string; kind: NpcKind }> = [
      ...ambient.map((n): { skin: string; kind: NpcKind } => ({ skin: n.key, kind: n.kind === 'worker' ? 'worker' : 'trade' })),
      ...(worker0 !== undefined ? [{ skin: worker0.key, kind: 'worker' as NpcKind }] : [])
    ]
    const npcs: LayoutNpc[] = seeds.map((s, i) => {
      const angle = (i / Math.max(1, seeds.length)) * Math.PI * 2
      const r = 260
      return { id: newId('npc'), skin: s.skin, kind: s.kind, x: Math.round(Math.cos(angle) * r), y: Math.round(Math.sin(angle) * r) }
    })

    // Destructibles auto (scatter) → instances ÉDITABLES `des_<typeId>` : le
    // ré-export préserve les objets cassables (sinon la compo committée aurait
    // zéro destructible et couperait le scatter). Coords MONDE → compo.
    for (const d of gen.destructibles ?? []) {
      const def = destructibleDef(d.typeId)
      const elements: EmbeddedElement[] =
        def === undefined ? [] : [{ assetKey: def.assetKey, dx: 0, dy: 0, scale: def.scale, collide: 'none' }]
      instances.push({
        id: newId('instance'),
        prefab: 'des_' + d.typeId,
        x: d.x - offX,
        y: d.y - offY,
        flipX: false,
        variant: 0,
        rotation: 0,
        locked: false,
        elements
      })
    }

    this.layout = emptyLayout(this.stage)
    this.layout.instances = instances
    this.layout.npcs = npcs
    this.selectOnly(null)
    this.emit()
  }
  /** Snippet TS prêt à coller (composition → constante typée que je consomme). */
  exportCode(): string {
    const l = this.layout
    const r = (n: number): number => Math.round(n)
    const insts = l.instances
      .map((i) => `    { prefab: '${i.prefab}', x: ${r(i.x)}, y: ${r(i.y)}, flipX: ${i.flipX} },`)
      .join('\n')
    const sig = this.signature
    const sigStr = sig === null ? 'null' : `{ x: ${r(sig.x)}, y: ${r(sig.y)}, w: ${r(sig.w)}, h: ${r(sig.h)} }`
    const paths = l.paths
      .map((p) => `    { type: '${p.type}', points: [${p.points.map((pt) => `{ x: ${r(pt.x)}, y: ${r(pt.y)} }`).join(', ')}] },`)
      .join('\n')
    const name = l.stage.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
    return (
      `// Composition éditeur — stage « ${l.stage} » (${l.instances.length} instances).\n` +
      `// Repère : origine (0,0) = centre monde (${l.worldSize.width / 2}, ${l.worldSize.height / 2}).\n` +
      `export const COMPOSED_${name} = {\n` +
      `  stage: '${l.stage}',\n` +
      `  spawn: { x: ${r(l.spawn.x)}, y: ${r(l.spawn.y)} },\n` +
      `  signature: ${sigStr},\n` +
      `  instances: [\n${insts}\n  ],\n` +
      `  paths: [\n${paths}\n  ],\n} as const\n`
    )
  }
  importJson(raw: string): { ok: boolean; error?: string } {
    const res = parseLayout(raw, this.stage)
    if (!res.ok || res.layout === undefined) {return { ok: false, error: res.error ?? 'JSON invalide' }}
    this.layout = res.layout
    this.selectOnly(null)
    this.emit()
    return { ok: true }
  }
  reset(): void {
    this.layout = emptyLayout(this.stage)
    this.selectOnly(null)
    this.emit()
  }

  // ── validation / warnings ───────────────────────────────────────────────────
  warnings(): Warning[] {
    const w: Warning[] = []
    const halfW = this.layout.worldSize.width / 2
    const halfH = this.layout.worldSize.height / 2
    if (this.layout.instances.length === 0) {w.push({ level: 'warn', message: 'Aucune instance placée.' })}
    // Les 4 macro-zones obligatoires (outil de conception) : signale les manquantes.
    for (const z of ZONE_DEFS) {
      if (this.zoneOf(z.type) === null) {w.push({ level: 'warn', message: `Zone manquante : ${z.label}.` })}
    }
    const scenes = this.layout.instances.filter((i) => paletteEntry(i.prefab)?.kind === 'scene')
    if (scenes.length < 3) {w.push({ level: 'warn', message: `Moins de 3 scènes principales (${scenes.length}).` })}
    for (const i of this.layout.instances) {
      if (paletteEntry(i.prefab) === undefined) {w.push({ level: 'error', message: `Prefab inconnu : ${i.prefab}.` })}
      if (Math.abs(i.x) > halfW || Math.abs(i.y) > halfH) {w.push({ level: 'warn', message: `Instance ${i.id} hors monde.` })}
    }
    // Warning spécifique fondations : au moins une scène « foundation » ou « slab ».
    const hasFoundation = this.layout.instances.some((i) => /foundation|slab/i.test(i.prefab))
    if (this.stage === 'fondations' && !hasFoundation) {
      w.push({ level: 'warn', message: 'Aucune scène de fondation/dalle placée (stage fondations).' })
    }
    return w
  }

  // ── persistance ─────────────────────────────────────────────────────────────
  private key(): string {
    return LS_PREFIX + this.stage
  }
  private save(): void {
    try {
      window.localStorage.setItem(this.key(), serializeLayout(this.layout))
    } catch {
      /* quota / private mode : on ignore, l'export JSON reste la source */
    }
  }
  private load(): StageLayout | null {
    try {
      const raw = window.localStorage.getItem(this.key())
      if (raw === null) {return null}
      const res = parseLayout(raw, this.stage)
      return res.ok ? (res.layout ?? null) : null
    } catch {
      return null
    }
  }
}
