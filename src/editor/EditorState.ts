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
  type LayoutNpc,
  type LayoutPath,
  type NpcKind,
  type StageLayout,
  type Vec2
} from './StageLayoutSchema'
import { editorAsset, paletteEntry } from './PrefabCatalog'
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
  private selectedId: string | null = null
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
    this.selectedId = null
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
    return this.layout.markers.find((m) => m.type === 'signature_zone') ?? null
  }
  get paths(): readonly LayoutPath[] {
    return this.layout.paths
  }
  get cameraPreview(): { width: number; height: number } {
    return this.layout.cameraPreview
  }
  get selected(): string | null {
    return this.selectedId
  }
  selectedInstance(): LayoutInstance | null {
    return this.layout.instances.find((i) => i.id === this.selectedId) ?? null
  }
  selectedNpc(): LayoutNpc | null {
    return this.layout.npcs.find((n) => n.id === this.selectedId) ?? null
  }

  // ── sélection ───────────────────────────────────────────────────────────────
  select(id: string | null): void {
    this.selectedId = id
    this.emit()
  }

  // ── instances ─────────────────────────────────────────────────────────────
  addInstance(prefab: string, x: number, y: number): LayoutInstance {
    const inst: LayoutInstance = { id: newId('instance'), prefab, x, y, flipX: false, variant: 0, rotation: 0, locked: false }
    this.layout.instances.push(inst)
    this.selectedId = inst.id
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
  nudge(dx: number, dy: number): void {
    const inst = this.selectedInstance()
    if (inst !== null) {
      if (inst.locked) {return}
      inst.x += dx
      inst.y += dy
      this.emit()
      return
    }
    const npc = this.selectedNpc()
    if (npc !== null) {
      npc.x += dx
      npc.y += dy
      this.emit()
    }
  }
  deleteSelected(): void {
    if (this.selectedId === null) {return}
    const id = this.selectedId
    this.layout.instances = this.layout.instances.filter((i) => i.id !== id)
    this.layout.npcs = this.layout.npcs.filter((n) => n.id !== id)
    this.selectedId = null
    this.emit()
  }
  duplicateSelected(): void {
    const inst = this.selectedInstance()
    if (inst === null) {return}
    const copy: LayoutInstance = { ...inst, id: newId('instance'), x: inst.x + 96, y: inst.y + 96 }
    this.layout.instances.push(copy)
    this.selectedId = copy.id
    this.emit()
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
  toggleLockSelected(): void {
    const inst = this.selectedInstance()
    if (inst === null) {return}
    inst.locked = !inst.locked
    this.emit()
  }
  /** Ordre de plan : passe l'instance sélectionnée devant (fin du tableau = dessus). */
  bringSelectedToFront(): void {
    const id = this.selectedId
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
    const id = this.selectedId
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
    this.selectedId = npc.id
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

  // ── zone signature ──────────────────────────────────────────────────────────
  setSignature(x: number, y: number): void {
    const existing = this.signature
    if (existing !== null) {
      existing.x = x - existing.w / 2
      existing.y = y - existing.h / 2
    } else {
      this.layout.markers.push({ id: 'signature_zone', type: 'signature_zone', x: x - 700, y: y - 500, w: 1400, h: 1000 })
    }
    this.emit()
  }
  resizeSignature(dw: number, dh: number): void {
    const s = this.signature
    if (s === null) {return}
    s.w = Math.max(200, s.w + dw)
    s.h = Math.max(200, s.h + dh)
    this.emit()
  }
  setSignatureSize(w: number, h: number): void {
    const s = this.signature
    if (s === null) {return}
    s.w = Math.max(200, w)
    s.h = Math.max(200, h)
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
   * `collide` dérivé du rôle) → le cœur peut le consommer sans le catalogue.
   * Les prefabs qui SONT des clusters gardent leur collision fine côté jeu.
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
        if (block) {
          e.shape = { kind: 'circle', r: Math.max(16, el.scale * 40) }
        }
        if (el.flipX === true) {
          e.flipX = true
        }
        return e
      })
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
    this.selectedId = null
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
    this.selectedId = null
    this.emit()
    return { ok: true }
  }
  reset(): void {
    this.layout = emptyLayout(this.stage)
    this.selectedId = null
    this.emit()
  }

  // ── validation / warnings ───────────────────────────────────────────────────
  warnings(): Warning[] {
    const w: Warning[] = []
    const halfW = this.layout.worldSize.width / 2
    const halfH = this.layout.worldSize.height / 2
    if (this.layout.instances.length === 0) {w.push({ level: 'warn', message: 'Aucune instance placée.' })}
    if (this.signature === null) {w.push({ level: 'warn', message: 'Aucune zone signature définie.' })}
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
