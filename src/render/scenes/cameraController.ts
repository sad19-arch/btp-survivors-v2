import Phaser from 'phaser'
import type { AppViewState } from '@/app/appState'
import { shakeForDamage } from '@render/shakeForDamage'
import { type CamPose, type Ease, lerpCam } from '@render/cameraTrajectory'

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
 * Décroissance par frame du punch de zoom (juice #10). ~0.86 ⇒ le coup s'estompe
 * en ~12-15 frames. Le punch est ADDITIF (multiplie le zoom de repos), il ne
 * remplace jamais le zoom responsive.
 */
const ZOOM_PUNCH_DECAY = 0.86

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
  /**
   * Zoom « de repos » lerpé (sans le punch) — le zoom affiché = ce zoom × (1 + punchΔ).
   * −1 = non initialisé : au premier usage, on l'aligne sur le zoom COURANT de la caméra
   * (posé par `create()` depuis la source responsive), pour ne pas ré-imposer un lerp
   * depuis une valeur codée en dur (sinon la vue « zoome puis dézoome » au boot).
   */
  private baseZoomCurrent = -1
  /** Punch de zoom courant (juice #10) : décroît chaque frame vers 0. */
  private punchDelta = 0
  /** Mode overview (outil de revue visuelle) : caméra gelée sur un cadrage fixe. null = suivi normal. */
  private overview: CamPose | null = null
  /** Animation caméra en cours (mode overview animé). null = statique. */
  private camAnim: { from: CamPose; to: CamPose; ms: number; ease: Ease; elapsed: number } | null = null

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
    this.camAnim = null
    this.overview = null
    this.baseZoomCurrent = -1
    this.punchDelta = 0
    this.scene.cameras.main.stopFollow()
  }

  /**
   * Ajoute un punch de zoom (juice #10) sur un gros moment (évolution, super-coffre,
   * spawn/mort de boss). ADDITIF : `Math.max` pour ne pas empiler deux punchs, le
   * zoom affiché devient `zoomDeRepos × (1 + punchΔ)` puis décroît. Render-only.
   */
  addZoomPunch(amount: number): void {
    this.punchDelta = Math.max(this.punchDelta, amount)
  }

  /**
   * Coupe franche : place la caméra immédiatement sur le cadrage demandé.
   * Annule toute animation en cours.
   */
  camCut(cx: number, cy: number, zoom: number): void {
    this.overview = { cx, cy, zoom }
    this.camAnim = null
  }

  /**
   * Démarre une animation de caméra vers la pose cible sur `ms` millisecondes.
   * Si la caméra n'est pas en mode overview, pose d'abord le cadrage courant comme point de départ.
   */
  camZoomTo(cx: number, cy: number, zoom: number, ms: number, ease: Ease): void {
    const cam = this.scene.cameras.main
    const from: CamPose = this.overview ?? {
      cx: cam.midPoint.x,
      cy: cam.midPoint.y,
      zoom: cam.zoom,
    }
    const to: CamPose = { cx, cy, zoom }
    if (this.overview === null) {
      this.overview = from
    }
    this.camAnim = { from, to, ms, ease, elapsed: 0 }
  }

  /**
   * Punch-in : zoom rapide agressif vers (cx,cy,zoom) avec easeOut.
   * L'appelant passe un `ms` court (~80-150 ms) pour l'effet snap.
   */
  camPunchIn(cx: number, cy: number, zoom: number, ms: number): void {
    this.camZoomTo(cx, cy, zoom, ms, 'easeOut')
  }

  /**
   * Filé rapide : anime le centre vers (cx,cy) en gardant le zoom courant,
   * avec easing easeOut + micro-shake caméra pour simuler le flou de mouvement.
   */
  camWhipPan(cx: number, cy: number, ms: number): void {
    const cam = this.scene.cameras.main
    const currentZoom = this.overview?.zoom ?? cam.zoom
    this.camZoomTo(cx, cy, currentZoom, ms, 'easeOut')
    this.scene.cameras.main.shake(Math.min(ms, 120), 0.004)
  }

  /**
   * Met à jour la caméra selon l'état ; en solo suit le sprite du leader (via
   * `playerSprites`), en coop centre sur le centroïde des vivants et ajuste le zoom.
   *
   * `baseZoom` (P4 refonte mobile) : zoom de base fourni par la source de vérité
   * responsive, adaptatif à la TAILLE du viewport (pas au type d'entrée) — grand
   * écran = SOLO_ZOOM (1.2, comportement historique inchangé), petit écran (PC
   * ou tactile) = dé-zoomé pour voir autant de terrain. En coop on prend
   * min(baseZoom, palier d'écartement) : le dé-zoom de groupe ne peut que
   * ÉLARGIR la vue, jamais la resserrer en-deçà de la base.
   */
  update(
    state: AppViewState,
    playerSprites: ReadonlyMap<number, Phaser.GameObjects.GameObject>,
    baseZoom: number = SOLO_ZOOM
  ): void {
    // Mode overview (revue) : cadrage fixe ou animé, on court-circuite tout le suivi.
    if (this.overview !== null) {
      // Avance l'animation si active.
      if (this.camAnim !== null) {
        this.camAnim.elapsed += this.scene.game.loop.delta
        const t = this.camAnim.ms <= 0 ? 1 : this.camAnim.elapsed / this.camAnim.ms
        this.overview = lerpCam(this.camAnim.from, this.camAnim.to, t, this.camAnim.ease)
        if (t >= 1) {
          this.overview = this.camAnim.to
          this.camAnim = null
        }
      }
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

    // Décroissance du punch de zoom (juice #10) — une fois par frame de jeu actif.
    this.punchDelta = this.punchDelta > 0.0008 ? this.punchDelta * ZOOM_PUNCH_DECAY : 0

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
      // Solo / dernier survivant : le zoom de REPOS lerpe vers la base (desktop 1.2 ;
      // tactile adaptatif). Le zoom AFFICHÉ = repos × (1 + punch) — le punch #10
      // s'additionne puis s'estompe, sans jamais écraser le zoom responsive.
      if (this.baseZoomCurrent < 0) {
        this.baseZoomCurrent = this.scene.cameras.main.zoom
      }
      this.baseZoomCurrent = Phaser.Math.Linear(this.baseZoomCurrent, baseZoom, CAMERA_ZOOM_LERP)
      this.scene.cameras.main.zoom = this.baseZoomCurrent * (1 + this.punchDelta)
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

    let tierZoom = GROUP_ZOOM_FAR
    for (const tier of GROUP_ZOOM_TIERS) {
      if (maxSpread < tier.maxSpread) {
        tierZoom = tier.zoom
        break
      }
    }
    // Le palier d'écartement ne peut qu'ÉLARGIR la vue par rapport à la base
    // (desktop : min(1.2, palier) = palier — comportement historique inchangé).
    const targetZoom = Math.min(baseZoom, tierZoom)

    const cam = this.scene.cameras.main
    // Zoom de repos lerpé, puis punch #10 additif (comme en solo).
    if (this.baseZoomCurrent < 0) {
      this.baseZoomCurrent = cam.zoom
    }
    this.baseZoomCurrent = Phaser.Math.Linear(this.baseZoomCurrent, targetZoom, CAMERA_ZOOM_LERP)
    cam.zoom = this.baseZoomCurrent * (1 + this.punchDelta)
    // Dans Phaser, scrollX/scrollY décrivent le centre logique avec la taille
    // non zoomée de la caméra. Le zoom modifie `worldView`, pas ce décalage.
    // Diviser ici par le zoom décale donc la caméra de groupe dès que zoom !== 1.
    const targetScrollX = cx - cam.width / 2
    const targetScrollY = cy - cam.height / 2
    cam.scrollX = Phaser.Math.Linear(cam.scrollX, targetScrollX, CAMERA_SCROLL_LERP)
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, targetScrollY, CAMERA_SCROLL_LERP)
  }
}
