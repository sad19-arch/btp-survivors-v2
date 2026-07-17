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
import type { Vec2, MarkerType } from './StageLayoutSchema'
import { ZONE_DEFS, isZoneType } from './zones'
import { resolveWorkerSkin } from '@render/stages'

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
const DEPTH_NPC = 30 // PNJ au-dessus du décor, sous les marqueurs/sélection
const DEPTH_MARKER = 40
const DEPTH_SELECT = 45

/** Échelle de rendu ÉDITEUR d'un PNJ (lisibilité, indépendante du scale de jeu). */
const NPC_SCALE = 0.6

/** Tolérance de clic sur un tracé de chemin (px monde) — un trait est fin. */
const PATH_PICK_PX = 24

/** Distance d'un point au SEGMENT [a,b] (et non à la droite qui le porte). */
function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  // Segment dégénéré (points confondus) : distance au point, pas de division par 0.
  if (len2 < 0.0001) {return Math.hypot(p.x - a.x, p.y - a.y)}
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

interface InstanceView {
  container: Phaser.GameObjects.Container
  sig: string // signature (prefab+flip+variant) pour savoir s'il faut reconstruire les enfants
}

interface NpcView {
  container: Phaser.GameObjects.Container
  skin: string // reconstruire la vue si le skin change
}

export interface EditorSceneData {
  state: EditorState
  stageId: string
  onReady?: (scene: EditorScene) => void
}

/** Région visible du monde (barres de défilement DOM) : coin haut-gauche + taille + monde. */
export interface EditorViewRect {
  x: number
  y: number
  w: number
  h: number
  worldW: number
  worldH: number
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

  /** Nombre de points du tracé en cours (l'overlay l'affiche dans l'indice). */
  get pathDraftCount(): number {
    return this.pathDraft.length
  }

  private views = new Map<string, InstanceView>()
  private npcViews = new Map<string, NpcView>()
  private gfx!: Phaser.GameObjects.Graphics // grille + rect caméra + spawn + signature
  private pathGfx!: Phaser.GameObjects.Graphics
  private selGfx!: Phaser.GameObjects.Graphics // sélection + verrous
  private guideGfx!: Phaser.GameObjects.Graphics // guides d'alignement (pendant le drag)

  private dragId: string | null = null
  private dragIsNpc = false
  private dragOffset: Vec2 = { x: 0, y: 0 }
  private panning = false
  private panStart = { x: 0, y: 0, sx: 0, sy: 0 }
  // Macro-zones de conception (marqueurs éditeur) : redimension, déplacement, libellés.
  private resizingZone: MarkerType | null = null
  private movingZone: MarkerType | null = null
  private zoneDragLast: Vec2 | null = null
  private zoneLabels = new Map<MarkerType, Phaser.GameObjects.Text>()

  // Multi-sélection (lasso), glisser de groupe, presse-papier, barres de défilement.
  private groupDragLast: Vec2 | null = null
  private marqueeStart: Vec2 | null = null // coin de départ du lasso (coords MONDE)
  private marqueeAdditive = false
  private marqueeGfx!: Phaser.GameObjects.Graphics
  private batchActive = false // 1 pas d'undo par glisser/redimensionnement
  private lastPointerCompo: Vec2 = { x: 0, y: 0 } // dernière position curseur (compo) → coller au curseur
  private camSig = ''
  private onCameraChange: ((v: EditorViewRect) => void) | null = null

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

    // Caméra bornée au monde → le scroll (barres/molette/glisser) ne sort jamais.
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)

    this.pathGfx = this.add.graphics().setDepth(DEPTH_PATH)
    this.gfx = this.add.graphics().setDepth(DEPTH_MARKER)
    this.guideGfx = this.add.graphics().setDepth(DEPTH_MARKER + 1)
    this.selGfx = this.add.graphics().setDepth(DEPTH_SELECT)
    this.marqueeGfx = this.add.graphics().setDepth(DEPTH_SELECT + 2)
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
    // Notifie le DOM (barres de défilement) quand la région visible a changé.
    const wv = this.cameras.main.worldView
    const sig = `${Math.round(wv.x)}|${Math.round(wv.y)}|${Math.round(wv.width)}|${Math.round(wv.height)}`
    if (sig !== this.camSig) {
      this.camSig = sig
      this.onCameraChange?.({ x: wv.x, y: wv.y, w: wv.width, h: wv.height, worldW: WORLD_W, worldH: WORLD_H })
    }
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
    const p = this.state.applySnapFor(this.activePrefab, wx - OFFSET_X, wy - OFFSET_Y)
    const entry = paletteEntry(this.activePrefab)
    if (entry?.npcSkin !== undefined) {
      this.state.addNpc(entry.npcSkin, entry.npcKind ?? 'trade', OFFSET_X + p.x, OFFSET_Y + p.y)
      return
    }
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
  /** Abonne le DOM (barres de défilement) aux mouvements de caméra. */
  onCamera(fn: (v: EditorViewRect) => void): void {
    this.onCameraChange = fn
  }
  /** Positionne le coin haut-gauche visible (glisser d'une barre de défilement). */
  setViewTopLeft(x: number | null, y: number | null): void {
    const cam = this.cameras.main
    const wv = cam.worldView
    const cx = x !== null ? x + wv.width / 2 : cam.midPoint.x
    const cy = y !== null ? y + wv.height / 2 : cam.midPoint.y
    cam.centerOn(cx, cy)
  }

  // ── Entrées souris ──────────────────────────────────────────────────────────
  private setupInput(): void {
    // Molette = défilement (choix DA) : vertical par défaut, Maj = horizontal,
    // Ctrl = zoom. Le monde étant borné, le scroll est clampé automatiquement.
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      const cam = this.cameras.main
      const ev = p.event as WheelEvent | undefined
      if (ev?.ctrlKey === true) {
        const factor = dy > 0 ? 0.9 : 1.1
        cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX))
      } else if (ev?.shiftKey === true) {
        cam.scrollX += (dy !== 0 ? dy : dx) / cam.zoom
      } else {
        cam.scrollY += dy / cam.zoom
      }
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
    this.lastPointerCompo = comp

    // Poignée SE d'une macro-zone (redimensionnement) — prioritaire quand
    // aucun outil de pose n'est actif.
    if (this.activeMarker === null && this.activePrefab === null) {
      const handleZone = this.hitZoneHandle(w)
      if (handleZone !== null) {
        this.startBatch()
        this.resizingZone = handleZone
        this.state.selectZone(handleZone)
        return
      }
    }

    // Outil marqueur actif ?
    if (this.activeMarker !== null) {
      this.handleMarkerClick(this.activeMarker, comp)
      return
    }
    // Prefab actif → poser. Une entrée PNJ (npcSkin défini) pose un LayoutNpc
    // AVANT la branche instance (les PNJ sont un système distinct du décor).
    if (this.activePrefab !== null) {
      const s = this.state.applySnapFor(this.activePrefab, comp.x, comp.y)
      const entry = paletteEntry(this.activePrefab)
      if (entry?.npcSkin !== undefined) {
        this.state.addNpc(entry.npcSkin, entry.npcKind ?? 'trade', OFFSET_X + s.x, OFFSET_Y + s.y)
        return
      }
      this.state.addInstance(this.activePrefab, s.x, s.y)
      return
    }
    // Sinon : sélection. Maj/Ctrl = ajout/toggle ; sinon lasso sur espace vide.
    // PNJ (rendus au-dessus) prioritaires, puis instance la plus haute.
    const ev = p.event as { shiftKey?: boolean; ctrlKey?: boolean } | undefined
    const additive = ev?.shiftKey === true || ev?.ctrlKey === true
    const npcHit = this.pickNpc(w)
    const hit = npcHit ?? this.pickInstance(w)
    if (hit !== null) {
      if (additive) {
        this.state.toggleSelection(hit)
        return
      }
      // Objet déjà dans une multi-sélection → glisser TOUT le groupe (1 pas d'undo).
      if (this.state.isSelected(hit) && this.state.selectionCount > 1) {
        this.startBatch()
        this.groupDragLast = { x: comp.x, y: comp.y }
        return
      }
      // Sélection mono + glisser simple.
      this.state.select(hit)
      this.startBatch()
      this.dragId = hit
      this.dragIsNpc = npcHit !== null
      const obj = npcHit !== null ? this.state.npcs.find((n) => n.id === hit) : this.state.instances.find((i) => i.id === hit)
      if (obj !== undefined) {this.dragOffset = { x: comp.x - obj.x, y: comp.y - obj.y }}
      return
    }
    // Tracé de chemin sous le curseur → sélection (ouvre l'inspecteur de chemin).
    // Testé APRÈS les objets (un chemin passe souvent sous du décor) et AVANT les
    // macro-zones (qui couvrent de grandes surfaces et avaleraient tout clic).
    const pathHit = this.pickPath(comp)
    if (pathHit !== null) {
      this.state.selectZone(null)
      this.state.select(pathHit)
      return
    }
    // Macro-zone sous le curseur (aucune instance/PNJ/chemin touché) → sélection +
    // glisser du corps de la zone. État SÉPARÉ de la sélection d'instances.
    const zoneHit = this.pickZone(comp)
    if (zoneHit !== null) {
      this.state.selectZone(zoneHit)
      this.startBatch()
      this.movingZone = zoneHit
      this.zoneDragLast = { x: comp.x, y: comp.y }
      return
    }
    this.state.selectZone(null)
    // Espace vide → démarrer un lasso (rectangle de sélection).
    this.marqueeStart = { x: w.x, y: w.y }
    this.marqueeAdditive = additive
  }

  private startBatch(): void {
    if (!this.batchActive) {
      this.batchActive = true
      this.state.beginBatch()
    }
  }
  private endBatchIfAny(): void {
    if (this.batchActive) {
      this.batchActive = false
      this.state.endBatch()
    }
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.panning) {
      const cam = this.cameras.main
      cam.setScroll(this.panStart.sx - (p.x - this.panStart.x) / cam.zoom, this.panStart.sy - (p.y - this.panStart.y) / cam.zoom)
      return
    }
    const w0 = this.worldPoint(p)
    this.lastPointerCompo = { x: w0.x - OFFSET_X, y: w0.y - OFFSET_Y }

    // Lasso en cours : dessine le rectangle de sélection.
    if (this.marqueeStart !== null && p.leftButtonDown()) {
      const g = this.marqueeGfx
      g.clear()
      const x = Math.min(this.marqueeStart.x, w0.x)
      const y = Math.min(this.marqueeStart.y, w0.y)
      const ww = Math.abs(w0.x - this.marqueeStart.x)
      const hh = Math.abs(w0.y - this.marqueeStart.y)
      g.fillStyle(0x66ccff, 0.12).fillRect(x, y, ww, hh)
      g.lineStyle(2, 0x66ccff, 0.9).strokeRect(x, y, ww, hh)
      return
    }
    // Glisser de groupe : déplace toute la sélection du delta curseur.
    if (this.groupDragLast !== null && p.leftButtonDown()) {
      const comp = { x: w0.x - OFFSET_X, y: w0.y - OFFSET_Y }
      const dx = comp.x - this.groupDragLast.x
      const dy = comp.y - this.groupDragLast.y
      if (dx !== 0 || dy !== 0) {
        this.state.moveSelectionBy(dx, dy)
        this.groupDragLast = comp
      }
      return
    }
    // Redimension d'une macro-zone (poignée SE) → largeur/hauteur libres.
    if (this.resizingZone !== null && p.leftButtonDown()) {
      const w = this.worldPoint(p)
      const z = this.state.zoneOf(this.resizingZone)
      if (z !== null) {
        this.state.setZoneSize(this.resizingZone, w.x - OFFSET_X - z.x, w.y - OFFSET_Y - z.y)
      }
      return
    }
    // Glisser le corps d'une macro-zone → déplacement du delta curseur.
    if (this.movingZone !== null && p.leftButtonDown()) {
      const comp = { x: w0.x - OFFSET_X, y: w0.y - OFFSET_Y }
      const last = this.zoneDragLast ?? comp
      const dx = comp.x - last.x
      const dy = comp.y - last.y
      if (dx !== 0 || dy !== 0) {
        this.state.moveZone(this.movingZone, dx, dy)
        this.zoneDragLast = comp
      }
      return
    }
    if (this.dragId !== null && p.leftButtonDown()) {
      const w = this.worldPoint(p)
      const raw = { x: w.x - OFFSET_X - this.dragOffset.x, y: w.y - OFFSET_Y - this.dragOffset.y }
      // Prefab à pas IMPOSÉ (tuile de route) : la grille EST l'alignement. On
      // court-circuite `alignSnap` — son magnétisme de 22 px sur les bords des
      // objets voisins décalerait la tuile hors du pas de 256, et le raccord
      // sauterait sans que rien ne le signale.
      const inst = this.dragIsNpc ? undefined : this.state.instances.find((i) => i.id === this.dragId)
      const step = inst !== undefined ? this.state.snapStepFor(inst.prefab) : null
      if (step !== null && inst !== undefined) {
        const s = this.state.applySnapFor(inst.prefab, raw.x, raw.y)
        this.state.moveInstance(this.dragId, s.x, s.y)
        return
      }
      const gridSnap = this.state.applySnap(raw.x, raw.y)
      const aligned = this.alignSnap(gridSnap.x, gridSnap.y, this.dragId)
      if (this.dragIsNpc) {
        this.state.moveNpc(this.dragId, OFFSET_X + aligned.x, OFFSET_Y + aligned.y)
      } else {
        this.state.moveInstance(this.dragId, aligned.x, aligned.y)
      }
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
    // Finalise le lasso (sélection par intersection) s'il y en a un.
    if (this.marqueeStart !== null) {
      this.finishMarquee()
    }
    this.groupDragLast = null
    this.dragId = null
    this.dragIsNpc = false
    this.resizingZone = null
    this.movingZone = null
    this.zoneDragLast = null
    this.endBatchIfAny()
    this.guideGfx.clear()
  }

  /** Termine un lasso : sélectionne toutes les instances/npcs intersectés par le rect. */
  private finishMarquee(): void {
    const start = this.marqueeStart
    if (start === null) {return}
    this.marqueeStart = null
    this.marqueeGfx.clear()
    const end = this.worldPoint(this.input.activePointer)
    const rx = Math.min(start.x, end.x)
    const ry = Math.min(start.y, end.y)
    const rw = Math.abs(end.x - start.x)
    const rh = Math.abs(end.y - start.y)
    // Rectangle minuscule = simple clic sur le vide → désélectionne (sauf Maj/Ctrl).
    if (rw < 8 && rh < 8) {
      if (!this.marqueeAdditive) {this.state.clearSelection()}
      this.marqueeAdditive = false
      return
    }
    const rect = new Phaser.Geom.Rectangle(rx, ry, rw, rh)
    const ids: string[] = []
    for (const inst of this.state.instances) {
      const v = this.views.get(inst.id)
      if (v !== undefined && Phaser.Geom.Rectangle.Overlaps(rect, v.container.getBounds())) {ids.push(inst.id)}
    }
    for (const npc of this.state.npcs) {
      const v = this.npcViews.get(npc.id)
      if (v !== undefined && Phaser.Geom.Rectangle.Overlaps(rect, v.container.getBounds())) {ids.push(npc.id)}
    }
    if (this.marqueeAdditive) {
      const set = new Set(this.state.selectedIdSet())
      for (const id of ids) {set.add(id)}
      this.state.selectMany([...set])
    } else {
      this.state.selectMany(ids)
    }
    this.marqueeAdditive = false
  }

  /** Type de la macro-zone dont la poignée SE est sous `world` (monde), ou null. */
  private hitZoneHandle(world: Vec2): MarkerType | null {
    for (const def of ZONE_DEFS) {
      const z = this.state.zoneOf(def.type)
      if (z === null) {continue}
      const hx = OFFSET_X + z.x + z.w
      const hy = OFFSET_Y + z.y + z.h
      if (Math.abs(world.x - hx) <= SIG_HANDLE && Math.abs(world.y - hy) <= SIG_HANDLE) {return def.type}
    }
    return null
  }

  /** Type de la macro-zone la plus haute (dessinée en dernier) sous `comp` (compo), ou null. */
  private pickZone(comp: Vec2): MarkerType | null {
    for (let i = ZONE_DEFS.length - 1; i >= 0; i--) {
      const def = ZONE_DEFS[i]
      if (def === undefined) {continue}
      const z = this.state.zoneOf(def.type)
      if (z === null) {continue}
      if (comp.x >= z.x && comp.x <= z.x + z.w && comp.y >= z.y && comp.y <= z.y + z.h) {return def.type}
    }
    return null
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
    if (isZoneType(tool)) {
      this.state.placeZone(tool, comp.x, comp.y) // sélectionne + émet déjà
      this.drawOverlays()
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
    // `pathDraft` vit dans la SCÈNE, pas dans `EditorState` : poser un point
    // n'émet donc aucun changement d'état et le DOM ne se redessinait pas — le
    // compteur de points serait resté figé à 0, c'est-à-dire exactement le
    // « il ne se passe rien » qu'on est en train de corriger.
    this.refreshUi()
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

  /**
   * Chemin dont la POLYLIGNE passe à moins de PATH_PICK_PX du curseur, ou null.
   *
   * Sans ce test, un chemin n'était sélectionnable par AUCUN moyen (seuls les
   * instances et les PNJ l'étaient) : l'inspecteur de chemin resterait du code
   * mort et les réglages inatteignables.
   */
  private pickPath(comp: Vec2): string | null {
    const list = this.state.paths
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      if (p === undefined) {continue}
      for (let s = 0; s + 1 < p.points.length; s++) {
        const a = p.points[s]
        const b = p.points[s + 1]
        if (a === undefined || b === undefined) {continue}
        if (distToSegment(comp, a, b) <= PATH_PICK_PX) {return p.id}
      }
    }
    return null
  }

  private pickNpc(world: Vec2): string | null {
    const list = this.state.npcs
    for (let i = list.length - 1; i >= 0; i--) {
      const npc = list[i]
      if (npc === undefined) {continue}
      const view = this.npcViews.get(npc.id)
      if (view === undefined) {continue}
      const b = view.container.getBounds()
      if (b.contains(world.x, world.y)) {return npc.id}
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
      // Comme à la pose : le compteur de l'indice doit suivre le retrait.
      this.refreshUi()
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
    // Copier / coller multi (Ctrl/Cmd + C / V) — colle au curseur.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      this.state.copySelection()
      e.preventDefault()
      return
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      this.state.paste(this.lastPointerCompo.x, this.lastPointerCompo.y)
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
      case '+': case '=':
        if (this.state.selectedZone !== null) {this.state.scaleZone(this.state.selectedZone, 1.1)}
        else {this.state.nudgeSelectedScale(0.1)}
        e.preventDefault(); break
      case '-': case '_':
        if (this.state.selectedZone !== null) {this.state.scaleZone(this.state.selectedZone, 0.9)}
        else {this.state.nudgeSelectedScale(-0.1)}
        e.preventDefault(); break
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
      case 'Escape': this.clearActive(); this.state.select(null); this.state.selectZone(null); break
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
    elements: ReadonlyArray<{
      assetKey: string
      dx: number
      dy: number
      scale: number
      flipX?: boolean
      tile?: { w: number; h: number }
    }>,
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
      // Plaque de sol : texture répétée (comme en jeu), et non étirée — l'éditeur
      // doit montrer ce que le jeu rendra, sinon la compo ment.
      if (el.tile !== undefined) {
        children.push(this.add.tileSprite(dx, el.dy, el.tile.w * el.scale, el.tile.h * el.scale, el.assetKey))
        continue
      }
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
      // Position, ordre de plan (index → depth), rotation ET échelle uniforme par
      // instance (redimensionnement sans déformation — un seul facteur).
      view.container.setPosition(wx, wy)
      view.container.setDepth(DEPTH_INSTANCE + idx * 0.01)
      view.container.setRotation(Phaser.Math.DegToRad(inst.rotation))
      view.container.setScale(inst.scale ?? 1)
    }
    // Détruit les vues orphelines.
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.container.destroy()
        this.views.delete(id)
      }
    }
  }

  /** Rend les PNJ posés : sprite (skin, frame 0) + badge « fixe »/« mobile ». */
  private syncNpcs(): void {
    const seen = new Set<string>()
    for (const npc of this.state.npcs) {
      seen.add(npc.id)
      const wx = OFFSET_X + npc.x
      const wy = OFFSET_Y + npc.y
      // Alias : un brouillon d'avant le renommage pose `npc_ouvrier_a/b/c`.
      // Sans résolution, `textures.exists` échoue et l'éditeur afficherait un
      // placeholder à la place des 19 ouvriers déjà posés.
      const skin = resolveWorkerSkin(npc.skin)
      let view = this.npcViews.get(npc.id)
      if (view === undefined || view.skin !== skin) {
        view?.container.destroy()
        view = { container: this.buildNpcView(skin, npc.kind), skin }
        this.npcViews.set(npc.id, view)
      }
      view.container.setPosition(wx, wy)
      view.container.setDepth(DEPTH_NPC)
    }
    for (const [id, view] of this.npcViews) {
      if (!seen.has(id)) {
        view.container.destroy()
        this.npcViews.delete(id)
      }
    }
  }

  /** Container d'un PNJ : sprite (ou placeholder) + badge de catégorie au-dessus. */
  private buildNpcView(skin: string, kind: 'trade' | 'worker'): Phaser.GameObjects.Container {
    const children: Phaser.GameObjects.GameObject[] = []
    if (this.textures.exists(skin)) {
      children.push(this.add.sprite(0, 0, skin, 0).setScale(NPC_SCALE))
    } else {
      children.push(this.add.rectangle(0, 0, 90, 130, 0x3a6ea5).setStrokeStyle(4, 0x000000))
    }
    const badge = this.add
      .text(0, -78, kind === 'worker' ? 'mobile' : 'fixe', {
        fontFamily: 'monospace',
        fontSize: '38px',
        color: '#ffffff',
        backgroundColor: kind === 'worker' ? '#1f6f4f' : '#8a5a1f'
      })
      .setOrigin(0.5, 1)
      .setPadding(6, 2, 6, 2)
    children.push(badge)
    return this.add.container(0, 0, children)
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
    // Macro-zones de conception (marqueurs éditeur) : rect coloré + libellé +
    // poignée SE. Outil PUR — jamais lu par la sim/le rendu jeu.
    const seenZones = new Set<MarkerType>()
    for (const def of ZONE_DEFS) {
      const z = this.state.zoneOf(def.type)
      if (z === null) {continue}
      seenZones.add(def.type)
      const selected = this.state.selectedZone === def.type
      const zx = OFFSET_X + z.x
      const zy = OFFSET_Y + z.y
      g.fillStyle(def.color, selected ? 0.22 : 0.12).fillRect(zx, zy, z.w, z.h)
      g.lineStyle(selected ? 8 : 4, def.color, selected ? 1 : 0.85).strokeRect(zx, zy, z.w, z.h)
      g.fillStyle(def.color, 0.95).fillRect(zx + z.w - SIG_HANDLE / 2, zy + z.h - SIG_HANDLE / 2, SIG_HANDLE, SIG_HANDLE)
      g.lineStyle(3, 0x000000, 1).strokeRect(zx + z.w - SIG_HANDLE / 2, zy + z.h - SIG_HANDLE / 2, SIG_HANDLE, SIG_HANDLE)
      // Libellé (pool de Text réutilisé, indexé par type).
      let label = this.zoneLabels.get(def.type)
      if (label === undefined) {
        label = this.add
          .text(0, 0, def.label, { fontFamily: 'monospace', fontSize: '80px', color: '#ffffff' })
          .setDepth(DEPTH_MARKER + 1)
        label.setStroke('#000000', 8)
        this.zoneLabels.set(def.type, label)
      }
      label.setPosition(zx + 24, zy + 18).setVisible(true)
    }
    // Masque les libellés des zones absentes.
    for (const [type, label] of this.zoneLabels) {
      if (!seenZones.has(type)) {label.setVisible(false)}
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
      // Le chemin sélectionné est surligné : sans ça, rien ne relierait
      // visuellement le tracé cliqué aux réglages affichés par l'inspecteur.
      const isSel = this.state.selected === path.id
      if (isSel) {
        pg.lineStyle(14, 0xffffff, 0.55)
        this.strokePolyline(pg, path.points)
      }
      pg.lineStyle(8, path.type === 'truck_path' ? 0xd98a3a : 0x4fa0d0, isSel ? 1 : 0.8)
      this.strokePolyline(pg, path.points)
      // Extrémités : on doit voir OÙ un marcheur fait demi-tour / réapparaît.
      const first = path.points[0]
      const last = path.points[path.points.length - 1]
      if (first !== undefined) {pg.fillStyle(0x9be564, 0.95).fillCircle(OFFSET_X + first.x, OFFSET_Y + first.y, isSel ? 10 : 7)}
      if (last !== undefined && path.points.length > 1) {pg.fillStyle(0xe56464, 0.95).fillCircle(OFFSET_X + last.x, OFFSET_Y + last.y, isSel ? 10 : 7)}
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
    // Sélection courante (blanc + cyan) — chaque objet sélectionné (instance OU PNJ).
    for (const id of this.state.selectedIdSet()) {
      const view = this.views.get(id) ?? this.npcViews.get(id)
      if (view === undefined) {continue}
      const b = view.container.getBounds()
      sel.lineStyle(3, 0xffffff, 1).strokeRect(b.x, b.y, b.width, b.height)
      sel.lineStyle(2, 0x66ccff, 1).strokeRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6)
    }
  }

  private syncAll(): void {
    this.syncInstances()
    this.syncNpcs()
    this.drawOverlays()
    this.drawSelection()
    this.refreshUi()
  }
}
