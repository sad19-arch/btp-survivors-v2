import { REFERENCE_VIEW } from '@content/config'
import { MOBILE_BREAKPOINT } from './responsive'

/**
 * SOURCE DE VÉRITÉ RESPONSIVE UNIQUE (refonte mobile, Phase 3).
 *
 * Deux couches strictement séparées :
 *  1. `computeViewport(raw)` — calcul PUR, déterministe et idempotent : mêmes
 *     entrées ⇒ même état, testé en Vitest. AUCUN accès DOM ici.
 *  2. `ViewportBus` — pipeline d'événements DOM UNIQUE (resize, visualViewport,
 *     orientationchange, fullscreenchange, visibilitychange, pageshow) coalescé
 *     dans un rAF, avec détection de changement : les abonnés ne sont notifiés
 *     que si l'état a réellement changé (zéro re-layout parasite, quel que soit
 *     le CHEMIN — rotation, verrouillage/rallumage, barres navigateur, bfcache).
 *
 * Consommateurs (branchés progressivement, une phase à la fois) :
 *  - Overlay (échelle HUD + classe .ui-mobile)      — Phase 3
 *  - CameraController (cible de zoom `cameraZoom`)  — Phase 4
 *  - TouchInput (zones tactiles `controlReserves`)  — Phase 5
 *  - Bouton plein écran (état `fullscreen`)         — Phase 7
 *
 * Séparation des responsabilités : ce module ne calcule QUE de l'état de
 * viewport/présentation. La sim (`src/core`) ne le lit JAMAIS — les spawns
 * restent ancrés au REFERENCE_VIEW constant (déterminisme intact).
 */

// --- Constantes de la règle de zoom caméra (source unique, consommée en P4) ---

/**
 * Demi-diagonale (px monde) de la vue de RÉFÉRENCE PC (1920×1080 @ zoom 1.2)
 * — la même référence que le spawn hors-écran (`SPAWN.ringRadius` = cette
 * valeur + 122). Garder la diagonale visible ≤ cette référence garantit que
 * les ennemis continuent d'apparaître HORS écran, comme sur PC.
 */
export const REF_HALF_DIAG = Math.hypot(REFERENCE_VIEW.halfW, REFERENCE_VIEW.halfH)

/** Zoom desktop actuel (inchangé — parité PC stricte). */
export const DESKTOP_ZOOM = 1.2
/**
 * Plancher de zoom tactile : lisibilité (héros ~99 px monde ⇒ ≥ ~45 px écran)
 * + garde-fou écrans atypiques. Plafond = jamais plus zoomé que le desktop.
 */
export const TOUCH_ZOOM_MIN = 0.45
export const TOUCH_ZOOM_MAX = DESKTOP_ZOOM

/**
 * Fraction gauche de l'écran réservée au stick tactile (zone dynamique).
 * Même valeur que l'adaptateur actuel (`src/input/touch.ts`) — l'adaptateur
 * migrera sur `controlReserves` en Phase 5 (une seule source ensuite).
 */
export const STICK_ZONE_FRAC = 0.55

/** Largeur de conception du HUD (px) — base de l'échelle `--ui-scale` en largeur. */
const HUD_DESIGN_WIDTH = 720
/**
 * Budget vertical de conception du HUD (px). En PAYSAGE mobile la hauteur (~390 px)
 * est la vraie contrainte — sans elle, un écran large mais court laisse `--ui-scale`
 * à 1.0 et le HUD dévore la moitié de l'écran (bug paysage constaté). L'échelle finale
 * = min(ajustement largeur, ajustement hauteur).
 */
const HUD_DESIGN_HEIGHT = 780
/** Marge minimale autour du HUD lors du calcul d'échelle (px). */
const HUD_EDGE_MARGIN = 16
/**
 * Seuil de « petit côté » : en-dessous, présentation compacte (`.ui-mobile`)
 * quelle que soit la nature du pointeur. Rend la détection ROBUSTE au mode
 * « site pour ordinateur » et aux navigateurs qui ne remontent pas `pointer: coarse`
 * — un téléphone en paysage (~390 px de haut) bascule toujours en compact.
 */
const COMPACT_SHORT_SIDE = 560

// --- Types ------------------------------------------------------------------

/** Entrées BRUTES (lues du DOM par le bus, ou fabriquées par les tests). */
export interface RawViewportInputs {
  /** window.innerWidth/Height (toujours disponibles). */
  innerW: number
  innerH: number
  /** visualViewport.width/height si l'API existe (plus fiable avec les barres navigateur), sinon null. */
  vvW: number | null
  vvH: number | null
  /** matchMedia('(pointer: coarse)') — vrai périphérique tactile. */
  pointerCoarse: boolean
  /** devicePixelRatio (exposé pour information/diagnostic — le canvas reste en 1×, choix perf). */
  dpr: number
  /** document.fullscreenElement !== null. */
  fullscreen: boolean
  /** Safe areas (px) lues des vars CSS --safe-* (env(safe-area-inset-*)). */
  safe: { t: number; r: number; b: number; l: number }
}

/** Zones réservées aux contrôles tactiles (px CSS, repère fenêtre). */
export interface ControlReserves {
  /** Rectangle de la zone stick (moitié gauche dynamique), net des safe areas. */
  stick: { x: number; y: number; w: number; h: number }
}

/** État responsive cohérent — LA source de vérité des consommateurs. */
export interface ViewportState {
  /** Dimensions disponibles (visualViewport si dispo, sinon inner*). */
  availW: number
  availH: number
  /** Dimensions réellement utiles (nettes des safe areas). */
  usableW: number
  usableH: number
  /** availW / availH. */
  aspect: number
  orientation: 'portrait' | 'landscape'
  safe: { t: number; r: number; b: number; l: number }
  inputType: 'touch' | 'pointer'
  dpr: number
  fullscreen: boolean
  /** Breakpoint « étroit » (< MOBILE_BREAKPOINT px). */
  narrow: boolean
  /** HUD en présentation mobile (narrow OU tactile) — pilote .ui-mobile. */
  uiMobile: boolean
  /**
   * Cible de zoom caméra. Tactile : diagonale visible = diagonale de référence
   * PC (clampée [TOUCH_ZOOM_MIN, TOUCH_ZOOM_MAX]). Pointer : DESKTOP_ZOOM
   * constant (parité PC). TODO(user) : étendre la formule adaptative aux
   * petits écrans PC (pointer) — cf. tâche MOB-LATER.
   */
  cameraZoom: number
  /** Échelle globale du HUD (var CSS --ui-scale), snappée à 0.05. */
  uiScale: number
  controlReserves: ControlReserves
}

// --- Calcul pur ---------------------------------------------------------------

/** Arrondit à 2 décimales (stabilise l'égalité d'état face aux flottants DOM). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Calcule l'état responsive à partir d'entrées brutes. PUR, déterministe,
 * idempotent : aucune lecture d'horloge/DOM/random — testé en Vitest.
 */
export function computeViewport(raw: RawViewportInputs): ViewportState {
  const availW = round2(raw.vvW ?? raw.innerW)
  const availH = round2(raw.vvH ?? raw.innerH)
  const safe = {
    t: round2(raw.safe.t),
    r: round2(raw.safe.r),
    b: round2(raw.safe.b),
    l: round2(raw.safe.l)
  }
  const usableW = round2(Math.max(0, availW - safe.l - safe.r))
  const usableH = round2(Math.max(0, availH - safe.t - safe.b))
  const orientation: ViewportState['orientation'] = availW >= availH ? 'landscape' : 'portrait'
  const inputType: ViewportState['inputType'] = raw.pointerCoarse ? 'touch' : 'pointer'
  const narrow = availW < MOBILE_BREAKPOINT
  // Présentation compacte si : tactile, OU largeur étroite, OU petit côté (paysage
  // mobile / petite fenêtre) — la condition hauteur rend la détection robuste au
  // « site pour ordinateur » et corrige le HUD géant en paysage.
  const uiMobile = inputType === 'touch' || narrow || Math.min(availW, availH) < COMPACT_SHORT_SIDE

  // Zoom caméra : le canvas couvre TOUTE la fenêtre (viewport-fit=cover), la
  // caméra travaille donc sur avail* (pas usable*).
  const halfDiag = Math.hypot(availW, availH) / 2
  const cameraZoom =
    inputType === 'touch'
      ? round2(Math.min(TOUCH_ZOOM_MAX, Math.max(TOUCH_ZOOM_MIN, halfDiag / REF_HALF_DIAG)))
      : DESKTOP_ZOOM

  // Échelle HUD : fait rentrer le HUD dans la zone UTILE (safe areas déduites) en
  // LARGEUR **et** en HAUTEUR — on prend le plus contraignant des deux (en paysage
  // c'est la hauteur). Plancher 0.5, snap 0.05 (bordures 1 px nettes). Desktop : 1.
  const widthFit = (usableW - HUD_EDGE_MARGIN) / HUD_DESIGN_WIDTH
  const heightFit = (usableH - HUD_EDGE_MARGIN) / HUD_DESIGN_HEIGHT
  const rawScale = uiMobile ? Math.min(widthFit, heightFit) : 1
  const uiScale = Math.max(0.5, Math.min(1, Math.round(rawScale * 20) / 20))

  const controlReserves: ControlReserves = {
    stick: { x: safe.l, y: safe.t, w: round2(usableW * STICK_ZONE_FRAC), h: usableH }
  }

  return {
    availW,
    availH,
    usableW,
    usableH,
    aspect: availH === 0 ? 0 : round2(availW / availH),
    orientation,
    safe,
    inputType,
    dpr: round2(raw.dpr),
    fullscreen: raw.fullscreen,
    narrow,
    uiMobile,
    cameraZoom,
    uiScale,
    controlReserves
  }
}

/** Égalité profonde de deux états (détection de changement du bus). PURE. */
export function viewportStatesEqual(a: ViewportState, b: ViewportState): boolean {
  return (
    a.availW === b.availW &&
    a.availH === b.availH &&
    a.usableW === b.usableW &&
    a.usableH === b.usableH &&
    a.aspect === b.aspect &&
    a.orientation === b.orientation &&
    a.safe.t === b.safe.t &&
    a.safe.r === b.safe.r &&
    a.safe.b === b.safe.b &&
    a.safe.l === b.safe.l &&
    a.inputType === b.inputType &&
    a.dpr === b.dpr &&
    a.fullscreen === b.fullscreen &&
    a.narrow === b.narrow &&
    a.uiMobile === b.uiMobile &&
    a.cameraZoom === b.cameraZoom &&
    a.uiScale === b.uiScale &&
    a.controlReserves.stick.x === b.controlReserves.stick.x &&
    a.controlReserves.stick.y === b.controlReserves.stick.y &&
    a.controlReserves.stick.w === b.controlReserves.stick.w &&
    a.controlReserves.stick.h === b.controlReserves.stick.h
  )
}

// --- Bus d'événements (couche DOM) -------------------------------------------

type ViewportListener = (state: ViewportState) => void

/**
 * Pipeline d'événements responsive UNIQUE. Toutes les sources de changement
 * (resize, visualViewport, orientation, plein écran, retour de veille/arrière-
 * plan, bfcache) convergent vers UN recalcul coalescé par requestAnimationFrame ;
 * l'état n'est réémis que s'il a changé. Instancié UNE fois au boot (main.ts).
 *
 * Idempotence face au cycle de vie mobile : un rAF programmé pendant que la
 * page est cachée ne s'exécute qu'au retour au premier plan — le recalcul se
 * fait donc toujours sur les dimensions STABILISÉES (fix du bug « HUD déplacé
 * après verrouillage/rallumage »).
 */
export class ViewportBus {
  private state: ViewportState
  private readonly listeners = new Set<ViewportListener>()
  private rafId: number | null = null

  /** Un seul handler partagé par tous les événements (coalescence rAF). */
  private readonly schedule = (): void => {
    if (this.rafId !== null) {
      return
    }
    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null
      this.recompute()
    })
  }

  /** visibilitychange : ne recalcule qu'au RETOUR visible (les dims cachées ne comptent pas). */
  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      this.schedule()
    }
  }

  constructor() {
    this.state = computeViewport(this.readRaw())
    window.addEventListener('resize', this.schedule)
    window.addEventListener('orientationchange', this.schedule)
    window.addEventListener('pageshow', this.schedule)
    document.addEventListener('fullscreenchange', this.schedule)
    document.addEventListener('visibilitychange', this.onVisibility)
    // visualViewport suit les barres du navigateur/clavier virtuel (mobile).
    window.visualViewport?.addEventListener('resize', this.schedule)
  }

  /** État courant (toujours cohérent — recalculé au dernier événement stabilisé). */
  current(): ViewportState {
    return this.state
  }

  /**
   * Abonne un consommateur ; il reçoit IMMÉDIATEMENT l'état courant (pas
   * d'attente du premier événement). Retourne la fonction de désabonnement.
   */
  subscribe(fn: ViewportListener): () => void {
    this.listeners.add(fn)
    fn(this.state)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Force un recalcul immédiat (ex. après un toggle plein écran programmatique). */
  refresh(): void {
    this.recompute()
  }

  /** Retire tous les listeners DOM (démontage propre — symétrie du constructeur). */
  dispose(): void {
    window.removeEventListener('resize', this.schedule)
    window.removeEventListener('orientationchange', this.schedule)
    window.removeEventListener('pageshow', this.schedule)
    document.removeEventListener('fullscreenchange', this.schedule)
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.visualViewport?.removeEventListener('resize', this.schedule)
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.listeners.clear()
  }

  private recompute(): void {
    const next = computeViewport(this.readRaw())
    if (viewportStatesEqual(next, this.state)) {
      return
    }
    this.state = next
    for (const fn of this.listeners) {
      fn(next)
    }
  }

  /** Lit les entrées brutes du DOM (seul point de contact DOM du calcul). */
  private readRaw(): RawViewportInputs {
    const cs = window.getComputedStyle(document.documentElement)
    const inset = (name: string): number => {
      const v = Number.parseFloat(cs.getPropertyValue(name))
      return Number.isFinite(v) ? v : 0
    }
    return {
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      vvW: window.visualViewport?.width ?? null,
      vvH: window.visualViewport?.height ?? null,
      pointerCoarse:
        typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
      dpr: window.devicePixelRatio || 1,
      fullscreen: document.fullscreenElement !== null,
      safe: {
        t: inset('--safe-t'),
        r: inset('--safe-r'),
        b: inset('--safe-b'),
        l: inset('--safe-l')
      }
    }
  }
}
