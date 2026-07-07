/**
 * TelegraphRenderer (Task 10) — module observateur du télégraphe de formations.
 *
 * Lit `state.pendingFormations` et dessine :
 *   - Un **marqueur au sol** à l'origine annoncée de la formation (forme selon `kind`).
 *   - Une **flèche de bord d'écran** pointant l'origine depuis le joueur courant.
 *
 * Palette DA 16-bit (PRD) : jaune sécurité + orange danger. Pas de glow moderne.
 * Graphics/sprites poolés et bornés (0 ou 1 formation → trivial).
 *
 * CONTRAINTE ARCHITECTURE (règle 🔴) :
 *   Ce module ne contient QUE du rendu observateur. Aucune logique de jeu ici.
 *   `GameScene` instancie et délègue via `this.telegraph.sync(state, cam)`.
 */

import Phaser from 'phaser'
import type { GameState, PendingFormation } from '@core/types'
import { PALETTE_HEX } from '@ui/palette'

// ---------------------------------------------------------------------------
// Constantes de dessin DA 16-bit
// ---------------------------------------------------------------------------

/** Couleur principale du marqueur (jaune sécurité). */
const C_YELLOW = PALETTE_HEX.jauneSecurite
/** Couleur secondaire / urgence (orange danger). */
const C_ORANGE = PALETTE_HEX.orangeDanger
/** Épaisseur des traits du marqueur au sol (px monde). */
const LINE_THICKNESS = 4
/** Rayon de l'arc de marqueur pour les formations circulaires (px monde). */
const ARC_RADIUS = 80
/** Taille de la flèche de bord d'écran (px écran). */
const ARROW_SIZE = 20
/** Opacité de base du marqueur (clignotement géré via alpha). */
const BASE_ALPHA = 0.75

// ---------------------------------------------------------------------------
// TelegraphRenderer
// ---------------------------------------------------------------------------

/**
 * Classe observatrice du télégraphe. Instanciée par `GameScene.create()`,
 * synchronisée via `sync(state)` à chaque frame.
 */
export class TelegraphRenderer {
  /** Graphics du marqueur au sol (dans l'espace monde). */
  private readonly groundGfx: Phaser.GameObjects.Graphics
  /** Graphics de la flèche de bord d'écran (dans l'espace caméra — fixedToCamera). */
  private readonly arrowGfx: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene) {
    // Marqueur au sol : dans l'espace monde (pas de setScrollFactor — la caméra suit).
    this.groundGfx = scene.add.graphics()
    this.groundGfx.setDepth(0.5) // devant le sol, derrière les entités
    this.groundGfx.setVisible(false)

    // Flèche de bord : fixée à la caméra (espace écran).
    this.arrowGfx = scene.add.graphics()
    this.arrowGfx.setScrollFactor(0) // fixe à l'écran
    this.arrowGfx.setDepth(100)     // par-dessus tout
    this.arrowGfx.setVisible(false)
  }

  /**
   * Synchronise le rendu avec l'état courant.
   * Appelé chaque frame depuis `GameScene.syncSprites()`.
   *
   * @param state - État de jeu courant (source de vérité, lecture seule).
   * @param cam   - Caméra principale (pour la flèche de bord d'écran).
   */
  sync(state: GameState, cam: Phaser.Cameras.Scene2D.Camera): void {
    const formations = state.pendingFormations

    if (formations.length === 0) {
      this.groundGfx.setVisible(false)
      this.arrowGfx.setVisible(false)
      return
    }

    const formation = formations[0]
    if (formation === undefined) {
      this.groundGfx.setVisible(false)
      this.arrowGfx.setVisible(false)
      return
    }

    // Origine de la formation : centre des joueurs + vecteur polaire (angle/radius).
    const player = state.players.find((p) => p.alive) ?? state.players[0]
    const cx = player?.x ?? 0
    const cy = player?.y ?? 0
    const fx = cx + Math.cos(formation.angle) * formation.radius
    const fy = cy + Math.sin(formation.angle) * formation.radius

    // Clignotement : alpha modulé par `triggersInMs` (plus urgent = plus visible).
    const urgency = 1 - Math.min(1, formation.triggersInMs / 800)
    const alpha = BASE_ALPHA + urgency * 0.25

    // ── Marqueur au sol ──────────────────────────────────────────────────────
    this.groundGfx.clear()
    this.groundGfx.setVisible(true)
    this.groundGfx.setAlpha(alpha)
    this.drawGroundMarker(formation, fx, fy)

    // ── Flèche de bord d'écran ───────────────────────────────────────────────
    this.arrowGfx.clear()
    this.arrowGfx.setVisible(true)
    this.arrowGfx.setAlpha(alpha)
    this.drawEdgeArrow(cam, cx, cy, fx, fy)
  }

  /** Libère les Graphics Phaser (appelé au shutdown de la scène). */
  dispose(): void {
    this.groundGfx.destroy()
    this.arrowGfx.destroy()
  }

  // ---------------------------------------------------------------------------
  // Dessin du marqueur au sol (forme selon `kind`)
  // ---------------------------------------------------------------------------

  private drawGroundMarker(f: PendingFormation, fx: number, fy: number): void {
    switch (f.kind) {
      case 'encircle':
      case 'concentric':
        // Anneau complet → cercle avec ouvertures caractéristiques.
        this.drawAnneau(fx, fy)
        break
      case 'sweep':
      case 'columns':
        // Ligne horizontale → représente le mur qui traverse.
        this.drawLigne(fx, fy, f.angle)
        break
      case 'spiral':
        // Amorce de spirale (arc ouvert).
        this.drawSpiral(fx, fy)
        break
      case 'converge':
      case 'pincer':
      case 'burst':
      default:
        // Croix/losange générique.
        this.drawCroix(fx, fy)
        break
    }
  }

  /** Anneau DA 16-bit (encircle / concentric) : deux arcs concentriques. */
  private drawAnneau(fx: number, fy: number): void {
    const gfx = this.groundGfx
    gfx.lineStyle(LINE_THICKNESS, C_YELLOW, 1)
    gfx.strokeCircle(fx, fy, ARC_RADIUS)
    gfx.lineStyle(LINE_THICKNESS - 1, C_ORANGE, 0.6)
    gfx.strokeCircle(fx, fy, ARC_RADIUS * 0.6)
  }

  /** Ligne perpendiculaire à `angle` (sweep / columns). */
  private drawLigne(fx: number, fy: number, angle: number): void {
    const perp = angle + Math.PI / 2
    const len = ARC_RADIUS * 1.4
    const gfx = this.groundGfx
    gfx.lineStyle(LINE_THICKNESS, C_YELLOW, 1)
    gfx.beginPath()
    gfx.moveTo(fx + Math.cos(perp) * len, fy + Math.sin(perp) * len)
    gfx.lineTo(fx - Math.cos(perp) * len, fy - Math.sin(perp) * len)
    gfx.strokePath()
    // Flèche indiquant la direction de traversée.
    const ax = fx + Math.cos(angle) * 28
    const ay = fy + Math.sin(angle) * 28
    this.drawTriangle(gfx, ax, ay, angle, C_ORANGE)
  }

  /** Amorce de spirale (arc ouvert 270°). */
  private drawSpiral(fx: number, fy: number): void {
    const gfx = this.groundGfx
    gfx.lineStyle(LINE_THICKNESS, C_YELLOW, 1)
    // Arc externe 270°
    gfx.beginPath()
    gfx.arc(fx, fy, ARC_RADIUS, 0, Math.PI * 1.5, false)
    gfx.strokePath()
    // Arc interne décalé (spirale visuelle)
    gfx.lineStyle(LINE_THICKNESS - 1, C_ORANGE, 0.7)
    gfx.beginPath()
    gfx.arc(fx, fy, ARC_RADIUS * 0.5, Math.PI * 0.5, Math.PI * 2, false)
    gfx.strokePath()
  }

  /** Croix DA 16-bit pour les formations directes (converge/pincer/burst). */
  private drawCroix(fx: number, fy: number): void {
    const gfx = this.groundGfx
    const r = ARC_RADIUS * 0.6
    gfx.lineStyle(LINE_THICKNESS, C_YELLOW, 1)
    // Diagonale /
    gfx.beginPath()
    gfx.moveTo(fx - r, fy - r)
    gfx.lineTo(fx + r, fy + r)
    gfx.strokePath()
    // Diagonale \
    gfx.beginPath()
    gfx.moveTo(fx + r, fy - r)
    gfx.lineTo(fx - r, fy + r)
    gfx.strokePath()
    // Point central (orange).
    gfx.fillStyle(C_ORANGE, 1)
    gfx.fillCircle(fx, fy, 6)
  }

  // ---------------------------------------------------------------------------
  // Flèche de bord d'écran
  // ---------------------------------------------------------------------------

  /**
   * Dessine une flèche sur le bord de l'écran pointant vers l'origine de la
   * formation (espace écran). Si la formation est déjà visible dans la vue
   * caméra, aucune flèche n'est dessinée.
   */
  private drawEdgeArrow(
    cam: Phaser.Cameras.Scene2D.Camera,
    cx: number,
    cy: number,
    fx: number,
    fy: number
  ): void {
    const camX = cam.worldView.x
    const camY = cam.worldView.y
    const camW = cam.worldView.width
    const camH = cam.worldView.height

    // Si la formation est dans la vue, pas de flèche de bord.
    const margin = 40
    if (
      fx >= camX + margin &&
      fx <= camX + camW - margin &&
      fy >= camY + margin &&
      fy <= camY + camH - margin
    ) {
      return
    }

    // Convertit l'origine monde en coordonnées écran.
    const sx = (fx - camX) * cam.zoom
    const sy = (fy - camY) * cam.zoom
    // Centre de l'écran en coordonnées écran.
    const scx = (cx - camX) * cam.zoom
    const scy = (cy - camY) * cam.zoom

    // Direction de l'écran-centre vers la formation.
    const dx = sx - scx
    const dy = sy - scy
    const len = Math.hypot(dx, dy)
    if (len < 1) {
      return
    }
    const nx = dx / len
    const ny = dy / len

    // Clip sur le bord de l'écran (coordonnées écran).
    const W = cam.width
    const H = cam.height
    const edgePad = ARROW_SIZE + 8

    // Intersection rayon centre→formation avec les bords de l'écran.
    const point = clipRayToScreen(scx, scy, nx, ny, W, H, edgePad)
    if (point === null) {
      return
    }

    const angle = Math.atan2(ny, nx)
    this.arrowGfx.lineStyle(2, C_YELLOW, 1)
    this.arrowGfx.fillStyle(C_ORANGE, 1)
    this.drawTriangle(this.arrowGfx, point.x, point.y, angle, C_ORANGE)
  }

  // ---------------------------------------------------------------------------
  // Primitives
  // ---------------------------------------------------------------------------

  /** Dessine un triangle pointant dans `angle` (px écran ou monde selon `gfx`). */
  private drawTriangle(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    angle: number,
    color: number
  ): void {
    const s = ARROW_SIZE
    gfx.fillStyle(color, 1)
    gfx.fillTriangle(
      x + Math.cos(angle) * s,
      y + Math.sin(angle) * s,
      x + Math.cos(angle + 2.4) * (s * 0.7),
      y + Math.sin(angle + 2.4) * (s * 0.7),
      x + Math.cos(angle - 2.4) * (s * 0.7),
      y + Math.sin(angle - 2.4) * (s * 0.7)
    )
  }
}

// ---------------------------------------------------------------------------
// Utilitaire : clip d'un rayon sur les bords d'un rectangle écran
// ---------------------------------------------------------------------------

/**
 * Retourne le premier point d'intersection du rayon (`ox`, `oy`) + direction
 * (`dx`, `dy`) avec les bords intérieurs du rectangle [pad, W-pad] × [pad, H-pad].
 * Retourne `null` si aucune intersection (joueur hors écran ou direction nulle).
 */
function clipRayToScreen(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  W: number,
  H: number,
  pad: number
): { x: number; y: number } | null {
  const tCandidates: number[] = []

  if (Math.abs(dx) > 1e-6) {
    tCandidates.push((pad - ox) / dx)
    tCandidates.push((W - pad - ox) / dx)
  }
  if (Math.abs(dy) > 1e-6) {
    tCandidates.push((pad - oy) / dy)
    tCandidates.push((H - pad - oy) / dy)
  }

  let best: number | null = null
  for (const t of tCandidates) {
    if (t <= 0) {
      continue
    }
    const px = ox + dx * t
    const py = oy + dy * t
    if (px >= pad - 1 && px <= W - pad + 1 && py >= pad - 1 && py <= H - pad + 1) {
      if (best === null || t < best) {
        best = t
      }
    }
  }

  if (best === null) {
    return null
  }
  return { x: ox + dx * best, y: oy + dy * best }
}
