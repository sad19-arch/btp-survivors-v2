import Phaser from 'phaser'
import type { App } from '@/app/app'
import type { GameSeam } from '@/app/seam'
import { KeyboardInput } from '@input/keyboard'
import { GamepadInput } from '@input/gamepad'
import { routeInput, type FrameInput } from '@input/intents'
import { INTRO, WORLD } from '@content/config'
import { createGround } from '@render/ground'
import { createProps } from '@render/props'
import { dirRow, walkFrame, idleFrame } from '@render/sprites'
import { stageRender, type StageRender } from '@render/stages'
import { AuraPulseEvent, PrisonerFreedEvent } from '@core/events'
import type { PlayerState, PrisonerState } from '@core/types'

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

/** Sprites de projectiles par type d'arme (spin = rotation continue ; faceVel = orienté vers la vitesse). */
const PROJ_SPRITE: Record<string, { key: string; scale: number; spin: boolean; faceVel: boolean }> = {
  scie: { key: 'proj_scie', scale: 0.8, spin: true, faceVel: false },
  cloueur: { key: 'proj_cloueur', scale: 0.8, spin: false, faceVel: true },
}
/** Sprites de pickups par type. */
const PICKUP_SPRITE: Record<string, { key: string; scale: number }> = {
  xp: { key: 'pickup_xp', scale: 0.5 },
  heal: { key: 'pickup_health', scale: 0.55 },
  magnet: { key: 'pickup_magnet', scale: 0.55 },
  chest: { key: 'pickup_crate', scale: 0.6 },
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

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
  /** Config de rendu du stage courant (sol/décalques/props/skins d'ennemis). */
  private stage!: StageRender
  private keyboardInput: KeyboardInput | null = null
  private gamepadInput: GamepadInput | null = null
  private following = false
  private readonly playerSprites = new Map<number, CharSprite>()
  private readonly enemySprites = new Map<number, CharSprite>()
  private readonly projectileSprites = new Map<number, CharSprite>()
  private readonly pickupSprites = new Map<number, CharSprite>()
  /** Dernier niveau connu par joueur (détection de montée de niveau → VFX). */
  private readonly prevLevel = new Map<number, number>()
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
  /** VFX d'onde de choc du marteau, déclenché par l'événement d'aura de la sim. */
  private readonly onAuraPulse = (e: Event): void => {
    const p = e as AuraPulseEvent
    this.spawnVfx('vfx_shockwave', p.x, p.y, 0.4, Math.max(1.5, (p.radius * 2) / 90), 320)
  }
  /** Libération d'un prisonnier : étincelles + bulle « Merci ! » au-dessus de l'ouvrier. */
  private readonly onPrisonerFreed = (e: Event): void => {
    const p = e as PrisonerFreedEvent
    this.spawnVfx('vfx_sparkle', p.x, p.y, 0.5, 1.9, 450)
    this.spawnBubble(p.x, p.y)
  }

  constructor() {
    super('game')
  }

  init(data: GameSceneData): void {
    this.app = data.app
    this.testMode = data.testMode
    this.seam = data.seam
    this.lite = data.lite ?? false
    this.stage = stageRender(this.app.getState().stageId)
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
      // Feuille d'attente + variantes dorées du héros (clins d'œil ; repli si absentes).
      this.load.spritesheet('player_idle', 'player_idle.png', { frameWidth: 192, frameHeight: 192 })
      this.load.spritesheet('player_gold', 'player_j1_gold.png', { frameWidth: 192, frameHeight: 192 })
      this.load.spritesheet('player_idle_gold', 'player_idle_gold.png', { frameWidth: 192, frameHeight: 192 })
      // Ouvrier prisonnier (sosie barbu du héros) — même gabarit que le joueur (192).
      this.load.spritesheet('prisoner', 'stage01/npc/prisoner_walk.png', { frameWidth: 192, frameHeight: 192 })
    }
    this.load.image('proj_scie', 'stage01/weapons/proj_scie.png')
    this.load.image('proj_cloueur', 'stage01/weapons/proj_cloueur.png')
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

  /** Joue un effet transitoire (scale + fondu) à une position, puis se détruit. Rendu pur. */
  private spawnVfx(key: string, x: number, y: number, from: number, to: number, durationMs: number): void {
    if (!this.textures.exists(key)) {
      return
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

  /** Clé de feuille de marche du héros (dorée si débloquée + présente). */
  private walkTextureKey(): string {
    return this.goldSkin && this.textures.exists('player_gold') ? 'player_gold' : 'player'
  }

  /** Clé de feuille d'attente du héros (dorée si débloquée + présente). */
  private idleTextureKey(): string {
    return this.goldSkin && this.textures.exists('player_idle_gold') ? 'player_idle_gold' : 'player_idle'
  }

  create(): void {
    // Sol : base tuilée seedée + décalques épars (rendu pur, aucune logique).
    const seed = this.app.getState().seed
    createGround(
      this,
      WORLD.width,
      WORLD.height,
      { tileKeys: this.stage.ground.map((g) => g.key), decalKeys: this.stage.decals.map((d) => d.key) },
      seed
    )
    // Props décoratifs dispersés (au-dessus du sol, sous les entités).
    createProps(
      this,
      WORLD.width,
      WORLD.height,
      this.stage.props.map((p) => ({ key: p.key, scale: p.scale, count: p.count })),
      seed
    )
    this.add
      .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height)
      .setStrokeStyle(4, 0xf5c542)

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cameras.main.setZoom(1.2)

    this.syncSprites()
    this.followLeader()

    // Onde de choc du marteau + libération de prisonnier : la sim émet, l'App relaie.
    this.app.events.addEventListener('auraPulse', this.onAuraPulse)
    this.app.events.addEventListener('prisonerFreed', this.onPrisonerFreed)
    this.events.once('shutdown', () => {
      this.app.events.removeEventListener('auraPulse', this.onAuraPulse)
      this.app.events.removeEventListener('prisonerFreed', this.onPrisonerFreed)
    })

    if (this.input.keyboard !== null) {
      this.keyboardInput = new KeyboardInput(this.input.keyboard)
    }
    if (this.input.gamepad !== null) {
      this.gamepadInput = new GamepadInput(this.input.gamepad)
    }

    if (this.seam !== null) {
      this.seam.ready = true
    }
  }

  update(_time: number, delta: number): void {
    if (!this.testMode) {
      routeInput(this.app, this.readInput())
      this.app.advanceTime(Math.min(delta, MAX_FRAME_MS))
    }
    this.syncSprites()
    this.followLeader()
  }

  /** Démarre le suivi caméra dès que le sprite du joueur 1 existe (pas pendant l'intro). */
  private followLeader(): void {
    if (this.following || this.app.getState().introActive) {
      return
    }
    const leader = this.playerSprites.get(1)
    if (leader !== undefined) {
      this.cameras.main.startFollow(leader, true, 0.1, 0.1)
      this.following = true
    }
  }

  /** Fusionne clavier + manette en une entrée de frame. */
  private readInput(): FrameInput {
    const frames: FrameInput[] = []
    if (this.keyboardInput !== null) {
      frames.push(this.keyboardInput.readFrame())
    }
    if (this.gamepadInput !== null) {
      frames.push(this.gamepadInput.readFrame())
    }
    let x = 0
    let y = 0
    const pressed: FrameInput['pressed'] = []
    for (const f of frames) {
      x += f.move.x
      y += f.move.y
      pressed.push(...f.pressed)
    }
    return { move: { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }, pressed }
  }

  /** Synchronise les sprites avec l'état courant de la simulation. */
  private syncSprites(): void {
    const state = this.app.getState()
    this.goldSkin = state.goldSkin // rafraîchi chaque frame (débloqué au titre à tout moment)
    const introActive = state.introActive
    // Nouvelle run : ré-arme l'intro (start relance introActive) et rend la main plus tard.
    if (introActive && this.introDone) {
      this.introDone = false
      this.introStartMs = -1
      this.following = false
      this.cameras.main.stopFollow()
    }

    for (const p of state.players) {
      let sprite = this.playerSprites.get(p.id)
      if (sprite === undefined) {
        const key = this.walkTextureKey()
        sprite = this.textures.exists(key)
          ? this.add.sprite(p.x, p.y, key).setScale(PLAYER_SCALE)
          : this.add.circle(p.x, p.y, PLAYER_RADIUS, PLAYER_COLOR)
        this.playerSprites.set(p.id, sprite)
        this.lastMoveMs.set(p.id, this.time.now)
      }
      if (introActive && p.id === 1) {
        this.renderIntroPlayer(sprite, p)
        continue
      }
      sprite.setPosition(p.x, p.y)
      sprite.setVisible(p.alive)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        this.animatePlayer(sprite, p)
      }
      const prev = this.prevLevel.get(p.id)
      if (prev !== undefined && p.level > prev) {
        this.spawnVfx('vfx_levelup', p.x, p.y, 0.4, 2, 500)
      }
      this.prevLevel.set(p.id, p.level)
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
    for (const en of state.enemies) {
      seen.add(en.id)
      let sprite = this.enemySprites.get(en.id)
      if (sprite === undefined) {
        const skin = en.isBoss ? this.stage.boss : this.stage.enemies[en.type]
        const key = skin?.key
        const scale = skin?.scale ?? DEFAULT_CHAR_SCALE
        sprite =
          key !== undefined && this.textures.exists(key)
            ? this.add.sprite(en.x, en.y, key).setScale(scale)
            : this.add.circle(en.x, en.y, ENEMY_RADIUS, ENEMY_COLOR)
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
    }
    // Retire les sprites des ennemis disparus (mort → poussière de béton + éclair blanc).
    for (const [id, sprite] of this.enemySprites) {
      if (!seen.has(id)) {
        this.spawnVfx('vfx_dust', sprite.x, sprite.y, 0.4, 1.6, 380)
        this.spawnFlash(sprite.x, sprite.y)
        sprite.destroy()
        this.enemySprites.delete(id)
      }
    }

    const seenProj = new Set<number>()
    for (const pr of state.projectiles) {
      seenProj.add(pr.id)
      let sprite = this.projectileSprites.get(pr.id)
      const cfg = PROJ_SPRITE[pr.type]
      if (sprite === undefined) {
        sprite =
          cfg !== undefined && this.textures.exists(cfg.key)
            ? this.add.sprite(pr.x, pr.y, cfg.key).setScale(cfg.scale)
            : this.add.circle(pr.x, pr.y, PROJECTILE_RADIUS, PROJECTILE_COLOR)
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
        sprite.destroy()
        this.projectileSprites.delete(id)
      }
    }

    const seenPickup = new Set<number>()
    for (const pk of state.pickups) {
      seenPickup.add(pk.id)
      let sprite = this.pickupSprites.get(pk.id)
      const cfg = PICKUP_SPRITE[pk.type]
      if (sprite === undefined) {
        sprite =
          cfg !== undefined && this.textures.exists(cfg.key)
            ? this.add.sprite(pk.x, pk.y, cfg.key).setScale(cfg.scale)
            : this.add.circle(pk.x, pk.y, PICKUP_RADIUS, PICKUP_COLOR)
        this.pickupSprites.set(pk.id, sprite)
      }
      sprite.setPosition(pk.x, pk.y)
    }
    for (const [id, sprite] of this.pickupSprites) {
      if (!seenPickup.has(id)) {
        this.spawnVfx('vfx_sparkle', sprite.x, sprite.y, 0.6, 1.6, 300)
        sprite.destroy()
        this.pickupSprites.delete(id)
      }
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
      const key = this.walkTextureKey()
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
    const idleKey = this.idleTextureKey()
    if (!moving && idleFor > IDLE_EMOTE_MS && this.textures.exists(idleKey)) {
      if (sprite.texture.key !== idleKey) {
        sprite.setTexture(idleKey)
      }
      sprite.setFrame(walkFrame(0, this.time.now, 220)) // boucle lente, face caméra
      return
    }
    const walkKey = this.walkTextureKey()
    if (sprite.texture.key !== walkKey) {
      sprite.setTexture(walkKey)
    }
    const row = dirRow(p.vx, p.vy)
    sprite.setFrame(moving ? walkFrame(row, this.time.now) : idleFrame(row))
  }

  /** Dessine l'ouvrier prisonnier (cage + sosie barbu) ; la cage disparaît une fois libéré. */
  private syncPrisoners(prisoners: readonly PrisonerState[]): void {
    for (const pr of prisoners) {
      let worker = this.prisonerWorkers.get(pr.id)
      if (worker === undefined) {
        worker = this.textures.exists('prisoner')
          ? this.add.sprite(pr.x, pr.y, 'prisoner').setScale(0.5)
          : this.add.circle(pr.x, pr.y, 12, 0xcfa15a)
        worker.setDepth(2)
        this.prisonerWorkers.set(pr.id, worker)
      }

      // Cage devant l'ouvrier (barreaux) tant qu'il n'est pas libéré.
      let cage = this.prisonerCages.get(pr.id)
      if (cage === undefined) {
        cage = this.textures.exists('cage')
          ? this.add.image(pr.x, pr.y, 'cage').setScale(0.5)
          : this.add.circle(pr.x, pr.y, 22, 0x8a8a8a, 0).setStrokeStyle(3, 0x8a8a8a)
        cage.setDepth(3)
        this.prisonerCages.set(pr.id, cage)
      }
      cage.setVisible(!pr.freed)
      worker.setPosition(pr.x, pr.y)
      if (worker instanceof Phaser.GameObjects.Sprite) {
        worker.setFrame(idleFrame(0))
      }
    }
  }
}
