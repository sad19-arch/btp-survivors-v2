/**
 * Décor animé de l'écran titre : des assets du jeu (engins, persos, PNJ, ennemis,
 * coffres) tombent du haut et REMPLISSENT tout l'écran en s'accumulant et se
 * chevauchant, jusqu'à un COLLAGE dense sans fond visible (réf. poster Street
 * Fighter fourni par l'utilisateur), puis boucle (fondu + re-remplissage).
 *
 * RESSOURCES MINIMALES — rendu sur CANVAS, pas de DOM par item :
 *  - `baseCanvas` : les items POSÉS y sont peints UNE fois (bitmap) → ensuite ils
 *    ne coûtent plus rien (aucun nœud, aucune couche, mémoire constante quel que
 *    soit le nombre d'items).
 *  - `fxCanvas` : uniquement les ~quelques items EN CHUTE, effacés+redessinés
 *    chaque frame (≤ CONCURRENT_CAP drawImage/frame, trivial).
 * Deux éléments <canvas> au total. La math de placement vit dans `titleFillModel`
 * (pur, testé). `Math.random` branché ici (rendu-only, autorisé hors core/content).
 */

import { CollageField, nextSpawnDelayMs, pickWeighted, type Rng } from './titleFillModel'
import { DROP_POOL } from './titleFillAssets'

interface Faller {
  img: HTMLImageElement
  frame: { cols: number; rows: number } | undefined
  w: number
  h: number
  x: number
  y: number
  vy: number
  restY: number
  rot: number // radians
}

const TARGET_FILL_MS = 60_000 // ~1 min pour saturer l'écran
const FULL_TIMES = 3 // chaque zone couverte ≥ 3 fois → collage très surchargé
const MAX_ITEMS = 3000 // backstop dur (canvas → coût quasi nul, mais on borne le remplissage)
const HOLD_MS = 20_000 // collage plein tenu 20 s avant le fondu + re-remplissage
const FADE_MS = 900 // durée du fondu de sortie
// Chute TRÈS LENTE (÷6 vs 1re version) — très posée.
const GRAVITY = 0.000265 // px/ms²
const V_MAX = 0.25 // px/ms — vitesse terminale
const CONCURRENT_CAP = 60 // items en chute simultanés (draws/frame sur fxCanvas ; cheap)
const PLUG_STEP = 12 // pas d'échantillonnage pixel pour détecter les trous
const PLUG_PASSES = 6 // passes max de bouchage des trous transparents
const DT_MAX = 50 // clamp du pas (retour d'onglet caché)

type Phase = 'filling' | 'holding' | 'fading'

export class TitleFill {
  private readonly base = import.meta.env.BASE_URL
  private readonly rng: Rng = Math.random
  private readonly images = new Map<string, HTMLImageElement>()
  private field: CollageField | null = null
  private baseCanvas: HTMLCanvasElement | null = null
  private fxCanvas: HTMLCanvasElement | null = null
  private baseCtx: CanvasRenderingContext2D | null = null
  private fxCtx: CanvasRenderingContext2D | null = null
  private active: Faller[] = []
  private fxDirty = false // vrai tant que fxCanvas doit être réécrit (items en chute)
  private bakedCount = 0
  private phase: Phase = 'filling'
  private running = false
  private rafId = 0
  private lastT = 0
  private nextSpawnAt = 0
  private phaseUntil = 0
  private capacity = 600
  private baseH = 72
  private width = 0
  private height = 0
  private readonly onResize = (): void => this.restart()

  constructor(private readonly container: HTMLElement) {}

  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    window.addEventListener('resize', this.onResize)
    const ready = this.preload()
    this.init()
    if (prefersReducedMotion()) {
      // Remplissage statique instantané : ATTEND que les images soient chargées,
      // sinon `drawImage` ne peint rien (canvas vide).
      void ready.then(() => {
        if (this.running) {
          this.fillStatic()
        }
      })
      return
    }
    this.rafId = window.requestAnimationFrame((t) => this.loop(t))
  }

  stop(): void {
    if (!this.running) {
      return
    }
    this.running = false
    window.cancelAnimationFrame(this.rafId)
    window.removeEventListener('resize', this.onResize)
    this.container.classList.remove('title-fill--fading')
    this.container.replaceChildren()
    this.active = []
    this.field = null
    this.baseCanvas = this.fxCanvas = null
    this.baseCtx = this.fxCtx = null
  }

  // ── interne ────────────────────────────────────────────────────────────────

  private preload(): Promise<void> {
    const seen = new Set<string>()
    const proms: Promise<void>[] = []
    for (const def of DROP_POOL) {
      if (seen.has(def.src)) {
        continue
      }
      seen.add(def.src)
      const img = new Image()
      img.decoding = 'async'
      proms.push(new Promise<void>((resolve) => {
        img.onload = (): void => resolve()
        img.onerror = (): void => resolve() // un asset manquant ne bloque pas le reste
      }))
      img.src = `${this.base}${def.src}`
      this.images.set(def.src, img)
    }
    return Promise.all(proms).then(() => undefined)
  }

  private restart(): void {
    if (!this.running) {
      return
    }
    window.cancelAnimationFrame(this.rafId)
    this.container.classList.remove('title-fill--fading')
    this.active = []
    this.init()
    if (prefersReducedMotion()) {
      this.fillStatic()
      return
    }
    this.rafId = window.requestAnimationFrame((t) => this.loop(t))
  }

  private init(): void {
    const rect = this.container.getBoundingClientRect()
    this.width = Math.max(1, Math.round(rect.width))
    this.height = Math.max(1, Math.round(rect.height))
    // Résolution = pixels CSS (DPR 1) : moins de pixels à peindre, DA pixel-art OK.
    this.baseCanvas = makeCanvas(this.width, this.height)
    this.fxCanvas = makeCanvas(this.width, this.height)
    this.baseCtx = ctx2d(this.baseCanvas)
    this.fxCtx = ctx2d(this.fxCanvas)
    this.container.replaceChildren(this.baseCanvas, this.fxCanvas)

    this.baseH = clampNum(this.height / 17, 36, 82)
    const cell = this.baseH * 0.7
    this.field = new CollageField(this.width, this.height, cell)
    this.capacity = Math.max(200, Math.round(this.field.cellCount() * FULL_TIMES * 0.8))
    this.bakedCount = 0
    this.fxDirty = false
    this.phase = 'filling'
    this.lastT = 0
    this.nextSpawnAt = 0
    this.phaseUntil = 0
  }

  private loop(t: number): void {
    if (!this.running) {
      return
    }
    const dt = this.lastT === 0 ? 16 : Math.min(DT_MAX, t - this.lastT)
    this.lastT = t
    if (!document.hidden) {
      this.step(t, dt)
    }
    this.rafId = window.requestAnimationFrame((next) => this.loop(next))
  }

  private step(t: number, dt: number): void {
    const field = this.field
    const fx = this.fxCtx
    const base = this.baseCtx
    const fxc = this.fxCanvas
    if (field === null || fx === null || base === null || fxc === null) {
      return
    }

    if (this.phase === 'filling') {
      while (
        t >= this.nextSpawnAt &&
        this.active.length < CONCURRENT_CAP &&
        this.bakedCount + this.active.length < MAX_ITEMS
      ) {
        this.spawn(field)
        this.nextSpawnAt = t + nextSpawnDelayMs(this.rng, TARGET_FILL_MS, this.capacity)
      }
    }

    // Fait tomber les items actifs ; à la pose, on les PEINT dans baseCanvas (bake).
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i]
      if (f === undefined) {
        continue
      }
      f.vy = Math.min(V_MAX, f.vy + GRAVITY * dt)
      f.y += f.vy * dt
      if (f.y >= f.restY) {
        f.y = f.restY
        drawSprite(base, f)
        this.bakedCount++
        this.active.splice(i, 1)
      }
    }

    // fxCanvas : uniquement les items en chute. On ne le touche QUE s'il y a des
    // items actifs (ou pour un dernier effacement quand le dernier vient de se
    // poser) → pendant les 20 s de hold, ZÉRO travail par frame.
    if (this.active.length > 0 || this.fxDirty) {
      fx.clearRect(0, 0, this.width, this.height) // moins cher qu'une réallocation du bitmap
      for (const f of this.active) {
        drawSprite(fx, f)
      }
      this.fxDirty = this.active.length > 0
    }

    // Transitions de phase.
    const saturated = field.isFull(FULL_TIMES) || this.bakedCount >= MAX_ITEMS
    if (this.phase === 'filling' && this.active.length === 0 && saturated) {
      this.plugHoles() // garantit zéro pixel transparent avant de figer le collage
      this.phase = 'holding'
      this.phaseUntil = t + HOLD_MS
    } else if (this.phase === 'holding' && t >= this.phaseUntil) {
      this.phase = 'fading'
      this.phaseUntil = t + FADE_MS
      this.container.classList.add('title-fill--fading')
    } else if (this.phase === 'fading' && t >= this.phaseUntil) {
      this.container.classList.remove('title-fill--fading')
      base.clearRect(0, 0, this.width, this.height)
      fxc.width = this.width
      field.reset()
      this.active = []
      this.bakedCount = 0
      this.phase = 'filling'
      this.nextSpawnAt = t
    }
  }

  /** Prépare un item (image chargée) qui tombera vers un trou du collage. */
  private spawn(field: CollageField): void {
    const def = pickWeighted(this.rng, DROP_POOL)
    const img = this.images.get(def.src)
    if (img === undefined || !img.complete || img.naturalWidth === 0) {
      return // image pas encore prête → on retentera à la prochaine frame
    }
    const h = this.baseH * (0.75 + this.rng() * 0.7)
    const w = h * def.aspect
    const { x, restY } = field.place(this.rng, w, h)
    const rot = ((this.rng() - 0.5) * 22 * Math.PI) / 180 // ±11°
    this.active.push({ img, frame: def.frame, w, h, x, y: -h - this.rng() * 80, vy: 0, restY, rot })
  }

  /**
   * Garantie « aucun pixel non recouvert » : lit RÉELLEMENT les pixels du canvas
   * de fond (la grille ignore la transparence des PNG) et peint un asset centré
   * sur chaque trou transparent, en plusieurs passes jusqu'à disparition. Coût
   * ponctuel (une seule fois par cycle, quand le collage est déjà quasi plein).
   */
  private plugHoles(): void {
    const base = this.baseCtx
    if (base === null) {
      return
    }
    const w = this.width
    const h = this.height
    const half = Math.floor(PLUG_STEP / 2)
    for (let pass = 0; pass < PLUG_PASSES; pass++) {
      let data: Uint8ClampedArray
      try {
        data = base.getImageData(0, 0, w, h).data
      } catch {
        return // canvas taint (ne devrait pas arriver, images same-origin) → on abandonne
      }
      let holes = 0
      for (let y = half; y < h; y += PLUG_STEP) {
        for (let x = half; x < w; x += PLUG_STEP) {
          if ((data[(y * w + x) * 4 + 3] ?? 0) >= 8) {
            continue // pixel déjà opaque
          }
          holes++
          const def = pickWeighted(this.rng, DROP_POOL)
          const img = this.images.get(def.src)
          if (img === undefined || !img.complete || img.naturalWidth === 0) {
            continue
          }
          const ph = this.baseH * (1.0 + this.rng() * 0.6) // un peu plus gros → couvre mieux
          const pw = ph * def.aspect
          const rot = ((this.rng() - 0.5) * 22 * Math.PI) / 180
          drawSprite(base, {
            img, frame: def.frame, w: pw, h: ph,
            x: x - pw / 2, y: y - ph / 2, vy: 0, restY: y - ph / 2, rot
          })
          this.bakedCount++
        }
      }
      if (holes === 0) {
        return // plus aucun pixel transparent
      }
    }
  }

  /** Reduced-motion : peint tout d'un coup dans baseCanvas, sans boucle. */
  private fillStatic(): void {
    const field = this.field
    const base = this.baseCtx
    if (field === null || base === null) {
      return
    }
    let guard = 0
    while (!field.isFull(FULL_TIMES) && this.bakedCount < MAX_ITEMS && guard < MAX_ITEMS) {
      guard++
      const def = pickWeighted(this.rng, DROP_POOL)
      const img = this.images.get(def.src)
      if (img === undefined || !img.complete || img.naturalWidth === 0) {
        continue
      }
      const h = this.baseH * (0.75 + this.rng() * 0.7)
      const w = h * def.aspect
      const { x, restY } = field.place(this.rng, w, h)
      const rot = ((this.rng() - 0.5) * 22 * Math.PI) / 180
      drawSprite(base, { img, frame: def.frame, w, h, x, y: restY, vy: 0, restY, rot })
      this.bakedCount++
    }
    this.plugHoles() // garantie zéro pixel transparent (même en statique)
  }
}

/** Peint un sprite (frame 0 « down » si feuille) à sa position, avec rotation. */
function drawSprite(ctx: CanvasRenderingContext2D, f: Faller): void {
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.translate(f.x + f.w / 2, f.y + f.h / 2)
  if (f.rot !== 0) {
    ctx.rotate(f.rot)
  }
  if (f.frame !== undefined) {
    const sw = f.img.naturalWidth / f.frame.cols
    const sh = f.img.naturalHeight / f.frame.rows
    ctx.drawImage(f.img, 0, 0, sw, sh, -f.w / 2, -f.h / 2, f.w, f.h)
  } else {
    ctx.drawImage(f.img, -f.w / 2, -f.h / 2, f.w, f.h)
  }
  ctx.restore()
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.className = 'title-fill__canvas'
  c.setAttribute('aria-hidden', 'true')
  return c
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = c.getContext('2d')
  if (ctx !== null) {
    ctx.imageSmoothingEnabled = false
  }
  return ctx
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
