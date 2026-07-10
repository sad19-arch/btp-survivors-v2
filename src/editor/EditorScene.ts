/**
 * EditorScene — la carte du Stage Composer Editor (Phaser).
 *
 * Rend le monde avec les VRAIS sprites au VRAI zoom, gère la caméra (pan/zoom),
 * le picking, le drag, les marqueurs (spawn / rect caméra / zone signature /
 * chemins) et la grille. L'état vit dans `EditorState` ; la scène observe et
 * dessine. Le DOM (palette/overlay) pilote la scène via ses méthodes publiques.
 *
 * Espace « composition » (origine = centre monde) → monde : + (worldW/2, worldH/2).
 */

import Phaser from 'phaser'
import { activeAssets, activeGroundKey, editorAsset, paletteEntry, setActiveStage, type MarkerTool, type PaletteEntry } from './PrefabCatalog'
import { EditorState } from './EditorState'
import type { Vec2 } from './StageLayoutSchema'

/** Zoom de jeu réel (identique à CameraController.SOLO_ZOOM). */
const GAME_ZOOM = 1.2
const WORLD_W = 10240
const WORLD_H = 7680
const OFFSET_X = WORLD_W / 2
const OFFSET_Y = WORLD_H / 2
const ZOOM_MIN = 0.1
const ZOOM_MAX = 1.6
const DEPTH_GROUND = 0
const DEPTH_PATH = 5
const DEPTH_INSTANCE = 10
const DEPTH_MARKER = 40
const DEPTH_SELECT = 45

interface InstanceView {
  container: Phaser.GameObjects.Container
  sig: string // signature (prefab+flip+variant) pour savoir s'il faut reconstruire les enfants
}

export interface EditorSceneData {
  state: EditorState
  stageId: string
  onReady?: (scene: EditorScene) => void
}

/** Taille (px monde) de la poignée de redimensionnement de la zone signature. */
const SIG_HANDLE = 90

export class EditorScene extends Phaser.Scene {
  state!: EditorState
  private stageId = 'fondations'
  private onReadyCb: ((scene: EditorScene) => void) | null = null
  private activePrefab: string | null = null
  private activeMarker: MarkerTool | null = null
  private pathDraft: Vec2[] = []
  private uiRefresh: (() => void) | null = null

  private views = new Map<string, InstanceView>()
  private gfx!: Phaser.GameObjects.Graphics // grille + rect caméra + spawn + signature
  private pathGfx!: Phaser.GameObjects.Graphics
  private selGfx!: Phaser.GameObjects.Graphics // sélection + verrous
  private guideGfx!: Phaser.GameObjects.Graphics // guides d'alignement (pendant le drag)

  private dragId: string | null = null
  private dragOffset: Vec2 = { x: 0, y: 0 }
  private panning = false
  private panStart = { x: 0, y: 0, sx: 0, sy: 0 }
  private resizingSig = false

  // Mode « parcourir » : un marqueur joueur pilotable au clavier (WASD/flèches).
  private walk = false
  private walkPos: Vec2 = { x: 0, y: 0 }
  private walkGfx!: Phaser.GameObjects.Graphics
  private walkKeys: Record<string, Phaser.Input.Keyboard.Key> = {}

  constructor() {
    super('editor')
  }

  init(data: EditorSceneData): void {
    this.state = data.state
    this.stageId = data.stageId
    this.onReadyCb = data.onReady ?? null
    setActiveStage(data.stageId)
  }

  preload(): void {
    for (const a of activeAssets()) {
      if (a.sheet === true) {
        this.load.spritesheet(a.key, a.file, { frameWidth: a.frame ?? 256, frameHeight: a.frame ?? 256 })
      } else {
        this.load.image(a.key, a.file)
      }
    }
    // Un asset manquant ne doit pas bloquer l'éditeur.
     
    this.load.on('loaderror', (f: Phaser.Loader.File) => console.warn('[editor] asset manquant:', f.key))
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#241b12')

    // Sol tuilé (contexte visuel) sur tout le monde.
    const gk = activeGroundKey()
    if (gk !== null && this.textures.exists(gk)) {
      this.add.tileSprite(0, 0, WORLD_W, WORLD_H, gk).setOrigin(0, 0).setDepth(DEPTH_GROUND)
    }

    this.pathGfx = this.add.graphics().setDepth(DEPTH_PATH)
    this.gfx = this.add.graphics().setDepth(DEPTH_MARKER)
    this.guideGfx = this.add.graphics().setDepth(DEPTH_MARKER + 1)
    this.selGfx = this.add.graphics().setDepth(DEPTH_SELECT)
    this.walkGfx = this.add.graphics().setDepth(DEPTH_SELECT + 1)

    // Touches de déplacement du marqueur « parcourir ».
    const kb = this.input.keyboard
    if (kb !== null) {
      this.walkKeys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>
    }

    // Caméra : vue d'ensemble centrée sur le monde.
    this.cameras.main.setZoom(0.32)
    this.cameras.main.centerOn(OFFSET_X, OFFSET_Y - 300)

    this.state.onChange(() => this.syncAll())
    this.setupInput()
    this.setupKeyboard()
    this.syncAll()

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown())
    this.onReadyCb?.(this)
  }

  update(_time: number, delta: number): void {
    if (!this.walk) {
      return
    }
    const spd = (0.55 * delta) / (this.cameras.main.zoom / GAME_ZOOM)
    const k = this.walkKeys
    let dx = 0
    let dy = 0
    if (k.A?.isDown === true || k.LEFT?.isDown === true) { dx -= 1 }
    if (k.D?.isDown === true || k.RIGHT?.isDown === true) { dx += 1 }
    if (k.W?.isDown === true || k.UP?.isDown === true) { dy -= 1 }
    if (k.S?.isDown === true || k.DOWN?.isDown === true) { dy += 1 }
    if (dx !== 0 || dy !== 0) {
      const m = Math.hypot(dx, dy)
      this.walkPos.x = Phaser.Math.Clamp(this.walkPos.x + (dx / m) * spd, 0, WORLD_W)
      this.walkPos.y = Phaser.Math.Clamp(this.walkPos.y + (dy / m) * spd, 0, WORLD_H)
    }
    this.cameras.main.centerOn(this.walkPos.x, this.walkPos.y)
    this.walkGfx.clear()
    this.walkGfx.fillStyle(0x66ccff, 1).fillCircle(this.walkPos.x, this.walkPos.y, 26)
    this.walkGfx.lineStyle(5, 0x000000, 1).strokeCircle(this.walkPos.x, this.walkPos.y, 26)
  }

  /** Bascule le mode « parcourir » (marqueur joueur WASD, zoom de jeu, panneaux masqués). */
  toggleWalk(): void {
    this.walk = !this.walk
    document.body.classList.toggle('sce-walk', this.walk)
    this.walkGfx.clear()
    if (this.walk) {
      this.walkPos = { x: OFFSET_X + this.state.spawn.x, y: OFFSET_Y + this.state.spawn.y }
      this.cameras.main.setZoom(GAME_ZOOM)
    }
    this.refreshUi()
  }
  get walking(): boolean {
    return this.walk
  }
  get stage(): string {
    return this.stageId
  }

  // ── API publique (DOM) ──────────────────────────────────────────────────────
  onUiRefresh(fn: () => void): void {
    this.uiRefresh = fn
  }
  private refreshUi(): void {
    this.uiRefresh?.()
  }
  get active(): { prefab: string | null; marker: MarkerTool | null } {
    return { prefab: this.activePrefab, marker: this.activeMarker }
  }
  selectPaletteEntry(entry: PaletteEntry): void {
    if (entry.marker !== undefined) {
      this.activeMarker = entry.marker
      this.activePrefab = null
      this.pathDraft = []
    } else {
      this.activePrefab = entry.id
      this.activeMarker = null
    }
    this.refreshUi()
  }
  clearActive(): void {
    this.activePrefab = null
    this.activeMarker = null
    this.pathDraft = []
    this.refreshUi()
  }
  placeActiveAtCenter(): void {
    if (this.activePrefab === null) {return}
    const cam = this.cameras.main
    const wx = cam.midPoint.x
    const wy = cam.midPoint.y
    const p = this.state.applySnap(wx - OFFSET_X, wy - OFFSET_Y)
    this.state.addInstance(this.activePrefab, p.x, p.y)
  }
  setZoom(z: number): void {
    this.cameras.main.setZoom(Phaser.Math.Clamp(z, ZOOM_MIN, ZOOM_MAX))
  }
  fitGameZoom(): void {
    const s = this.state.spawn
    this.cameras.main.setZoom(GAME_ZOOM)
    this.cameras.main.centerOn(OFFSET_X + s.x, OFFSET_Y + s.y)
  }
  fitOverview(): void {
    this.cameras.main.setZoom(0.32)
    this.cameras.main.centerOn(OFFSET_X, OFFSET_Y - 300)
  }

  // ── Entrées souris ──────────────────────────────────────────────────────────
  private setupInput(): void {
    // Zoom molette autour du curseur.
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main
      const factor = dy > 0 ? 0.9 : 1.1
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX))
    })

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p))
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p))
    this.input.on('pointerup', () => this.onPointerUp())
  }

  private worldPoint(p: Phaser.Input.Pointer): Vec2 {
    const w = this.cameras.main.getWorldPoint(p.x, p.y)
    return { x: w.x, y: w.y }
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    // Bouton droit / milieu → pan.
    if (p.rightButtonDown() || p.middleButtonDown()) {
      this.panning = true
      const cam = this.cameras.main
      this.panStart = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY }
      return
    }
    if (!p.leftButtonDown()) {return}

    const w = this.worldPoint(p)
    const comp = { x: w.x - OFFSET_X, y: w.y - OFFSET_Y }

    // Poignée SE de la zone signature (redimensionnement) — prioritaire quand
    // aucun outil de pose n'est actif.
    if (this.activeMarker === null && this.activePrefab === null && this.hitSignatureHandle(w)) {
      this.resizingSig = true
      return
    }

    // Outil marqueur actif ?
    if (this.activeMarker !== null) {
      this.handleMarkerClick(this.activeMarker, comp)
      return
    }
    // Prefab actif → poser.
    if (this.activePrefab !== null) {
      const s = this.state.applySnap(comp.x, comp.y)
      this.state.addInstance(this.activePrefab, s.x, s.y)
      return
    }
    // Sinon : sélection d'une instance (la plus haute).
    const hit = this.pickInstance(w)
    if (hit !== null) {
      this.state.select(hit)
      this.dragId = hit
      const inst = this.state.instances.find((i) => i.id === hit)
      if (inst !== undefined) {this.dragOffset = { x: comp.x - inst.x, y: comp.y - inst.y }}
    } else {
      this.state.select(null)
    }
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.panning) {
      const cam = this.cameras.main
      cam.setScroll(this.panStart.sx - (p.x - this.panStart.x) / cam.zoom, this.panStart.sy - (p.y - this.panStart.y) / cam.zoom)
      return
    }
    if (this.resizingSig && p.leftButtonDown()) {
      const w = this.worldPoint(p)
      const s = this.state.signature
      if (s !== null) {
        this.state.setSignatureSize(w.x - OFFSET_X - s.x, w.y - OFFSET_Y - s.y)
      }
      return
    }
    if (this.dragId !== null && p.leftButtonDown()) {
      const w = this.worldPoint(p)
      const raw = { x: w.x - OFFSET_X - this.dragOffset.x, y: w.y - OFFSET_Y - this.dragOffset.y }
      const gridSnap = this.state.applySnap(raw.x, raw.y)
      const aligned = this.alignSnap(gridSnap.x, gridSnap.y, this.dragId)
      this.state.moveInstance(this.dragId, aligned.x, aligned.y)
    }
  }

  /** Aligne x/y sur une autre instance / le spawn / le centre monde (guides magenta). */
  private alignSnap(x: number, y: number, excludeId: string): Vec2 {
    const TH = 22
    const xs = [0, this.state.spawn.x]
    const ys = [0, this.state.spawn.y]
    for (const inst of this.state.instances) {
      if (inst.id === excludeId) {continue}
      xs.push(inst.x)
      ys.push(inst.y)
    }
    let sx = x
    let sy = y
    let gx: number | null = null
    let gy: number | null = null
    let bestX = TH
    for (const cx of xs) {
      const d = Math.abs(x - cx)
      if (d < bestX) { bestX = d; sx = cx; gx = cx }
    }
    let bestY = TH
    for (const cy of ys) {
      const d = Math.abs(y - cy)
      if (d < bestY) { bestY = d; sy = cy; gy = cy }
    }
    const g = this.guideGfx
    g.clear()
    g.lineStyle(2, 0xff5fbf, 0.9)
    if (gx !== null) { g.lineBetween(OFFSET_X + gx, 0, OFFSET_X + gx, WORLD_H) }
    if (gy !== null) { g.lineBetween(0, OFFSET_Y + gy, WORLD_W, OFFSET_Y + gy) }
    return { x: sx, y: sy }
  }

  private onPointerUp(): void {
    this.panning = false
    this.dragId = null
    this.resizingSig = false
    this.guideGfx.clear()
  }

  private hitSignatureHandle(world: Vec2): boolean {
    const s = this.state.signature
    if (s === null) {
      return false
    }
    const hx = OFFSET_X + s.x + s.w
    const hy = OFFSET_Y + s.y + s.h
    return Math.abs(world.x - hx) <= SIG_HANDLE && Math.abs(world.y - hy) <= SIG_HANDLE
  }

  private finishPath(): void {
    if (this.activeMarker === 'truck_path' || this.activeMarker === 'worker_path') {
      if (this.pathDraft.length >= 2) {
        this.state.addPath(this.activeMarker, this.pathDraft.slice())
      }
      this.pathDraft = []
      this.clearActive()
    }
  }

  private handleMarkerClick(tool: MarkerTool, comp: Vec2): void {
    if (tool === 'spawn') {
      this.state.setSpawn(comp.x, comp.y)
      return
    }
    if (tool === 'signature_zone') {
      this.state.setSignature(comp.x, comp.y)
      return
    }
    // Chemins : on accumule des points, double-clic (détecté par proximité) ferme.
    this.pathDraft.push(comp)
    if (this.pathDraft.length >= 2) {
      // Fermeture auto si on reclique près du dernier point (double-clic léger).
      const last = this.pathDraft[this.pathDraft.length - 1]
      const prev = this.pathDraft[this.pathDraft.length - 2]
      if (last !== undefined && prev !== undefined && Math.hypot(last.x - prev.x, last.y - prev.y) < 40) {
        this.pathDraft.pop()
        this.state.addPath(tool, this.pathDraft.slice())
        this.pathDraft = []
        this.clearActive()
      }
    }
    this.drawOverlays()
  }

  private pickInstance(world: Vec2): string | null {
    // Du plus récent (dessus) au plus ancien.
    const list = this.state.instances
    for (let i = list.length - 1; i >= 0; i--) {
      const inst = list[i]
      if (inst === undefined) {continue}
      const view = this.views.get(inst.id)
      if (view === undefined) {continue}
      const b = view.container.getBounds()
      if (b.contains(world.x, world.y)) {return inst.id}
    }
    return null
  }

  // ── Clavier ─────────────────────────────────────────────────────────────────
  private readonly onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null
    if (t !== null && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {return}

    // Parcourir (P).
    if (e.key === 'p' || e.key === 'P') { this.toggleWalk(); return }
    // Tracé de chemin : Entrée termine, Retour arrière retire le dernier point.
    const drafting = (this.activeMarker === 'truck_path' || this.activeMarker === 'worker_path') && this.pathDraft.length > 0
    if (e.key === 'Enter') { this.finishPath(); e.preventDefault(); return }
    if (drafting && (e.key === 'Backspace' || e.key === 'Delete')) {
      this.pathDraft.pop()
      this.drawOverlays()
      e.preventDefault()
      return
    }

    // Annuler / rétablir (Ctrl/Cmd + Z, Ctrl+Shift+Z, Ctrl+Y).
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) { this.state.redo() } else { this.state.undo() }
      e.preventDefault()
      return
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      this.state.redo()
      e.preventDefault()
      return
    }

    const big = e.shiftKey ? 64 : 8
    switch (e.key) {
      case 'ArrowUp': this.state.nudge(0, -big); e.preventDefault(); break
      case 'ArrowDown': this.state.nudge(0, big); e.preventDefault(); break
      case 'ArrowLeft': this.state.nudge(-big, 0); e.preventDefault(); break
      case 'ArrowRight': this.state.nudge(big, 0); e.preventDefault(); break
      case 'Delete':
      case 'Backspace': this.state.deleteSelected(); e.preventDefault(); break
      case 'd': case 'D':
        if (e.ctrlKey || e.metaKey) { this.state.duplicateSelected(); e.preventDefault() }
        break
      case 'f': case 'F': this.state.flipSelected(); break
      case 'v': case 'V': this.state.cycleVariant(); break
      case 'r': case 'R': this.state.rotateSelected(e.shiftKey ? -15 : 15); break
      case 'l': case 'L': this.state.toggleLockSelected(); break
      case ']': this.state.bringSelectedToFront(); break
      case '[': this.state.sendSelectedToBack(); break
      case 'g': case 'G': this.state.toggleGrid(); break
      case 's': case 'S': {
        const p = this.input.activePointer
        const w = this.worldPoint(p)
        this.state.setSpawn(w.x - OFFSET_X, w.y - OFFSET_Y)
        break
      }
      case 'Escape': this.clearActive(); this.state.select(null); break
      default: break
    }
  }
  private setupKeyboard(): void {
    window.addEventListener('keydown', this.onKey)
  }

  private teardown(): void {
    window.removeEventListener('keydown', this.onKey)
    this.input.removeAllListeners()
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────
  private instanceSig(prefab: string, flipX: boolean, variant: number): string {
    return `${prefab}|${flipX ? 1 : 0}|${variant}`
  }

  private buildChildren(
    elements: ReadonlyArray<{ assetKey: string; dx: number; dy: number; scale: number; flipX?: boolean }>,
    flipX: boolean
  ): Phaser.GameObjects.GameObject[] {
    const children: Phaser.GameObjects.GameObject[] = []
    for (const el of elements) {
      const dx = flipX ? -el.dx : el.dx
      const asset = editorAsset(el.assetKey)
      if (!this.textures.exists(el.assetKey)) {
        // Placeholder visible (jamais casser).
        const g = this.add.rectangle(dx, el.dy, 40 * el.scale, 40 * el.scale, 0x884422).setStrokeStyle(2, 0x000000)
        children.push(g)
        continue
      }
      const flip = flipX !== (el.flipX === true)
      if (asset?.sheet === true) {
        const spr = this.add.sprite(dx, el.dy, el.assetKey, 0).setScale(el.scale).setFlipX(flip)
        children.push(spr)
      } else {
        const img = this.add.image(dx, el.dy, el.assetKey).setScale(el.scale).setFlipX(flip)
        children.push(img)
      }
    }
    return children
  }

  private syncInstances(): void {
    const seen = new Set<string>()
    const list = this.state.instances
    for (let idx = 0; idx < list.length; idx++) {
      const inst = list[idx]
      if (inst === undefined) {continue}
      seen.add(inst.id)
      // Éléments à dessiner : ceux EMBARQUÉS dans l'instance (stage importé) en
      // priorité, sinon ceux du prefab de la palette. Un stage généré importé
      // n'a pas d'entrée de palette pour ses clusters → on rend ses elements.
      const elements = inst.elements ?? paletteEntry(inst.prefab)?.elements
      if (elements === undefined || elements.length === 0) {continue}
      const wx = OFFSET_X + inst.x
      const wy = OFFSET_Y + inst.y
      const sig = this.instanceSig(inst.prefab, inst.flipX, inst.variant) + (inst.elements !== undefined ? '|e' : '')
      let view = this.views.get(inst.id)
      if (view === undefined) {
        const container = this.add.container(wx, wy, this.buildChildren(elements, inst.flipX))
        view = { container, sig }
        this.views.set(inst.id, view)
      } else if (view.sig !== sig) {
        view.container.removeAll(true)
        view.container.add(this.buildChildren(elements, inst.flipX))
        view.sig = sig
      }
      // Position, ordre de plan (index → depth) et rotation par instance.
      view.container.setPosition(wx, wy)
      view.container.setDepth(DEPTH_INSTANCE + idx * 0.01)
      view.container.setRotation(Phaser.Math.DegToRad(inst.rotation))
    }
    // Détruit les vues orphelines.
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.container.destroy()
        this.views.delete(id)
      }
    }
  }

  private drawOverlays(): void {
    const g = this.gfx
    g.clear()
    // Bordure du monde.
    g.lineStyle(6, 0x000000, 0.6).strokeRect(0, 0, WORLD_W, WORLD_H)
    // Grille.
    if (this.state.grid) {
      g.lineStyle(1, 0xffffff, 0.08)
      const step = this.state.gridSize
      for (let x = 0; x <= WORLD_W; x += step) {g.lineBetween(x, 0, x, WORLD_H)}
      for (let y = 0; y <= WORLD_H; y += step) {g.lineBetween(0, y, WORLD_W, y)}
    }
    // Zone signature + poignée de redimensionnement au coin SE.
    const s = this.state.signature
    if (s !== null) {
      const zx = OFFSET_X + s.x
      const zy = OFFSET_Y + s.y
      g.fillStyle(0x2f8f6f, 0.14).fillRect(zx, zy, s.w, s.h)
      g.lineStyle(4, 0x2f8f6f, 0.9).strokeRect(zx, zy, s.w, s.h)
      g.fillStyle(0x2f8f6f, 0.95).fillRect(zx + s.w - SIG_HANDLE / 2, zy + s.h - SIG_HANDLE / 2, SIG_HANDLE, SIG_HANDLE)
      g.lineStyle(3, 0x000000, 1).strokeRect(zx + s.w - SIG_HANDLE / 2, zy + s.h - SIG_HANDLE / 2, SIG_HANDLE, SIG_HANDLE)
    }
    // Rectangle caméra (ce que voit le joueur au spawn, zoom de jeu).
    const cp = this.state.cameraPreview
    const rw = cp.width / GAME_ZOOM
    const rh = cp.height / GAME_ZOOM
    const sx = OFFSET_X + this.state.spawn.x
    const sy = OFFSET_Y + this.state.spawn.y
    g.lineStyle(4, 0xffd166, 0.9).strokeRect(sx - rw / 2, sy - rh / 2, rw, rh)
    // Spawn (croix + point).
    g.lineStyle(4, 0x66ccff, 1)
    g.lineBetween(sx - 60, sy, sx + 60, sy)
    g.lineBetween(sx, sy - 60, sx, sy + 60)
    g.fillStyle(0x66ccff, 1).fillCircle(sx, sy, 14)

    // Chemins existants + brouillon.
    const pg = this.pathGfx
    pg.clear()
    for (const path of this.state.paths) {
      pg.lineStyle(8, path.type === 'truck_path' ? 0xd98a3a : 0x4fa0d0, 0.8)
      this.strokePolyline(pg, path.points)
    }
    if (this.pathDraft.length > 0) {
      pg.lineStyle(6, 0xffffff, 0.7)
      this.strokePolyline(pg, this.pathDraft)
      for (const p of this.pathDraft) {pg.fillStyle(0xffffff, 0.9).fillCircle(OFFSET_X + p.x, OFFSET_Y + p.y, 8)}
    }
  }

  private strokePolyline(g: Phaser.GameObjects.Graphics, pts: readonly Vec2[]): void {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      if (a === undefined || b === undefined) {continue}
      g.lineBetween(OFFSET_X + a.x, OFFSET_Y + a.y, OFFSET_X + b.x, OFFSET_Y + b.y)
    }
  }

  private drawSelection(): void {
    const sel = this.selGfx
    sel.clear()
    // Contour orange sur les instances VERROUILLÉES (repère permanent).
    sel.lineStyle(2, 0xffb424, 0.9)
    for (const inst of this.state.instances) {
      if (!inst.locked) {continue}
      const v = this.views.get(inst.id)
      if (v === undefined) {continue}
      const lb = v.container.getBounds()
      sel.strokeRect(lb.x, lb.y, lb.width, lb.height)
    }
    // Sélection courante (blanc + cyan).
    const inst = this.state.selectedInstance()
    if (inst === null) {return}
    const view = this.views.get(inst.id)
    if (view === undefined) {return}
    const b = view.container.getBounds()
    sel.lineStyle(3, 0xffffff, 1).strokeRect(b.x, b.y, b.width, b.height)
    sel.lineStyle(2, 0x66ccff, 1).strokeRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6)
  }

  private syncAll(): void {
    this.syncInstances()
    this.drawOverlays()
    this.drawSelection()
    this.refreshUi()
  }
}
