import Phaser from 'phaser'
import type { App } from '@/app/app'
import type { GameSeam } from '@/app/seam'
import { KeyboardInput } from '@input/keyboard'
import { GamepadInput } from '@input/gamepad'
import { routeInput, type FrameInput } from '@input/intents'
import { WORLD } from '@content/config'

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
  private readonly playerSprites = new Map<number, Phaser.GameObjects.Arc>()
  private readonly enemySprites = new Map<number, Phaser.GameObjects.Arc>()
  private readonly projectileSprites = new Map<number, Phaser.GameObjects.Arc>()
  private readonly pickupSprites = new Map<number, Phaser.GameObjects.Arc>()

  constructor() {
    super('game')
  }

  init(data: GameSceneData): void {
    this.app = data.app
    this.testMode = data.testMode
    this.seam = data.seam
  }

  create(): void {
    // Sol et limites du monde.
    this.add.rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, 0x2b2b2b)
    this.add
      .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height)
      .setStrokeStyle(4, 0xf5c542)

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cameras.main.setZoom(1.2)

    this.syncSprites()
    this.followLeader()

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
        sprite = this.add.circle(p.x, p.y, PLAYER_RADIUS, PLAYER_COLOR)
        this.playerSprites.set(p.id, sprite)
      }
      sprite.setPosition(p.x, p.y)
      sprite.setVisible(p.alive)
    }

    const seen = new Set<number>()
    for (const en of state.enemies) {
      seen.add(en.id)
      let sprite = this.enemySprites.get(en.id)
      if (sprite === undefined) {
        sprite = this.add.circle(en.x, en.y, ENEMY_RADIUS, ENEMY_COLOR)
        this.enemySprites.set(en.id, sprite)
      }
      sprite.setPosition(en.x, en.y)
    }
    // Retire les sprites des ennemis disparus.
    for (const [id, sprite] of this.enemySprites) {
      if (!seen.has(id)) {
        sprite.destroy()
        this.enemySprites.delete(id)
      }
    }

    const seenProj = new Set<number>()
    for (const pr of state.projectiles) {
      seenProj.add(pr.id)
      let sprite = this.projectileSprites.get(pr.id)
      if (sprite === undefined) {
        sprite = this.add.circle(pr.x, pr.y, PROJECTILE_RADIUS, PROJECTILE_COLOR)
        this.projectileSprites.set(pr.id, sprite)
      }
      sprite.setPosition(pr.x, pr.y)
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
      if (sprite === undefined) {
        sprite = this.add.circle(pk.x, pk.y, PICKUP_RADIUS, PICKUP_COLOR)
        this.pickupSprites.set(pk.id, sprite)
      }
      sprite.setPosition(pk.x, pk.y)
    }
    for (const [id, sprite] of this.pickupSprites) {
      if (!seenPickup.has(id)) {
        sprite.destroy()
        this.pickupSprites.delete(id)
      }
    }
  }
}
