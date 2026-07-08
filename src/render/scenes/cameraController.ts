import Phaser from 'phaser'
import type { AppViewState } from '@/app/appState'
import { shakeForDamage } from '@render/shakeForDamage'

/** Zoom cible en solo / dernier survivant (identique au zoom initial de `create()` = 1.2). */
const SOLO_ZOOM = 1.2
/** Vitesse de lerp du zoom caméra (par frame) — doux, jamais un « snap ». */
const CAMERA_ZOOM_LERP = 0.05
/** Vitesse de lerp du centrage caméra en coop (par frame) — évite le jitter. */
const CAMERA_SCROLL_LERP = 0.08
/**
 * Paliers de zoom de la caméra de groupe (coop) selon l'écartement max entre
 * joueurs vivants (px monde). Proches ⇒ 1.2 (identique au solo) ; on ne zoome
 * JAMAIS au-delà de 1.2 (pas de zoom avant) — seulement en arrière pour que
 * tout le monde reste cadré quand les joueurs s'écartent.
 */
const GROUP_ZOOM_TIERS: ReadonlyArray<{ maxSpread: number; zoom: number }> = [
  { maxSpread: 350, zoom: 1.2 },
  { maxSpread: 650, zoom: 1.0 },
  { maxSpread: 950, zoom: 0.82 },
]
/** Zoom de repli si l'écartement dépasse tous les paliers ci-dessus. */
const GROUP_ZOOM_FAR = 0.66

/**
 * Contrôleur de caméra extrait de GameScene : suivi solo (P1/dernier survivant)
 * + caméra de groupe en coop (≥2 vivants) — centroïde + zoom par paliers
 * d'écartement, tout lerpé. Détient l'état `following`. Ne fait rien pendant
 * l'intro (le rendu scripté gère le cadrage). Observer-only, aucun effet sim.
 */
export class CameraController {
  private following = false
  /** −1 = non initialisé (avant la première frame de jeu). */
  private lastTotalHp = -1
  /** Mode overview (outil de revue visuelle) : caméra gelée sur un cadrage fixe. null = suivi normal. */
  private overview: { zoom: number; cx: number; cy: number } | null = null

  constructor(private readonly scene: Phaser.Scene) {}

  /** Somme des PV de tous les joueurs de l'état courant. */
  private totalHp(state: AppViewState): number {
    return state.players.reduce((sum, p) => sum + p.hp, 0)
  }

  /** Fige la caméra en vue d'ensemble (capture de revue) ; `null` pour revenir au suivi normal. Render-only. */
  setOverview(o: { zoom: number; cx: number; cy: number } | null): void {
    this.overview = o
  }

  /** Coupe le suivi (nouvelle run / ré-armement de l'intro). */
  reset(): void {
    this.following = false
    this.lastTotalHp = -1
    this.scene.cameras.main.stopFollow()
  }

  /**
   * Met à jour la caméra selon l'état ; en solo suit le sprite du leader (via
   * `playerSprites`), en coop centre sur le centroïde des vivants et ajuste le zoom.
   */
  update(
    state: AppViewState,
    playerSprites: ReadonlyMap<number, Phaser.GameObjects.GameObject>
  ): void {
    // Mode overview (revue) : cadrage fixe, on court-circuite tout le suivi.
    if (this.overview !== null) {
      const cam = this.scene.cameras.main
      cam.stopFollow()
      this.following = false
      cam.setZoom(this.overview.zoom)
      cam.centerOn(this.overview.cx, this.overview.cy)
      return
    }
    if (state.introActive) {
      return
    }

    // Screenshake : suivi des PV totaux, déclenche le shake natif Phaser sur dégât.
    const curTotalHp = this.totalHp(state)
    if (this.lastTotalHp >= 0) {
      const s = shakeForDamage(this.lastTotalHp, curTotalHp)
      if (s !== null) {
        this.scene.cameras.main.shake(s.durationMs, s.intensity)
      }
    }
    this.lastTotalHp = curTotalHp

    const alive = state.players.filter((p) => p.alive)

    if (alive.length <= 1) {
      // Solo / dernier survivant : comportement identique à l'ancien `followLeader`.
      this.scene.cameras.main.zoom = Phaser.Math.Linear(this.scene.cameras.main.zoom, SOLO_ZOOM, CAMERA_ZOOM_LERP)
      if (this.following) {
        return
      }
      const leaderId = alive[0]?.id ?? 1
      const leader = playerSprites.get(leaderId)
      if (leader !== undefined) {
        this.scene.cameras.main.startFollow(leader, true, 0.1, 0.1)
        this.following = true
      }
      return
    }

    // Coop (≥2 vivants) : caméra de groupe, pas de suivi de sprite unique.
    if (this.following) {
      this.scene.cameras.main.stopFollow()
      this.following = false
    }

    let sumX = 0
    let sumY = 0
    for (const p of alive) {
      sumX += p.x
      sumY += p.y
    }
    const cx = sumX / alive.length
    const cy = sumY / alive.length

    let maxSpread = 0
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i]
        const b = alive[j]
        if (a === undefined || b === undefined) {
          continue
        }
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)
        if (d > maxSpread) {
          maxSpread = d
        }
      }
    }

    let targetZoom = GROUP_ZOOM_FAR
    for (const tier of GROUP_ZOOM_TIERS) {
      if (maxSpread < tier.maxSpread) {
        targetZoom = tier.zoom
        break
      }
    }

    const cam = this.scene.cameras.main
    cam.zoom = Phaser.Math.Linear(cam.zoom, targetZoom, CAMERA_ZOOM_LERP)
    const targetScrollX = cx - cam.width / 2 / cam.zoom
    const targetScrollY = cy - cam.height / 2 / cam.zoom
    cam.scrollX = Phaser.Math.Linear(cam.scrollX, targetScrollX, CAMERA_SCROLL_LERP)
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, targetScrollY, CAMERA_SCROLL_LERP)
  }
}
