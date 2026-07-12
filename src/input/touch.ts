import type { Vec2 } from '@core/types'
import type { FrameInput } from './intents'
import { stickVector, clampToRadius } from './touchMath'

/** Rayon de course du stick (px écran) et deadzone (fraction du rayon). */
const STICK_RADIUS = 55
const STICK_DEADZONE = 0.15
/** Fraction gauche de l'écran où le stick s'active (« zone-gauche dynamique »). */
const LEFT_ZONE_FRAC = 0.55

/**
 * Adaptateur d'entrée TACTILE (couche input, comme keyboard.ts / gamepad.ts). Détient
 * son propre overlay DOM (stick virtuel + bouton pause) et ses listeners Pointer Events —
 * les listeners vivent donc bien dans l'adaptateur input, jamais dans un écran. Produit un
 * `FrameInput` fusionné dans P1 par `buildPlayerInputs`. Aucune logique de simulation.
 *
 * Stick « zone-gauche dynamique » : au `pointerdown` dans la moitié gauche, l'origine se
 * recentre sur le doigt puis se comporte en stick fixe jusqu'au relâché. Le bouton pause
 * (bas-droite) émet un front `pause` consommé en one-shot par `readFrame()`.
 */
export class TouchInput {
  private readonly layer: HTMLElement
  private readonly ring: HTMLElement
  private readonly knob: HTMLElement
  private readonly pauseBtn: HTMLElement

  private activeId: number | null = null
  private originX = 0
  private originY = 0
  private move: Vec2 = { x: 0, y: 0 }
  private pausePending = false

  private readonly onDown = (e: PointerEvent): void => this.handleDown(e)
  private readonly onMove = (e: PointerEvent): void => this.handleMove(e)
  private readonly onUp = (e: PointerEvent): void => this.handleUp(e)
  private readonly onPauseDown = (e: PointerEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    this.pausePending = true
  }
  private readonly onContext = (e: Event): void => e.preventDefault()

  constructor(parent: HTMLElement) {
    this.layer = document.createElement('div')
    this.layer.className = 'touch-layer'
    this.layer.style.display = 'none'

    this.ring = document.createElement('div')
    this.ring.className = 'touch-stick'
    this.knob = document.createElement('div')
    this.knob.className = 'touch-stick__knob'
    this.ring.append(this.knob)

    this.pauseBtn = document.createElement('div')
    this.pauseBtn.className = 'touch-pause'
    this.pauseBtn.textContent = 'II'

    this.layer.append(this.ring, this.pauseBtn)
    parent.append(this.layer)

    this.layer.addEventListener('pointerdown', this.onDown)
    this.layer.addEventListener('pointermove', this.onMove)
    this.layer.addEventListener('pointerup', this.onUp)
    this.layer.addEventListener('pointercancel', this.onUp)
    this.layer.addEventListener('contextmenu', this.onContext)
    this.pauseBtn.addEventListener('pointerdown', this.onPauseDown)
  }

  private handleDown(e: PointerEvent): void {
    e.preventDefault()
    if (this.activeId !== null) {
      return // un pointeur pilote déjà le stick (2e doigt ignoré côté stick)
    }
    if (e.clientX >= window.innerWidth * LEFT_ZONE_FRAC) {
      return // hors zone gauche → pas de stick (empêche quand même le scroll via preventDefault)
    }
    this.activeId = e.pointerId
    this.originX = e.clientX
    this.originY = e.clientY
    this.layer.setPointerCapture(e.pointerId)
    // Recentre l'anneau sur le doigt (la classe --active applique le translate de centrage).
    this.ring.style.left = `${this.originX}px`
    this.ring.style.top = `${this.originY}px`
    this.ring.style.right = 'auto'
    this.ring.style.bottom = 'auto'
    this.ring.classList.add('touch-stick--active')
    this.setKnob(0, 0)
  }

  private handleMove(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) {
      return
    }
    e.preventDefault()
    const dx = e.clientX - this.originX
    const dy = e.clientY - this.originY
    this.move = stickVector(dx, dy, STICK_RADIUS, STICK_DEADZONE)
    const k = clampToRadius(dx, dy, STICK_RADIUS)
    this.setKnob(k.x, k.y)
  }

  private handleUp(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) {
      return
    }
    this.activeId = null
    this.move = { x: 0, y: 0 }
    this.setKnob(0, 0)
    this.ring.classList.remove('touch-stick--active')
    // Repli à la base (vide les positions inline → la règle CSS de repos reprend).
    this.ring.style.left = ''
    this.ring.style.top = ''
    this.ring.style.right = ''
    this.ring.style.bottom = ''
    if (this.layer.hasPointerCapture(e.pointerId)) {
      this.layer.releasePointerCapture(e.pointerId)
    }
  }

  private setKnob(x: number, y: number): void {
    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
  }

  /** Affiche/masque l'overlay tactile (en jeu uniquement). Réinitialise l'état au masquage. */
  setVisible(visible: boolean): void {
    const next = visible ? 'block' : 'none'
    if (this.layer.style.display === next) {
      return
    }
    this.layer.style.display = next
    if (!visible) {
      this.activeId = null
      this.move = { x: 0, y: 0 }
      this.pausePending = false
      this.setKnob(0, 0)
      this.ring.classList.remove('touch-stick--active')
    }
  }

  /** Entrées tactiles de la frame (consomme le front `pause` en one-shot). */
  readFrame(): FrameInput {
    const frame: FrameInput = {
      move: { x: this.move.x, y: this.move.y },
      pressed: this.pausePending ? ['pause'] : [],
      action: false,
    }
    this.pausePending = false
    return frame
  }

  /** Retire listeners + DOM (appelé au shutdown de scène → pas de fuite au restart). */
  dispose(): void {
    this.layer.removeEventListener('pointerdown', this.onDown)
    this.layer.removeEventListener('pointermove', this.onMove)
    this.layer.removeEventListener('pointerup', this.onUp)
    this.layer.removeEventListener('pointercancel', this.onUp)
    this.layer.removeEventListener('contextmenu', this.onContext)
    this.pauseBtn.removeEventListener('pointerdown', this.onPauseDown)
    this.layer.remove()
  }
}
