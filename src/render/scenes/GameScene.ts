import Phaser from 'phaser'
import type { App } from '@/app/app'
import type { GameSeam } from '@/app/seam'
import { KeyboardInput } from '@input/keyboard'
import { GamepadInput } from '@input/gamepad'
import { routeInput, type FrameInput } from '@input/intents'
import { buildPlayerInputs } from '@input/players'
import { INTRO, WORLD, CONE_HALF_ANGLE } from '@content/config'
import { createGround } from '@render/ground'
import { createProps, createLandmark, createStructures, phaseSalt } from '@render/props'
import { dirRow, walkFrame, idleFrame } from '@render/sprites'
import { stageRender, type StageRender, FINAL_BOSS_SKIN } from '@render/stages'
import { SpritePool } from '@render/spritePool'
import { computeHitEvents } from '@render/hitDiff'
import { hitFlashUntil, DamageNumberPool } from '@render/damageNumbers'
import { AuraPulseEvent, PrisonerFreedEvent } from '@core/events'
import type { EvolvedEvent } from '@core/events'
import type { PlayerState, PrisonerState, PickupKind } from '@core/types'
import { PALETTE_HEX, PALETTE } from '@ui/palette'
import { playerColor } from '@content/players'
import { characterDef } from '@content/characters'
import type { AppViewState } from '@/app/appState'

/** Feuille PARTAGÉE (tous stages) : le joueur. Ennemis ET boss sont PAR STAGE (voir stages.ts). */
const SHARED_SHEETS: ReadonlyArray<readonly [string, string, number]> = [['player', 'player_j1.png', 192]]
/**
 * Échelles de rendu. Le joueur est partagé ; ennemis et boss prennent leur échelle
 * du stage (l'art natif PixelLab a des hauteurs variables, cf. measure-sprite-size.mjs).
 * Cibles ~hauteur affichée : joueur 83 · tank ~88 · rapide ~70 · base ~74 · boss ~144.
 */
const PLAYER_SCALE = 0.516
const DEFAULT_CHAR_SCALE = 0.516
/** Délai d'immobilité (ms) avant que le héros ne joue son animation d'attente impatiente. */
const IDLE_EMOTE_MS = 4000
/** Décalage vertical (px monde) d'où le héros entre en marchant pendant l'intro. */
const INTRO_ENTER_OFFSET = 380

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

/** Sprites de projectiles par type d'arme (spin = rotation continue ; faceVel = orienté vers la vitesse). */
const PROJ_SPRITE: Record<string, { key: string; scale: number; spin: boolean; faceVel: boolean }> = {
  scie: { key: 'proj_scie', scale: 0.8, spin: true, faceVel: false },
  cloueur: { key: 'proj_cloueur', scale: 0.8, spin: false, faceVel: true },
  // Armes Phase A (Persos) — sprites dédiés PixelLab (A2 lot 2).
  boulons: { key: 'proj_boulons', scale: 0.55, spin: false, faceVel: true },
  tempete_boulons: { key: 'proj_boulons', scale: 0.55, spin: false, faceVel: true },
  cle_molette: { key: 'proj_cle', scale: 0.7, spin: true, faceVel: false },
  cle_choc: { key: 'proj_cle', scale: 0.7, spin: true, faceVel: false },
  brouette: { key: 'proj_brouette', scale: 1.0, spin: false, faceVel: true },
  transpalette: { key: 'proj_brouette', scale: 1.2, spin: false, faceVel: true },
}
/**
 * Sprites de pickups par type. Typé `Record<PickupKind, …>` : le compilateur
 * EXIGE une entrée pour chaque type de pickup du cœur — ajouter un `PickupKind`
 * sans sprite ici devient une erreur `tsc` (garde-fou : c'est l'oubli de
 * `coffre` qui rendait le coffre d'évolution invisible, cf. playtest).
 */
const PICKUP_SPRITE: Record<PickupKind, { key: string; scale: number }> = {
  xp: { key: 'pickup_xp', scale: 0.5 },
  heal: { key: 'pickup_health', scale: 0.55 },
  magnet: { key: 'pickup_magnet', scale: 0.55 },
  chest: { key: 'pickup_crate', scale: 0.6 },
  // Coffre d'évolution (boss mi-parcours) : réutilise la caisse, un cran plus
  // gros que `chest` pour marquer le moment d'évolution.
  coffre: { key: 'pickup_crate', scale: 0.72 },
}

export interface GameSceneData {
  app: App
  testMode: boolean
  seam: GameSeam | null
  /** Mode allégé (e2e) : ne charge pas les feuilles de sprites lourdes → cercles. */
  lite?: boolean
}

const PLAYER_COLOR = 0x3498db
const PLAYER_RADIUS = 16
const ENEMY_COLOR = 0xe74c3c
const ENEMY_RADIUS = 12
const PROJECTILE_COLOR = 0xf5c542
const PROJECTILE_RADIUS = 5
const PICKUP_COLOR = 0x3ddc84
const PICKUP_RADIUS = 5
/** Clamp du delta réel pour éviter la spirale de la mort après un gel d'onglet. */
const MAX_FRAME_MS = 100

/** Sprite de personnage : feuille pixel-art si l'asset existe, sinon cercle de repli. */
type CharSprite = Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc

/**
 * Scène de jeu : couche RENDU. Elle observe `Simulation.getState()` et dessine ;
 * elle n'abrite aucune logique de gameplay. En mode test, ni le clavier ni le
 * temps réel ne pilotent la sim — seul le seam le fait (déterminisme).
 */
export class GameScene extends Phaser.Scene {
  private app!: App
  private testMode = false
  private seam: GameSeam | null = null
  private lite = false
  /** Données d'init conservées pour relancer la scène (changement de stage). */
  private sceneData!: GameSceneData
  /** stageId dont les assets sont actuellement chargés (pour détecter un changement). */
  private loadedStageId = ''
  /** runId de la partie actuellement rendue (pour détecter un restart même stage). */
  private loadedRunId = -1
  /** Vrai pendant un chargement dynamique de feuille(s) de perso (évite d'en re-lancer). */
  private loadingSheets = false
  /** Config de rendu du stage courant (sol/décalques/props/skins d'ennemis). */
  private stage!: StageRender
  private keyboardInput: KeyboardInput | null = null
  private gamepads: GamepadInput[] = []
  private following = false
  private readonly playerSprites = new Map<number, CharSprite>()
  /**
   * Anneau coloré au sol sous chaque joueur (identité co-op, T3/CO-2). Un seul
   * Graphics persistant, effacé/redessiné chaque frame — pas d'objet par joueur
   * à fuir, pas de pooling nécessaire (≤4 ellipses). Masqué en solo (aucun
   * changement visuel quand `players.length===1`).
   */
  private playerRings!: Phaser.GameObjects.Graphics
  /**
   * Barre de progrès de relève au-dessus des joueurs à terre (co-op). Un seul
   * Graphics persistant, effacé/redessiné chaque frame — même schéma que
   * `playerRings` (pas d'objet par joueur à gérer/détruire).
   */
  private reviveBars!: Phaser.GameObjects.Graphics
  /**
   * Flaques de goudron au sol (hazards) : un seul Graphics persistant effacé/redessiné
   * chaque frame — aucun objet créé/détruit par flaque (pas de fuite). Profondeur < entités.
   */
  private hazardGraphics!: Phaser.GameObjects.Graphics
  /** Sprite de flaque de goudron par hazard (A2 lot 3) : créé à l'apparition, détruit à l'expiration. */
  private readonly hazardSprites = new Map<number, Phaser.GameObjects.Image>()
  private readonly enemySprites = new Map<number, CharSprite>()
  /**
   * PV de l'ennemi à la frame précédente — permet de détecter les dégâts reçus
   * frame-par-frame (diff HP) pour déclencher flash + chiffres + pop d'impact.
   * Vidé dans `resetRunState`. Ids disparus nettoyés dans la boucle de release.
   */
  private readonly prevEnemyHp = new Map<number, number>()
  /**
   * Instant (this.time.now) jusqu'auquel l'ennemi doit rester en teinte flash blanc.
   * ~60ms par coup — feedback court et non intrusif (DA 16-bit).
   * Vidé dans `resetRunState`.
   */
  private readonly enemyFlashUntil = new Map<number, number>()
  /**
   * Pool de chiffres de dégâts flottants (poolé — pas de new Text par hit).
   * Initialisé dans `create()`, instance fraîche par scène.
   */
  private damageNumbers!: DamageNumberPool
  private readonly projectileSprites = new Map<number, CharSprite>()
  private readonly pickupSprites = new Map<number, CharSprite>()
  /**
   * Étiquette « JN » + chevron au-dessus de chaque joueur humain, pour le repérer
   * dans une nuée d'ennemis (playtest). Un couple texte+chevron par joueur, couleur
   * = `playerColor`, depth élevé (au-dessus des ennemis). Détruits dans
   * `resetRunState` (pas de fuite). Affiché en solo comme en coop (J1..J4).
   */
  private readonly playerLabels = new Map<
    number,
    { text: Phaser.GameObjects.Text; chevron: Phaser.GameObjects.Triangle }
  >()
  /**
   * Pool de sprites pour ennemis/projectiles/pickups (horde 300-600 entités) : réutilise
   * au lieu de create/destroy. INSTANCE FRAÎCHE à chaque `create()` (scene.restart en
   * détruit une et en recrée une autre) — jamais un singleton de module.
   */
  private pool!: SpritePool
  /** Dernier niveau connu par joueur (détection de montée de niveau → VFX). */
  private readonly prevLevel = new Map<number, number>()
  /** Derniers PV connus par joueur (détection de dégât → flash rouge). */
  private readonly prevHp = new Map<number, number>()
  /** Instant (this.time.now) jusqu'auquel le sprite joueur reste teinté « touché ». */
  private readonly damageFlashUntil = new Map<number, number>()
  /** Skin doré (code Konami), rafraîchi depuis l'état à chaque frame. */
  private goldSkin = false
  /** Dernier instant de mouvement par joueur (pour l'animation d'attente impatiente). */
  private readonly lastMoveMs = new Map<number, number>()
  /** Horloge de rendu au début de l'intro (-1 = pas d'intro en cours). */
  private introStartMs = -1
  /** Intro terminée pour la run courante (ré-armée à chaque nouvelle run). */
  private introDone = false
  /** Sprites du prisonnier : cage + ouvrier barbu, par id d'entité. */
  private readonly prisonerCages = new Map<number, Phaser.GameObjects.Image | Phaser.GameObjects.Arc>()
  private readonly prisonerWorkers = new Map<number, CharSprite>()
  /** PNJ d'ambiance non-hostile du stage (idle), ou null si absent. */
  private ambientSprite: Phaser.GameObjects.Sprite | null = null
  /**
   * VFX des armes à impulsion (marteau/pied-de-biche/court-circuit), déclenché
   * par l'événement d'aura de la sim. Une forme dédiée par `kind` — pas de
   * nouvel asset, juste des primitives Phaser Graphics :
   *  - aura (marteau)        → onde de choc ronde (sprite existant, pas de teinte)
   *  - sweep (pied-de-biche) → arc/croissant balayé (jaune sécurité)
   *  - strike (court-circuit)→ éclair en zigzag + flash d'impact (cyan accent)
   */
  private readonly onAuraPulse = (e: Event): void => {
    const p = e as AuraPulseEvent
    if (p.kind === 'sweep') {
      this.spawnSweepArc(p.x, p.y, p.radius)
      return
    }
    if (p.kind === 'strike') {
      this.spawnStrikeBolt(p.x, p.y, p.radius)
      return
    }
    if (p.kind === 'cone') {
      this.spawnConeVfx(p.x, p.y, p.radius, p.dirX, p.dirY)
      return
    }
    // Marteau : onde de choc + scale-pop + léger screen-shake (coup lourd).
    const toScale = Math.max(1.5, (p.radius * 2) / 90)
    this.spawnVfx('vfx_shockwave', p.x, p.y, 0.2, toScale, 320)
    // Flash central jaune bref (pixel-pop).
    this.spawnPixelPop(p.x, p.y, PALETTE_HEX.jauneSecurite, 14, 220)
    // Screen-shake léger — coup lourd mais pas nausée.
    this.cameras.main.shake(90, 0.004)
  }
  /**
   * Balayage du pied-de-biche : arc épais (croissant, pas un cercle complet)
   * qui pivote sur ~40° en s'estompant — lecture "coup de balayage", distincte
   * de l'onde ronde du marteau. Double-tracé (cœur blanc + contour jaune) +
   * scale-pop (naît petit → pleine taille) + particules éjectées le long de l'arc.
   * Primitive Graphics, aucune texture chargée.
   */
  private spawnSweepArc(x: number, y: number, radius: number): void {
    const arcRadius = radius * 0.6
    const span = Phaser.Math.DegToRad(120)
    const startAngle = -Phaser.Math.DegToRad(90) - span / 2

    // Cœur blanc (plus fin, éclatant) — dessous.
    const gInner = this.add.graphics().setPosition(x, y).setDepth(5).setScale(0.3)
    gInner.lineStyle(12, PALETTE_HEX.blanc, 0.85)
    gInner.beginPath()
    gInner.arc(0, 0, arcRadius, startAngle, startAngle + span)
    gInner.strokePath()
    this.tweens.add({
      targets: gInner,
      rotation: Phaser.Math.DegToRad(40),
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => gInner.destroy()
    })

    // Contour jaune (épais) — dessus, légèrement décalé en temps (scale-pop décalé).
    const gOuter = this.add.graphics().setPosition(x, y).setDepth(5).setScale(0.3)
    gOuter.lineStyle(7, PALETTE_HEX.jauneSecurite, 1)
    gOuter.beginPath()
    gOuter.arc(0, 0, arcRadius, startAngle, startAngle + span)
    gOuter.strokePath()
    this.tweens.add({
      targets: gOuter,
      rotation: Phaser.Math.DegToRad(40),
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 240,
      ease: 'Quad.easeOut',
      onComplete: () => gOuter.destroy()
    })

    // Flash central (scale-pop) — marque le point d'impact.
    this.spawnPixelPop(x, y, PALETTE_HEX.jauneSecurite, 10, 180)

    // Particules éjectées en éventail le long de l'arc.
    const particleCount = 5
    for (let i = 0; i < particleCount; i++) {
      const angle = startAngle + (span / (particleCount - 1)) * i
      const dist = arcRadius * (0.7 + Math.random() * 0.4)
      const px = x + Math.cos(angle) * dist
      const py = y + Math.sin(angle) * dist
      const speedX = Math.cos(angle) * (28 + Math.random() * 22)
      const speedY = Math.sin(angle) * (28 + Math.random() * 22)
      const par = this.add.rectangle(px, py, 4, 4, PALETTE_HEX.jauneSecurite).setDepth(6)
      this.tweens.add({
        targets: par,
        x: px + speedX,
        y: py + speedY,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 220 + Math.random() * 80,
        ease: 'Quad.easeOut',
        onComplete: () => par.destroy()
      })
    }
  }
  /**
   * VFX du cône d'extincteur : 2 secteurs superposés qui s'élargissent en fondu
   * (densité et dynamisme) + petites particules « mousse » (carrés blancs) projetées
   * vers la cible. DA-safe : palette blanc/vert léger, pas de glow.
   * Les Graphics sont positionnés à l'origine (pas de setPosition) donc toutes les
   * coordonnées passées aux primitives sont absolues (monde), pas relatives.
   */
  private spawnConeVfx(x: number, y: number, radius: number, dirX?: number, dirY?: number): void {
    const dx = dirX ?? 0
    const dy = dirY ?? -1
    const centerAngle = Math.atan2(dy, dx)
    const startAngle = centerAngle - CONE_HALF_ANGLE
    const endAngle = centerAngle + CONE_HALF_ANGLE

    // Couche 1 : secteur vert-mousse large — naît petit (scale-pop), s'élargit.
    const g1 = this.add.graphics().setDepth(5).setPosition(x, y).setScale(0.3)
    g1.fillStyle(0xe8f4e8, 0.65)
    g1.beginPath()
    g1.moveTo(0, 0)
    g1.arc(0, 0, radius, startAngle, endAngle, false)
    g1.closePath()
    g1.fillPath()
    this.tweens.add({
      targets: g1,
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 280,
      ease: 'Quad.easeOut',
      onComplete: () => g1.destroy()
    })

    // Couche 2 : secteur blanc légèrement plus étroit — cœur lumineux, disparaît vite.
    const innerSpan = CONE_HALF_ANGLE * 0.7
    const g2 = this.add.graphics().setDepth(6).setPosition(x, y).setScale(0.4)
    g2.fillStyle(PALETTE_HEX.blanc, 0.42)
    g2.beginPath()
    g2.moveTo(0, 0)
    g2.arc(0, 0, radius, centerAngle - innerSpan, centerAngle + innerSpan, false)
    g2.closePath()
    g2.fillPath()
    this.tweens.add({
      targets: g2,
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => g2.destroy()
    })

    // Particules « mousse » : petits carrés blancs projetés dans le cône.
    const particleCount = 7
    for (let i = 0; i < particleCount; i++) {
      const spread = (Math.random() * 2 - 1) * CONE_HALF_ANGLE
      const angle = centerAngle + spread
      const dist = radius * (0.3 + Math.random() * 0.7)
      const px = x + Math.cos(angle) * dist
      const py = y + Math.sin(angle) * dist
      const speed = 25 + Math.random() * 30
      const par = this.add.rectangle(px, py, 3, 3, PALETTE_HEX.blanc).setDepth(7).setAlpha(0.85)
      this.tweens.add({
        targets: par,
        x: px + Math.cos(angle) * speed,
        y: py + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: 230 + Math.random() * 100,
        ease: 'Quad.easeOut',
        onComplete: () => par.destroy()
      })
    }
  }

  /**
   * Coup du court-circuit : éclair en zigzag qui tombe sur la cible + 2-3 fourches
   * secondaires + flash d'impact scale-pop. Tracé double (cœur blanc + halo cyan)
   * pour un rendu « électrique » pixel-art. Le jitter latéral utilise Math.random()
   * — cosmétique pur, rendu uniquement, sans effet sur l'état de sim (déterminisme préservé).
   */
  private spawnStrikeBolt(x: number, y: number, radius: number): void {
    const segments = 6
    const startY = y - radius * 0.9

    // Génère les points du zigzag principal.
    const buildZigzag = (jitterScale: number): { x: number; y: number }[] => {
      const pts: { x: number; y: number }[] = [{ x, y: startY }]
      for (let i = 1; i < segments; i++) {
        const t = i / segments
        const jitter = (Math.random() * 2 - 1) * radius * jitterScale
        pts.push({ x: x + jitter, y: startY + radius * 0.9 * t })
      }
      pts.push({ x, y })
      return pts
    }

    const drawPath = (g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]): void => {
      g.beginPath()
      g.moveTo(pts[0]?.x ?? x, pts[0]?.y ?? startY)
      for (let i = 1; i < pts.length; i++) {
        g.lineTo(pts[i]?.x ?? x, pts[i]?.y ?? y)
      }
      g.strokePath()
    }

    const mainPts = buildZigzag(0.18)

    // Éclair principal : halo cyan épais + cœur blanc fin.
    const gMain = this.add.graphics().setDepth(5)
    gMain.lineStyle(6, PALETTE_HEX.cyanAccent, 0.9)
    drawPath(gMain, mainPts)
    gMain.lineStyle(2, PALETTE_HEX.blanc, 1)
    drawPath(gMain, mainPts)
    this.tweens.add({
      targets: gMain,
      alpha: 0,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => gMain.destroy()
    })

    // 2 fourches secondaires courtes depuis un point aléatoire du zigzag.
    const forkCount = 2
    for (let f = 0; f < forkCount; f++) {
      const forkIdx = 1 + Math.floor(Math.random() * (segments - 2))
      const forkPt = mainPts[forkIdx]
      if (forkPt === undefined) {
        continue
      }
      const forkAngle = Math.PI * (0.3 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1)
      const forkLen = radius * (0.25 + Math.random() * 0.2)
      const gFork = this.add.graphics().setDepth(5)
      gFork.lineStyle(3, PALETTE_HEX.cyanAccent, 0.75)
      gFork.beginPath()
      gFork.moveTo(forkPt.x, forkPt.y)
      gFork.lineTo(forkPt.x + Math.cos(forkAngle) * forkLen, forkPt.y + Math.sin(forkAngle) * forkLen)
      gFork.strokePath()
      gFork.lineStyle(1, PALETTE_HEX.blanc, 0.7)
      gFork.beginPath()
      gFork.moveTo(forkPt.x, forkPt.y)
      gFork.lineTo(forkPt.x + Math.cos(forkAngle) * forkLen, forkPt.y + Math.sin(forkAngle) * forkLen)
      gFork.strokePath()
      this.tweens.add({
        targets: gFork,
        alpha: 0,
        duration: 130,
        ease: 'Quad.easeOut',
        onComplete: () => gFork.destroy()
      })
    }

    // Flash d'impact scale-pop (plus gros que le flash standard).
    this.spawnPixelPop(x, y, PALETTE_HEX.cyanAccent, 16, 200)
    this.spawnFlash(x, y)
  }
  /** Libération d'un prisonnier : étincelles + bulle « Merci ! » au-dessus de l'ouvrier. */
  private readonly onPrisonerFreed = (e: Event): void => {
    const p = e as PrisonerFreedEvent
    this.spawnVfx('vfx_sparkle', p.x, p.y, 0.5, 1.9, 450)
    this.spawnBubble(p.x, p.y)
  }
  /**
   * Évolution d'arme (coffre ramassé + conditions réunies) : grand halo au sol
   * sur le joueur qui a réellement ramassé le coffre (`EvolvedEvent.playerId`),
   * réutilise l'asset de montée de niveau (agrandi) — pas de nouvel asset. Le
   * bandeau/son sont gérés ailleurs (overlay/audio). Screen-shake légèrement plus
   * fort que le marteau (évolution = événement majeur du run).
   */
  private readonly onEvolved = (e: Event): void => {
    const playerId = (e as EvolvedEvent).playerId
    const p = this.app.getStateForFrame(this.app.frameId).players.find((pl) => pl.id === playerId)
    if (p === undefined) {
      return
    }
    this.spawnVfx('vfx_levelup', p.x, p.y, 0.2, 2.8, 650)
    // Sparkle supplémentaire en anneau (6 points) pour bien marquer l'évolution.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const delay = i * 35
      this.time.delayedCall(delay, () => {
        this.spawnVfx('vfx_sparkle', p.x + Math.cos(a) * 48, p.y + Math.sin(a) * 48, 0.3, 1.4, 420)
      })
    }
    // Screen-shake plus fort que le marteau (événement majeur du run).
    this.cameras.main.shake(160, 0.007)
  }

  constructor() {
    super('game')
  }

  init(data: GameSceneData): void {
    this.app = data.app
    this.testMode = data.testMode
    this.seam = data.seam
    this.lite = data.lite ?? false
    this.sceneData = data
    this.loadedStageId = this.app.getState().stageId
    this.loadedRunId = this.app.getState().runId
    this.stage = stageRender(this.loadedStageId)
  }

  preload(): void {
    // Assets PROPRES AU STAGE (sol, décalques, props, skins d'ennemis).
    for (const t of this.stage.ground) {
      this.load.image(t.key, t.file)
    }
    for (const d of this.stage.decals) {
      this.load.image(d.key, d.file)
    }
    for (const p of this.stage.props) {
      this.load.image(p.key, p.file)
    }
    // Landmark de bâtiment (image décor) — chargé comme les autres décors.
    if (this.stage.landmark !== undefined) {
      this.load.image(this.stage.landmark.key, this.stage.landmark.file)
    }
    // Grandes structures qui remplissent l'arène (images décor).
    if (this.stage.structures !== undefined) {
      for (const s of this.stage.structures) {
        this.load.image(s.key, s.file)
      }
    }
    // Feuilles de personnages 4×4 (lourdes) — sautées en mode allégé (→ cercles).
    if (!this.lite) {
      const boss = this.stage.boss
      this.load.spritesheet(boss.key, boss.file, { frameWidth: boss.frame, frameHeight: boss.frame })
      for (const e of Object.values(this.stage.enemies)) {
        this.load.spritesheet(e.key, e.file, { frameWidth: e.frame, frameHeight: e.frame })
      }
      for (const [key, file, frame] of SHARED_SHEETS) {
        this.load.spritesheet(key, file, { frameWidth: frame, frameHeight: frame })
      }
      // Skin du boss FINAL (contremaître maudit) — PARTAGÉ entre tous les stages
      // (comme les feuilles ci-dessus), chargé une seule fois indépendamment du
      // stage courant. Phaser tolère un load.spritesheet répété sur une même clé
      // (no-op si déjà en cache) — pas de garde nécessaire au-delà de ce que fait
      // déjà SHARED_SHEETS ci-dessus.
      this.load.spritesheet(FINAL_BOSS_SKIN.key, FINAL_BOSS_SKIN.file, {
        frameWidth: FINAL_BOSS_SKIN.frame,
        frameHeight: FINAL_BOSS_SKIN.frame
      })
      // Feuilles dédiées des personnages (phase C) : NON préchargées ici. `preload`
      // s'exécute au boot (avant la sélection) puis seulement au changement de stage —
      // les joueurs (donc leurs persos) n'y sont pas encore connus. Et précharger tout
      // le roster (9 feuilles 768×768) sature la mémoire GPU (crash worker WebGL en test).
      // → chargées à la volée par `ensureCharacterSheets()` au démarrage de la run, pour
      // les seuls persos réellement en jeu. `player` (ouvrier/défaut) reste dans SHARED_SHEETS.
      // Feuille d'attente + variantes dorées du héros (clins d'œil ; repli si absentes).
      this.load.spritesheet('player_idle', 'player_idle.png', { frameWidth: 192, frameHeight: 192 })
      this.load.spritesheet('player_gold', 'player_j1_gold.png', { frameWidth: 192, frameHeight: 192 })
      this.load.spritesheet('player_idle_gold', 'player_idle_gold.png', { frameWidth: 192, frameHeight: 192 })
      // Ouvrier prisonnier (sosie barbu du héros) — même gabarit que le joueur (192).
      this.load.spritesheet('prisoner', 'stage01/npc/prisoner_walk.png', { frameWidth: 192, frameHeight: 192 })
      // PNJ d'ambiance non-hostile du stage (feuille perso).
      if (this.stage.ambient !== undefined) {
        const a = this.stage.ambient
        this.load.spritesheet(a.key, a.file, { frameWidth: a.frame, frameHeight: a.frame })
      }
    }
    this.load.image('proj_scie', 'stage01/weapons/proj_scie.png')
    this.load.image('proj_cloueur', 'stage01/weapons/proj_cloueur.png')
    // Projectiles dédiés phase A (A2 lot 2) + flaque de goudron (lot 3).
    this.load.image('proj_boulons', 'stage01/weapons/proj_boulons.png')
    this.load.image('proj_cle', 'stage01/weapons/proj_cle.png')
    this.load.image('proj_brouette', 'stage01/weapons/proj_brouette.png')
    this.load.image('vfx_goudron', 'stage01/vfx/vfx_goudron.png')
    this.load.image('pickup_xp', 'stage01/pickups/xp.png')
    this.load.image('pickup_health', 'stage01/pickups/health.png')
    this.load.image('pickup_magnet', 'stage01/pickups/magnet.png')
    this.load.image('pickup_crate', 'stage01/pickups/crate.png')
    this.load.image('vfx_impact', 'stage01/vfx/impact.png')
    this.load.image('vfx_sparkle', 'stage01/vfx/sparkle.png')
    this.load.image('vfx_levelup', 'stage01/vfx/levelup.png')
    this.load.image('vfx_shockwave', 'stage01/vfx/shockwave.png')
    // Clins d'œil rétro : fumée de disparition, colonne de téléportation boss, prisonnier.
    this.load.image('vfx_dust', 'stage01/vfx/dust.png')
    this.load.image('vfx_beam', 'stage01/vfx/beam.png')
    this.load.image('vfx_beam_segment', 'stage01/vfx/beam_segment.png')
    this.load.image('cage', 'stage01/props/cage.png')
    this.load.image('bubble_merci', 'stage01/ui/bubble_merci.png')
  }

  /**
   * Joue un effet transitoire (scale + fondu) à une position, puis se détruit. Rendu pur.
   * Retourne le sprite (ou `null` si la texture est absente) pour un habillage ponctuel (ex. teinte).
   */
  private spawnVfx(
    key: string,
    x: number,
    y: number,
    from: number,
    to: number,
    durationMs: number
  ): Phaser.GameObjects.Sprite | null {
    if (!this.textures.exists(key)) {
      return null
    }
    const fx = this.add.sprite(x, y, key).setScale(from).setDepth(5)
    this.tweens.add({
      targets: fx,
      scale: to,
      alpha: 0,
      duration: durationMs,
      ease: 'Quad.easeOut',
      onComplete: () => fx.destroy()
    })
    return fx
  }

  /** Éclair blanc bref (primitive, sans asset) — accompagne la fumée à la mort d'un ennemi. */
  private spawnFlash(x: number, y: number): void {
    const flash = this.add.circle(x, y, 9, 0xffffff).setDepth(6)
    this.tweens.add({
      targets: flash,
      scale: 2.2,
      alpha: 0,
      duration: 130,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy()
    })
  }

  /**
   * Pop pixel carré coloré (scale-pop DA-safe) : naît petit, grossit,
   * disparaît — pur hit-feel arcade 16-bit. Utilisé par sweep, strike, marteau.
   */
  private spawnPixelPop(x: number, y: number, color: number, size: number, durationMs: number): void {
    const sq = this.add.rectangle(x, y, size, size, color).setDepth(6).setScale(0.2)
    this.tweens.add({
      targets: sq,
      scale: 1,
      alpha: 0,
      duration: durationMs,
      ease: 'Quad.easeOut',
      onComplete: () => sq.destroy()
    })
  }

  /**
   * Bulles de goudron : petits carrés sombres qui montent et disparaissent,
   * donnant vie à l'apparition d'une flaque de goudron. Cosmétique pur.
   */
  private spawnTarBubbles(x: number, y: number, radius: number): void {
    const count = 5
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.random() * radius * 0.7
      const bx = x + Math.cos(angle) * dist
      const by = y + Math.sin(angle) * dist
      const size = 2 + Math.floor(Math.random() * 3)
      const bubble = this.add.rectangle(bx, by, size, size, PALETTE_HEX.brunSombre).setDepth(0).setAlpha(0.9)
      this.tweens.add({
        targets: bubble,
        y: by - 12 - Math.random() * 10,
        alpha: 0,
        duration: 350 + Math.random() * 200,
        delay: Math.random() * 150,
        ease: 'Quad.easeOut',
        onComplete: () => bubble.destroy()
      })
    }
  }

  /** Bulle « Merci ! » (sprite pré-cuit) montant au-dessus d'un ouvrier libéré. */
  private spawnBubble(x: number, y: number): void {
    if (!this.textures.exists('bubble_merci')) {
      return
    }
    const bubble = this.add.image(x, y - 44, 'bubble_merci').setScale(0.5).setDepth(7)
    this.tweens.add({
      targets: bubble,
      y: y - 64,
      alpha: 0,
      duration: 2500,
      delay: 300,
      ease: 'Quad.easeOut',
      onComplete: () => bubble.destroy()
    })
  }

  /**
   * Arrivée de boss façon « téléporteur » : colonne de lumière verticale qui grandit,
   * 3-4 segments qui s'assemblent, puis fondu d'apparition du boss. Purement visuel.
   */
  private playBossTeleport(boss: CharSprite, x: number, y: number): void {
    if (this.textures.exists('vfx_beam')) {
      const beam = this.add.sprite(x, y, 'vfx_beam').setDepth(5).setAlpha(0.9).setScale(1, 0)
      this.tweens.add({
        targets: beam,
        scaleY: 1,
        duration: 350,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({ targets: beam, alpha: 0, duration: 500, onComplete: () => beam.destroy() })
        }
      })
    }
    if (this.textures.exists('vfx_beam_segment')) {
      for (let i = 0; i < 4; i++) {
        this.time.delayedCall(i * 120, () => {
          const seg = this.add
            .sprite(x, y - 70 + i * 18, 'vfx_beam_segment')
            .setDepth(6)
            .setAlpha(0.9)
          this.tweens.add({ targets: seg, y, alpha: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => seg.destroy() })
        })
      }
    }
    if (boss instanceof Phaser.GameObjects.Sprite) {
      boss.setAlpha(0)
      this.tweens.add({ targets: boss, alpha: 1, duration: 700, delay: 200 })
    }
  }

  /** Petit anneau d'étincelles autour du héros à la fin de l'intro (« les outils apparaissent »). */
  private spawnIntroFlourish(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      this.spawnVfx('vfx_sparkle', x + Math.cos(a) * 34, y + Math.sin(a) * 34, 0.3, 1.2, 420)
    }
  }

  /**
   * Clé de feuille de marche du héros, par personnage (dorée si débloquée + présente,
   * uniquement sur la feuille par défaut de l'ouvrier — clin d'œil P1 Konami).
   * Aujourd'hui tous les persos partagent `sheet: 'player'` (placeholder) ; la phase C
   * ajoutera des feuilles `char_<id>.png` par perso — ce switch les servira sans y retoucher.
   */
  /**
   * Charge à la volée (loader Phaser en cours de partie) les feuilles des persos
   * réellement EN JEU dont la texture manque encore — hormis `player` (préchargée).
   * Appelé au 1er rendu d'une run : évite de précharger tout le roster au boot
   * (mémoire GPU) tout en garantissant le bon skin dès que le loader a fini.
   */
  private ensureCharacterSheets(players: readonly { characterId: string }[]): void {
    if (this.loadingSheets || this.lite) {
      return
    }
    const toLoad: string[] = []
    for (const p of players) {
      const sheet = characterDef(p.characterId).sheet
      if (sheet !== 'player' && !this.textures.exists(sheet) && !toLoad.includes(sheet)) {
        toLoad.push(sheet)
      }
    }
    if (toLoad.length === 0) {
      return
    }
    for (const sheet of toLoad) {
      this.load.spritesheet(sheet, `${sheet}.png`, { frameWidth: 192, frameHeight: 192 })
    }
    this.loadingSheets = true
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.loadingSheets = false
    })
    this.load.start()
  }

  private walkTextureKey(characterId: string): string {
    const base = characterDef(characterId).sheet
    return this.goldSkin && base === 'player' && this.textures.exists('player_gold') ? 'player_gold' : base
  }

  /** Clé de feuille d'attente du héros, par personnage (dorée si débloquée + présente). */
  private idleTextureKey(characterId: string): string {
    const base = characterDef(characterId).sheet
    const idle = `${base}_idle`
    if (this.goldSkin && base === 'player' && this.textures.exists('player_idle_gold')) {
      return 'player_idle_gold'
    }
    return this.textures.exists(idle) ? idle : base
  }

  /**
   * Synchronise l'étiquette « JN » + chevron au-dessus d'un joueur (repérage en
   * nuée). Créée à la volée, suit la position, masquée si le joueur n'est pas
   * sur le terrain. Couleur = `playerColor(id)`, contour sombre pour rester
   * lisible sur fond chargé, depth 50 (au-dessus des ennemis/VFX).
   */
  private syncPlayerLabel(p: PlayerState, visible: boolean): void {
    let label = this.playerLabels.get(p.id)
    if (label === undefined) {
      const col = playerColor(p.id)
      const text = this.add
        .text(p.x, p.y - 58, `J${p.id}`, {
          fontFamily: 'monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: col.hex,
          stroke: PALETTE.contour,
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setDepth(50)
      const chevron = this.add
        .triangle(p.x, p.y - 44, 0, 0, 12, 0, 6, 8, col.num)
        .setStrokeStyle(2, PALETTE_HEX.contour)
        .setDepth(50)
      label = { text, chevron }
      this.playerLabels.set(p.id, label)
    }
    label.text.setPosition(p.x, p.y - 58)
    label.text.setVisible(visible)
    label.chevron.setPosition(p.x, p.y - 44)
    label.chevron.setVisible(visible)
  }

  /** Réinitialise l'état par-run (indispensable car `scene.restart` réutilise l'instance). */
  private resetRunState(): void {
    this.playerSprites.clear()
    this.enemySprites.clear()
    this.projectileSprites.clear()
    this.pickupSprites.clear()
    this.playerLabels.forEach((l) => {
      l.text.destroy()
      l.chevron.destroy()
    })
    this.playerLabels.clear()
    this.hazardSprites.forEach((s) => s.destroy())
    this.hazardSprites.clear()
    this.prisonerCages.clear()
    this.prisonerWorkers.clear()
    this.prevLevel.clear()
    this.prevHp.clear()
    this.damageFlashUntil.clear()
    this.prevEnemyHp.clear()
    this.enemyFlashUntil.clear()
    this.lastMoveMs.clear()
    this.following = false
    this.introStartMs = -1
    this.introDone = false
    this.ambientSprite = null
  }

  create(): void {
    // Les objets d'affichage sont détruits au shutdown : on repart de maps vides.
    this.resetRunState()
    // Nouvelle instance à chaque (re)création de scène — les anciens sprites poolés
    // sont détruits par Phaser au shutdown, un pool réutilisé les rendrait fantômes.
    this.pool = new SpritePool(this)
    // Pool de chiffres de dégâts : instance fraîche par scene (les Text Phaser sont
    // détruits au shutdown ; un pool réutilisé les rendrait fantômes).
    this.damageNumbers = new DamageNumberPool(this)
    // Sol : base tuilée seedée + décalques épars (rendu pur, aucune logique).
    // La seed est SALÉE par la phase → décor disposé différemment d'un stage à l'autre.
    const stageSeed = (this.app.getState().seed ^ phaseSalt(this.loadedStageId)) >>> 0
    createGround(
      this,
      WORLD.width,
      WORLD.height,
      { tileKeys: this.stage.ground.map((g) => g.key), decalKeys: this.stage.decals.map((d) => d.key) },
      stageSeed
    )
    // Props décoratifs dispersés (au-dessus du sol, sous les entités).
    createProps(
      this,
      WORLD.width,
      WORLD.height,
      this.stage.props.map((p) => ({ key: p.key, scale: p.scale, count: p.count })),
      stageSeed
    )
    // Grandes structures qui remplissent l'arène (l'étape de chantier partout, hors centre).
    if (this.stage.structures !== undefined) {
      createStructures(
        this,
        WORLD.width,
        WORLD.height,
        this.stage.structures.map((s) => ({ key: s.key, scale: s.scale, count: s.count, band: s.band })),
        stageSeed
      )
    }
    // Landmark HERO de la phase — grand, en périphérie, décor.
    const lm = this.stage.landmark
    if (lm !== undefined) {
      createLandmark(this, WORLD.width, WORLD.height, { key: lm.key, scale: lm.scale, count: lm.count }, stageSeed)
    }
    // PNJ d'ambiance non-hostile (geste métier) à un spot seedé hors du centre — « vie » du chantier.
    const amb = this.stage.ambient
    if (amb !== undefined && this.textures.exists(amb.key)) {
      const ang = (((stageSeed * 2654435761) >>> 0) % 1000) / 1000 * Math.PI * 2
      const ax = WORLD.width / 2 + Math.cos(ang) * 470
      const ay = WORLD.height / 2 + Math.sin(ang) * 470
      this.ambientSprite = this.add.sprite(ax, ay, amb.key).setScale(amb.scale).setDepth(1)
    }
    this.add
      .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height)
      .setStrokeStyle(4, 0xf5c542)

    // Flaques de goudron (hazards) : sous tout (sol -10, props ~0, entités ~0..5).
    this.hazardGraphics = this.add.graphics().setDepth(-2)
    // Anneaux couleur des joueurs (co-op) : au-dessus du sol/props (depth -10..1),
    // sous les sprites de personnages (depth par défaut 0... en pratique dessiné
    // avant eux dans l'ordre de création, mais on force -1 pour être sûr avec le pool).
    this.playerRings = this.add.graphics().setDepth(-1)
    // Au-dessus des sprites (depth par défaut 0) pour rester lisible pendant la relève.
    this.reviveBars = this.add.graphics().setDepth(5)

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cameras.main.setZoom(1.2)

    this.syncSprites()
    this.updateCamera(this.app.getStateForFrame(this.app.frameId))

    // Onde de choc du marteau + libération de prisonnier + évolution d'arme : la sim émet, l'App relaie.
    this.app.events.addEventListener('auraPulse', this.onAuraPulse)
    this.app.events.addEventListener('prisonerFreed', this.onPrisonerFreed)
    this.app.events.addEventListener('evolved', this.onEvolved)
    this.events.once('shutdown', () => {
      this.app.events.removeEventListener('auraPulse', this.onAuraPulse)
      this.app.events.removeEventListener('prisonerFreed', this.onPrisonerFreed)
      this.app.events.removeEventListener('evolved', this.onEvolved)
    })

    if (this.input.keyboard !== null) {
      this.keyboardInput = new KeyboardInput(this.input.keyboard)
    }
    const gamepadPlugin = this.input.gamepad
    if (gamepadPlugin !== null) {
      this.gamepads = [0, 1, 2, 3].map((i) => new GamepadInput(gamepadPlugin, i))
    }

    if (this.seam !== null) {
      this.seam.ready = true
      // Sonde de rendu (test-only) : permet d'asserter que le bon skin est rendu.
      this.seam.debugRenderInfo = (): { id: number; texture: string | null }[] => {
        const info: { id: number; texture: string | null }[] = []
        for (const [id, sprite] of this.playerSprites) {
          info.push({ id, texture: sprite instanceof Phaser.GameObjects.Sprite ? sprite.texture.key : null })
        }
        return info.sort((a, b) => a.id - b.id)
      }
      // Sonde du feedback de coup (test-only) : compteur chiffres actifs/total.
      this.seam.debugFeedbackInfo = (): { active: number; spawnedTotal: number } => ({
        active: this.damageNumbers.active,
        spawnedTotal: this.damageNumbers.total
      })
    }
  }

  update(_time: number, delta: number): void {
    // Changement de stage OU nouvelle partie (restart même stage) : on relance la
    // scène pour repartir d'un état propre — sol/props/skins rechargés ET surtout
    // sprites/VFX/pool remis à zéro (sinon fuite : les objets des parties
    // précédentes s'accumulent, cf. `runId`).
    const st = this.app.getStateForFrame(this.app.frameId)
    if (st.screen !== 'title' && (st.stageId !== this.loadedStageId || st.runId !== this.loadedRunId)) {
      this.scene.restart(this.sceneData)
      return
    }
    if (!this.testMode) {
      routeInput(this.app, this.readPlayerInputs(st.players.length))
      this.app.advanceTime(Math.min(delta, MAX_FRAME_MS))
    }
    this.syncSprites()
    this.updateCamera(st)
  }

  /**
   * Caméra : suivi solo (P1/dernier survivant) inchangé ; caméra de groupe en
   * coop (≥2 vivants) — centroïde + zoom par paliers d'écartement, tout lerpé.
   * Ne fait rien pendant l'intro (le rendu scripté gère déjà le cadrage).
   */
  private updateCamera(state: AppViewState): void {
    if (state.introActive) {
      return
    }
    const alive = state.players.filter((p) => p.alive)

    if (alive.length <= 1) {
      // Solo / dernier survivant : comportement identique à l'ancien `followLeader`.
      this.cameras.main.zoom = Phaser.Math.Linear(this.cameras.main.zoom, SOLO_ZOOM, CAMERA_ZOOM_LERP)
      if (this.following) {
        return
      }
      const leaderId = alive[0]?.id ?? 1
      const leader = this.playerSprites.get(leaderId)
      if (leader !== undefined) {
        this.cameras.main.startFollow(leader, true, 0.1, 0.1)
        this.following = true
      }
      return
    }

    // Coop (≥2 vivants) : caméra de groupe, pas de suivi de sprite unique.
    if (this.following) {
      this.cameras.main.stopFollow()
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

    const cam = this.cameras.main
    cam.zoom = Phaser.Math.Linear(cam.zoom, targetZoom, CAMERA_ZOOM_LERP)
    const targetScrollX = cx - cam.width / 2 / cam.zoom
    const targetScrollY = cy - cam.height / 2 / cam.zoom
    cam.scrollX = Phaser.Math.Linear(cam.scrollX, targetScrollX, CAMERA_SCROLL_LERP)
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, targetScrollY, CAMERA_SCROLL_LERP)
  }

  /** Construit les entrées par joueur (clavier⊕pad0 pour P1, pad(k-1) pour P k≥2). */
  private readPlayerInputs(playerCount: number): Map<number, FrameInput> {
    const empty: FrameInput = { move: { x: 0, y: 0 }, pressed: [], action: false }
    const kb = this.keyboardInput !== null ? this.keyboardInput.readFrame() : empty
    const pads = this.gamepads.map((g) => g.readFrame())
    return buildPlayerInputs(kb, pads, playerCount)
  }

  /**
   * Dessine le « beacon » coloré au sol sous les pieds d'un joueur (co-op
   * uniquement) : ellipse remplie basse-opacité + liseré plus vif pour la
   * lisibilité, teinté avec la couleur du joueur (`@content/players`). Ne crée
   * aucun GameObject — dessine sur le Graphics partagé `playerRings`.
   */
  private drawPlayerRing(p: PlayerState): void {
    const color = playerColor(p.id).num
    const x = p.x
    const y = p.y + 34
    const w = 44
    const h = 16
    this.playerRings.fillStyle(color, 0.35)
    this.playerRings.fillEllipse(x, y, w, h)
    this.playerRings.lineStyle(2, color, 0.8)
    this.playerRings.strokeEllipse(x, y, w, h)
  }

  /**
   * Barre de progrès de relève au-dessus d'un joueur à terre : cadre sombre +
   * remplissage coloré (couleur du joueur) proportionnel à `reviveProgress`.
   * Dessine sur le Graphics partagé `reviveBars` — aucun GameObject créé.
   */
  private drawReviveBar(p: PlayerState): void {
    const color = playerColor(p.id).num
    const w = 40
    const h = 6
    const x = p.x - w / 2
    const y = p.y - 46
    this.reviveBars.fillStyle(0x000000, 0.6)
    this.reviveBars.fillRect(x - 1, y - 1, w + 2, h + 2)
    const fillW = Math.max(0, Math.min(1, p.reviveProgress)) * w
    if (fillW > 0) {
      this.reviveBars.fillStyle(color, 0.95)
      this.reviveBars.fillRect(x, y, fillW, h)
    }
  }

  /** Synchronise les sprites avec l'état courant de la simulation. */
  private syncSprites(): void {
    const state = this.app.getStateForFrame(this.app.frameId)
    this.goldSkin = state.goldSkin // rafraîchi chaque frame (débloqué au titre à tout moment)
    const introActive = state.introActive
    // Nouvelle run : ré-arme l'intro (start relance introActive) et rend la main plus tard.
    if (introActive && this.introDone) {
      this.introDone = false
      this.introStartMs = -1
      this.following = false
      this.cameras.main.stopFollow()
    }

    // Flaques de goudron (hazards) : sprite de goudron dédié (A2 lot 3), une image
    // par flaque (Map synchronisée : créée à l'apparition, détruite à l'expiration),
    // à l'échelle du rayon. Repli sur un cercle Graphics si la texture est absente.
    this.hazardGraphics.clear()
    const useTarSprite = this.textures.exists('vfx_goudron')
    const seenHaz = new Set<number>()
    for (const h of state.hazards) {
      if (useTarSprite) {
        seenHaz.add(h.id)
        let hs = this.hazardSprites.get(h.id)
        if (hs === undefined) {
          hs = this.add.image(h.x, h.y, 'vfx_goudron').setDepth(-2).setAlpha(0)
          this.hazardSprites.set(h.id, hs)
          // Apparition : fondu d'entrée + quelques bulles sombres montantes.
          this.tweens.add({ targets: hs, alpha: 0.85, duration: 250, ease: 'Quad.easeOut' })
          this.spawnTarBubbles(h.x, h.y, h.radius)
        }
        hs.setPosition(h.x, h.y).setScale((h.radius * 2) / hs.width)
      } else {
        this.hazardGraphics.fillStyle(0x1a1a20, 0.35)
        this.hazardGraphics.fillCircle(h.x, h.y, h.radius)
      }
    }
    for (const [id, hs] of this.hazardSprites) {
      if (!seenHaz.has(id)) {
        hs.destroy()
        this.hazardSprites.delete(id)
      }
    }

    // Anneaux couleur (identité co-op) : jamais en solo, un seul Graphics
    // effacé/redessiné chaque frame — aucun objet par joueur à gérer/détruire.
    this.playerRings.clear()
    const showRings = state.players.length > 1
    // Barres de relève : effacées/redessinées chaque frame (même schéma que playerRings).
    this.reviveBars.clear()
    // Partie terminée (game over) : plus de relève possible, on garde le rendu figé
    // d'aujourd'hui (sprite masqué) plutôt que le traitement « à terre » transitoire.
    const gameOver = state.screen === 'gameover'

    for (const p of state.players) {
      let sprite = this.playerSprites.get(p.id)
      if (sprite === undefined) {
        const key = this.walkTextureKey(p.characterId)
        if (this.textures.exists(key)) {
          sprite = this.add.sprite(p.x, p.y, key).setScale(characterDef(p.characterId).renderScale ?? PLAYER_SCALE)
        } else if (this.lite || characterDef(p.characterId).sheet === 'player') {
          // Feuille de référence (ouvrier, préchargée) absente → mode allégé : cercle.
          sprite = this.add.circle(p.x, p.y, PLAYER_RADIUS, PLAYER_COLOR)
        } else {
          // Feuille dédiée du perso pas encore en cache → chargement à la volée, puis
          // on ATTEND (aucun cercle mis en cache : le vrai sprite naîtra une fois chargé).
          this.ensureCharacterSheets(state.players)
          continue
        }
        this.playerSprites.set(p.id, sprite)
        this.lastMoveMs.set(p.id, this.time.now)
      }
      if (showRings && p.alive) {
        this.drawPlayerRing(p)
      }
      if (introActive && p.id === 1) {
        this.renderIntroPlayer(sprite, p)
        continue
      }
      sprite.setPosition(p.x, p.y)
      // À terre (hp<=0) mais partie en cours : reste visible (couché/grisé) en
      // attente de relève, au lieu de disparaître — seul un game over le masque.
      const downedActive = p.downed && !gameOver
      sprite.setVisible(p.alive || downedActive)
      // Étiquette « JN » + chevron : visible tant que le joueur est sur le terrain.
      this.syncPlayerLabel(p, p.alive || downedActive)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        this.animatePlayer(sprite, p)
      }
      const prev = this.prevLevel.get(p.id)
      if (prev !== undefined && p.level > prev) {
        this.spawnVfx('vfx_levelup', p.x, p.y, 0.4, 2, 500)
      }
      this.prevLevel.set(p.id, p.level)
      // Retour visuel de dégât : teinte rouge tant que les PV baissent.
      const prevHp = this.prevHp.get(p.id)
      if (prevHp !== undefined && p.hp < prevHp - 0.01 && p.alive) {
        this.damageFlashUntil.set(p.id, this.time.now + 140)
      }
      this.prevHp.set(p.id, p.hp)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        if (downedActive) {
          // À terre : la teinte grise gagne toujours face au flash de dégât.
          sprite.setTint(0x888888)
        } else if (this.time.now < (this.damageFlashUntil.get(p.id) ?? 0)) {
          sprite.setTint(0xff5a5a)
        } else {
          sprite.clearTint()
        }
      }
      if (downedActive) {
        this.drawReviveBar(p)
      }
    }

    // Fin d'intro : flourish d'étincelles une fois, puis le suivi caméra reprend.
    if (!introActive && this.introStartMs >= 0 && !this.introDone) {
      this.introDone = true
      const leader = this.playerSprites.get(1)
      if (leader !== undefined) {
        this.spawnIntroFlourish(leader.x, leader.y)
      }
    }

    const leader = state.players[0]
    const seen = new Set<number>()
    // Diff HP pour le feedback de coup (flash + chiffres + pop). Calculé AVANT
    // de mettre à jour prevEnemyHp pour que chaque frame compare à la frame précédente.
    const hitEvents = computeHitEvents(this.prevEnemyHp, state.enemies)
    const hitById = new Map(hitEvents.map((e) => [e.id, e.amount]))
    for (const en of state.enemies) {
      seen.add(en.id)
      let sprite = this.enemySprites.get(en.id)
      if (sprite === undefined) {
        const skin = en.isBoss ? (en.bossRole === 'final' ? FINAL_BOSS_SKIN : this.stage.boss) : this.stage.enemies[en.type]
        const key = skin?.key
        const scale = skin?.scale ?? DEFAULT_CHAR_SCALE
        if (key !== undefined && this.textures.exists(key)) {
          sprite = this.pool.acquire(key, en.x, en.y)
          sprite.setScale(scale)
        } else {
          sprite = this.add.circle(en.x, en.y, ENEMY_RADIUS, ENEMY_COLOR)
        }
        this.enemySprites.set(en.id, sprite)
        // Arrivée de boss : téléporteur façon Mega Man (rendu seul, boss actif).
        if (en.isBoss) {
          this.playBossTeleport(sprite, en.x, en.y)
        }
      }
      sprite.setPosition(en.x, en.y)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        // L'ennemi poursuit le joueur → il regarde vers lui (pas de vx/vy exposé).
        const row = leader !== undefined ? dirRow(leader.x - en.x, leader.y - en.y) : 0
        sprite.setFrame(walkFrame(row, this.time.now))
      }
      // ── Feedback de coup (hit-feel) ────────────────────────────────────
      const hitAmount = hitById.get(en.id)
      if (hitAmount !== undefined) {
        // Hit-flash blanc ~60ms (DA 16-bit, palette blanc uniquement).
        const until = hitFlashUntil(this.time.now, hitAmount, 60)
        if (until !== undefined) {
          this.enemyFlashUntil.set(en.id, until)
        }
        // Chiffre de dégâts flottant (poolé).
        this.damageNumbers.spawn(en.x, en.y, hitAmount, en.isElite, en.isBoss)
        // Pop d'impact orange (distinct du pop de mort size=8/160ms).
        this.spawnPixelPop(en.x, en.y, PALETTE_HEX.orangeDanger, 6, 120)
      }
      // Applique la teinte flash blanc si dans la fenêtre, sinon efface.
      const flashUntil = this.enemyFlashUntil.get(en.id)
      if (flashUntil !== undefined) {
        if (this.time.now < flashUntil) {
          if (sprite instanceof Phaser.GameObjects.Sprite) {
            sprite.setTintFill(PALETTE_HEX.blanc)
          }
        } else {
          if (sprite instanceof Phaser.GameObjects.Sprite) {
            sprite.clearTint()
          }
          this.enemyFlashUntil.delete(en.id)
        }
      }
      // Mémorise les HP courants pour la comparaison de la prochaine frame.
      this.prevEnemyHp.set(en.id, en.hp)
    }
    // Retire les sprites des ennemis disparus (mort → poussière de béton + éclair blanc + scale-pop).
    for (const [id, sprite] of this.enemySprites) {
      if (!seen.has(id)) {
        this.spawnVfx('vfx_dust', sprite.x, sprite.y, 0.2, 1.8, 380)
        this.spawnFlash(sprite.x, sprite.y)
        // Pixel-pop orange (impact satisfaction) — DA-safe.
        this.spawnPixelPop(sprite.x, sprite.y, PALETTE_HEX.orangeDanger, 8, 160)
        if (sprite instanceof Phaser.GameObjects.Sprite) {
          this.pool.release(sprite)
        } else {
          sprite.destroy()
        }
        this.enemySprites.delete(id)
        // Nettoie les ids disparus pour éviter les fuites mémoire.
        this.prevEnemyHp.delete(id)
        this.enemyFlashUntil.delete(id)
      }
    }

    const seenProj = new Set<number>()
    for (const pr of state.projectiles) {
      seenProj.add(pr.id)
      let sprite = this.projectileSprites.get(pr.id)
      const cfg = PROJ_SPRITE[pr.type]
      if (sprite === undefined) {
        if (cfg !== undefined && this.textures.exists(cfg.key)) {
          sprite = this.pool.acquire(cfg.key, pr.x, pr.y)
          sprite.setScale(cfg.scale)
        } else {
          sprite = this.add.circle(pr.x, pr.y, PROJECTILE_RADIUS, PROJECTILE_COLOR)
        }
        this.projectileSprites.set(pr.id, sprite)
      }
      sprite.setPosition(pr.x, pr.y)
      if (sprite instanceof Phaser.GameObjects.Sprite && cfg !== undefined) {
        if (cfg.spin) {
          sprite.setRotation(this.time.now / 120)
        } else if (cfg.faceVel && (pr.vx !== 0 || pr.vy !== 0)) {
          // L'art du clou pointe vers le bas (+y) → aligne la pointe sur la vitesse.
          sprite.setRotation(Math.atan2(pr.vy, pr.vx) - Math.PI / 2)
        }
      }
    }
    for (const [id, sprite] of this.projectileSprites) {
      if (!seenProj.has(id)) {
        if (sprite instanceof Phaser.GameObjects.Sprite) {
          this.pool.release(sprite)
        } else {
          sprite.destroy()
        }
        this.projectileSprites.delete(id)
      }
    }

    const seenPickup = new Set<number>()
    for (const pk of state.pickups) {
      seenPickup.add(pk.id)
      let sprite = this.pickupSprites.get(pk.id)
      const cfg = PICKUP_SPRITE[pk.type]
      if (sprite === undefined) {
        if (this.textures.exists(cfg.key)) {
          sprite = this.pool.acquire(cfg.key, pk.x, pk.y)
          sprite.setScale(cfg.scale)
        } else {
          sprite = this.add.circle(pk.x, pk.y, PICKUP_RADIUS, PICKUP_COLOR)
        }
        this.pickupSprites.set(pk.id, sprite)
      }
      sprite.setPosition(pk.x, pk.y)
      // Coffre d'évolution : léger « respire » (scale oscillant) pour le
      // repérer dans la horde — DA-safe (pas de glow), scale re-fixé à
      // l'acquisition donc aucun conflit avec le pooling.
      if (pk.type === 'coffre' && sprite instanceof Phaser.GameObjects.Sprite) {
        sprite.setScale(cfg.scale * (1 + 0.12 * Math.sin(this.time.now / 180)))
      }
    }
    for (const [id, sprite] of this.pickupSprites) {
      if (!seenPickup.has(id)) {
        this.spawnVfx('vfx_sparkle', sprite.x, sprite.y, 0.6, 1.6, 300)
        if (sprite instanceof Phaser.GameObjects.Sprite) {
          this.pool.release(sprite)
        } else {
          sprite.destroy()
        }
        this.pickupSprites.delete(id)
      }
    }

    // PNJ d'ambiance : léger balancement sud (boucle lente), il ne se bat pas.
    if (this.ambientSprite !== null) {
      this.ambientSprite.setFrame(walkFrame(0, this.time.now, this.stage.ambient?.framePeriodMs ?? 300))
    }

    this.syncPrisoners(state.prisoners)
  }

  /**
   * Rendu scripté de l'intro : le héros arrive en marchant par le bas de l'écran,
   * s'arrête au spawn puis « ajuste son casque ». Caméra fixée sur le spawn le temps
   * de l'entrée (le suivi reprend à la fin). Aucune logique de jeu (sim gelée).
   */
  private renderIntroPlayer(sprite: CharSprite, p: PlayerState): void {
    if (this.introStartMs < 0) {
      this.introStartMs = this.time.now
      this.cameras.main.centerOn(p.x, p.y)
    }
    const t = Math.min(1, (this.time.now - this.introStartMs) / INTRO.durationMs)
    const walkPortion = 0.65
    sprite.setVisible(true)
    if (sprite instanceof Phaser.GameObjects.Sprite) {
      const key = this.walkTextureKey(p.characterId)
      if (sprite.texture.key !== key && this.textures.exists(key)) {
        sprite.setTexture(key)
      }
    }
    if (t < walkPortion) {
      const k = t / walkPortion
      sprite.setPosition(p.x, p.y + INTRO_ENTER_OFFSET * (1 - k))
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        sprite.setFrame(walkFrame(2, this.time.now)) // ligne 2 = nord (marche vers le haut)
      }
    } else {
      // Beat « ajuste le casque » : immobile face caméra au spawn.
      sprite.setPosition(p.x, p.y)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        sprite.setFrame(idleFrame(0))
      }
    }
  }

  /** Anime le héros en jeu : marche directionnelle, ou attente impatiente après un délai. */
  private animatePlayer(sprite: Phaser.GameObjects.Sprite, p: PlayerState): void {
    const moving = p.vx !== 0 || p.vy !== 0
    if (moving) {
      this.lastMoveMs.set(p.id, this.time.now)
    }
    const idleFor = this.time.now - (this.lastMoveMs.get(p.id) ?? this.time.now)
    const idleKey = this.idleTextureKey(p.characterId)
    if (!moving && idleFor > IDLE_EMOTE_MS && this.textures.exists(idleKey)) {
      if (sprite.texture.key !== idleKey) {
        sprite.setTexture(idleKey)
      }
      sprite.setFrame(walkFrame(0, this.time.now, 220)) // boucle lente, face caméra
      return
    }
    const walkKey = this.walkTextureKey(p.characterId)
    if (sprite.texture.key !== walkKey) {
      sprite.setTexture(walkKey)
    }
    const row = dirRow(p.vx, p.vy)
    sprite.setFrame(moving ? walkFrame(row, this.time.now) : idleFrame(row))
  }

  /** Dessine l'ouvrier prisonnier (cage + sosie barbu) ; libéré → il court hors écran. */
  private syncPrisoners(prisoners: readonly PrisonerState[]): void {
    const seen = new Set<number>()
    for (const pr of prisoners) {
      seen.add(pr.id)
      let worker = this.prisonerWorkers.get(pr.id)
      if (worker === undefined) {
        worker = this.textures.exists('prisoner')
          ? this.add.sprite(pr.x, pr.y, 'prisoner').setScale(0.5)
          : this.add.circle(pr.x, pr.y, 12, 0xcfa15a)
        worker.setDepth(2)
        this.prisonerWorkers.set(pr.id, worker)
      }

      // Cage assez grande pour enfermer l'ouvrier (~96 px), barreaux devant.
      let cage = this.prisonerCages.get(pr.id)
      if (cage === undefined) {
        cage = this.textures.exists('cage')
          ? this.add.image(pr.x, pr.y, 'cage').setScale(1.2)
          : this.add.circle(pr.x, pr.y, 30, 0x8a8a8a, 0).setStrokeStyle(3, 0x8a8a8a)
        cage.setDepth(3)
        this.prisonerCages.set(pr.id, cage)
      }
      cage.setVisible(!pr.freed)
      worker.setPosition(pr.x, pr.y)
      if (worker instanceof Phaser.GameObjects.Sprite) {
        // Libéré → animation de marche (il s'enfuit vers le bas) ; sinon immobile en cage.
        worker.setFrame(pr.freed ? walkFrame(0, this.time.now) : idleFrame(0))
      }
    }
    // Prisonnier disparu (libéré sorti du monde → despawn) : on nettoie ses sprites.
    for (const [id, worker] of this.prisonerWorkers) {
      if (!seen.has(id)) {
        worker.destroy()
        this.prisonerWorkers.delete(id)
        const cage = this.prisonerCages.get(id)
        if (cage !== undefined) {
          cage.destroy()
          this.prisonerCages.delete(id)
        }
      }
    }
  }
}
