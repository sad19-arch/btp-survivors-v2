import Phaser from 'phaser'
import type { App } from '@/app/app'
import type { GameSeam } from '@/app/seam'
import { KeyboardInput } from '@input/keyboard'
import { GamepadInput } from '@input/gamepad'
import { routeInput, type FrameInput } from '@input/intents'
import { WORLD } from '@content/config'
import { createGround } from '@render/ground'
import { createProps } from '@render/props'
import { dirRow, walkFrame, idleFrame, enemySheetKey } from '@render/sprites'
import { AuraPulseEvent } from '@core/events'

/** Variantes de tuiles de sol et décalques du stage 01 (chargés en preload). */
const GROUND_TILE_KEYS = ['ground_0', 'ground_1', 'ground_2', 'ground_3', 'ground_4', 'ground_5']
const GROUND_DECAL_KEYS = ['decal_puddle', 'decal_weeds', 'decal_pebbles', 'decal_crack', 'decal_tracks']

/** Feuilles de personnages 4×4 chargées en preload : [clé, fichier, taille de frame]. */
const CHAR_SHEETS: ReadonlyArray<readonly [string, string, number]> = [
  ['player', 'player_j1.png', 192],
  ['brute', 'stage01/enemies/brute_walk.png', 192],
  ['imp', 'stage01/enemies/imp_walk.png', 192],
  ['mudling', 'stage01/enemies/mudling_walk.png', 192],
  ['boss', 'stage01/boss/ground_keeper_walk.png', 256],
]
/**
 * Échelle de rendu PAR FEUILLE. Calibrée pour que la taille AFFICHÉE (bbox de l'art,
 * pas la cellule) soit cohérente entre persos : l'art natif PixelLab a des hauteurs
 * différentes dans les cellules 192/256 (cf. tools/assets/measure-sprite-size.mjs),
 * donc une échelle unique rendrait les créatures ~2× plus petites que le joueur.
 * Cibles ~hauteur affichée : joueur 83 · huissier 88 (tank, trapu) · inspecteur 70
 * (rapide, petit) · paperasse 74 (base) · boss 144 (≫ joueur).
 */
const CHAR_SCALE: Record<string, number> = {
  player: 0.516,
  brute: 1.0,
  imp: 0.9,
  mudling: 1.25,
  boss: 1.35,
}
const DEFAULT_CHAR_SCALE = 0.516

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

/** Props décoratifs du stage 01 : [clé, fichier, échelle, nombre dispersé]. */
const PROPS: ReadonlyArray<{ key: string; file: string; scale: number; count: number }> = [
  { key: 'prop_sign', file: 'stage01/props/site_sign.png', scale: 1.1, count: 2 },
  { key: 'prop_stakes', file: 'stage01/props/survey_stakes.png', scale: 1.1, count: 3 },
  { key: 'prop_tape', file: 'stage01/props/boundary_tape.png', scale: 1.0, count: 3 },
  { key: 'prop_rocks', file: 'stage01/props/rock_cluster.png', scale: 1.0, count: 5 },
  { key: 'prop_weeds', file: 'stage01/props/dry_weeds.png', scale: 1.0, count: 6 },
  { key: 'prop_soft', file: 'stage01/props/soft_ground.png', scale: 1.4, count: 3 },
]

export interface GameSceneData {
  app: App
  testMode: boolean
  seam: GameSeam | null
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
  private keyboardInput: KeyboardInput | null = null
  private gamepadInput: GamepadInput | null = null
  private following = false
  private readonly playerSprites = new Map<number, CharSprite>()
  private readonly enemySprites = new Map<number, CharSprite>()
  private readonly projectileSprites = new Map<number, CharSprite>()
  private readonly pickupSprites = new Map<number, CharSprite>()
  /** Dernier niveau connu par joueur (détection de montée de niveau → VFX). */
  private readonly prevLevel = new Map<number, number>()
  /** VFX d'onde de choc du marteau, déclenché par l'événement d'aura de la sim. */
  private readonly onAuraPulse = (e: Event): void => {
    const p = e as AuraPulseEvent
    this.spawnVfx('vfx_shockwave', p.x, p.y, 0.4, Math.max(1.5, (p.radius * 2) / 90), 320)
  }

  constructor() {
    super('game')
  }

  init(data: GameSceneData): void {
    this.app = data.app
    this.testMode = data.testMode
    this.seam = data.seam
  }

  preload(): void {
    GROUND_TILE_KEYS.forEach((k, i) => this.load.image(k, `stage01/ground/tile_${i}.png`))
    this.load.image('decal_puddle', 'stage01/decals/puddle.png')
    this.load.image('decal_weeds', 'stage01/decals/weeds.png')
    this.load.image('decal_pebbles', 'stage01/decals/pebbles.png')
    this.load.image('decal_crack', 'stage01/decals/crack.png')
    this.load.image('decal_tracks', 'stage01/decals/tracks.png')
    for (const [key, file, frame] of CHAR_SHEETS) {
      this.load.spritesheet(key, file, { frameWidth: frame, frameHeight: frame })
    }
    this.load.image('proj_scie', 'stage01/weapons/proj_scie.png')
    this.load.image('proj_cloueur', 'stage01/weapons/proj_cloueur.png')
    this.load.image('pickup_xp', 'stage01/pickups/xp.png')
    this.load.image('pickup_health', 'stage01/pickups/health.png')
    this.load.image('pickup_magnet', 'stage01/pickups/magnet.png')
    this.load.image('pickup_crate', 'stage01/pickups/crate.png')
    for (const p of PROPS) {
      this.load.image(p.key, p.file)
    }
    this.load.image('vfx_impact', 'stage01/vfx/impact.png')
    this.load.image('vfx_sparkle', 'stage01/vfx/sparkle.png')
    this.load.image('vfx_levelup', 'stage01/vfx/levelup.png')
    this.load.image('vfx_shockwave', 'stage01/vfx/shockwave.png')
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

  create(): void {
    // Sol : base tuilée seedée + décalques épars (rendu pur, aucune logique).
    const seed = this.app.getState().seed
    createGround(
      this,
      WORLD.width,
      WORLD.height,
      { tileKeys: GROUND_TILE_KEYS, decalKeys: GROUND_DECAL_KEYS },
      seed
    )
    // Props décoratifs dispersés (au-dessus du sol, sous les entités).
    createProps(
      this,
      WORLD.width,
      WORLD.height,
      PROPS.map((p) => ({ key: p.key, scale: p.scale, count: p.count })),
      seed
    )
    this.add
      .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height)
      .setStrokeStyle(4, 0xf5c542)

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cameras.main.setZoom(1.2)

    this.syncSprites()
    this.followLeader()

    // Onde de choc du marteau : la sim émet, l'App relaie, on joue le VFX.
    this.app.events.addEventListener('auraPulse', this.onAuraPulse)
    this.events.once('shutdown', () => {
      this.app.events.removeEventListener('auraPulse', this.onAuraPulse)
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

  /** Démarre le suivi caméra dès que le sprite du joueur 1 existe. */
  private followLeader(): void {
    if (this.following) {
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

    for (const p of state.players) {
      let sprite = this.playerSprites.get(p.id)
      if (sprite === undefined) {
        sprite = this.textures.exists('player')
          ? this.add.sprite(p.x, p.y, 'player').setScale(CHAR_SCALE.player ?? DEFAULT_CHAR_SCALE)
          : this.add.circle(p.x, p.y, PLAYER_RADIUS, PLAYER_COLOR)
        this.playerSprites.set(p.id, sprite)
      }
      sprite.setPosition(p.x, p.y)
      sprite.setVisible(p.alive)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        const row = dirRow(p.vx, p.vy)
        const moving = p.vx !== 0 || p.vy !== 0
        sprite.setFrame(moving ? walkFrame(row, this.time.now) : idleFrame(row))
      }
      const prev = this.prevLevel.get(p.id)
      if (prev !== undefined && p.level > prev) {
        this.spawnVfx('vfx_levelup', p.x, p.y, 0.4, 2, 500)
      }
      this.prevLevel.set(p.id, p.level)
    }

    const leader = state.players[0]
    const seen = new Set<number>()
    for (const en of state.enemies) {
      seen.add(en.id)
      let sprite = this.enemySprites.get(en.id)
      if (sprite === undefined) {
        const key = enemySheetKey(en.type, en.isBoss)
        sprite =
          key !== null && this.textures.exists(key)
            ? this.add.sprite(en.x, en.y, key).setScale(CHAR_SCALE[key] ?? DEFAULT_CHAR_SCALE)
            : this.add.circle(en.x, en.y, ENEMY_RADIUS, ENEMY_COLOR)
        this.enemySprites.set(en.id, sprite)
      }
      sprite.setPosition(en.x, en.y)
      if (sprite instanceof Phaser.GameObjects.Sprite) {
        // L'ennemi poursuit le joueur → il regarde vers lui (pas de vx/vy exposé).
        const row = leader !== undefined ? dirRow(leader.x - en.x, leader.y - en.y) : 0
        sprite.setFrame(walkFrame(row, this.time.now))
      }
    }
    // Retire les sprites des ennemis disparus (mort → éclat d'impact).
    for (const [id, sprite] of this.enemySprites) {
      if (!seen.has(id)) {
        this.spawnVfx('vfx_impact', sprite.x, sprite.y, 0.5, 1.4, 350)
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
  }
}
