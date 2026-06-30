import Phaser from 'phaser'
import type { Simulation } from '@core/simulation'
import type { PlayerInput } from '@core/types'
import type { GameSeam } from '@/app/seam'
import { WORLD } from '@content/config'

export interface GameSceneData {
  sim: Simulation
  testMode: boolean
  seam: GameSeam | null
}

const PLAYER_COLOR = 0x3498db
const PLAYER_RADIUS = 16
/** Clamp du delta réel pour éviter la spirale de la mort après un gel d'onglet. */
const MAX_FRAME_MS = 100

/**
 * Scène de jeu : couche RENDU. Elle observe `Simulation.getState()` et dessine ;
 * elle n'abrite aucune logique de gameplay. En mode test, ni le clavier ni le
 * temps réel ne pilotent la sim — seul le seam le fait (déterminisme).
 */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation
  private testMode = false
  private seam: GameSeam | null = null
  private readonly playerSprites = new Map<number, Phaser.GameObjects.Arc>()

  constructor() {
    super('game')
  }

  init(data: GameSceneData): void {
    this.sim = data.sim
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

    const leader = this.playerSprites.get(1)
    if (leader !== undefined) {
      this.cameras.main.startFollow(leader, true, 0.1, 0.1)
    }

    if (this.seam !== null) {
      this.seam.ready = true
    }
  }

  update(_time: number, delta: number): void {
    if (!this.testMode) {
      this.sim.setInput(1, this.readKeyboard())
      this.sim.advanceTime(Math.min(delta, MAX_FRAME_MS))
    }
    this.syncSprites()
  }

  /** Lit le clavier (flèches / WASD / ZQSD) en un PlayerInput. */
  private readKeyboard(): PlayerInput {
    const kb = this.input.keyboard
    if (kb === null) {
      return { move: { x: 0, y: 0 }, attack: false }
    }
    const down = (codes: number[]): boolean => codes.some((c) => kb.checkDown(kb.addKey(c)))
    const K = Phaser.Input.Keyboard.KeyCodes
    let x = 0
    let y = 0
    if (down([K.LEFT, K.A, K.Q])) {
      x -= 1
    }
    if (down([K.RIGHT, K.D])) {
      x += 1
    }
    if (down([K.UP, K.W, K.Z])) {
      y -= 1
    }
    if (down([K.DOWN, K.S])) {
      y += 1
    }
    return { move: { x, y }, attack: false }
  }

  /** Synchronise les sprites avec l'état courant de la simulation. */
  private syncSprites(): void {
    const state = this.sim.getState()
    for (const p of state.players) {
      let sprite = this.playerSprites.get(p.id)
      if (sprite === undefined) {
        sprite = this.add.circle(p.x, p.y, PLAYER_RADIUS, PLAYER_COLOR)
        this.playerSprites.set(p.id, sprite)
      }
      sprite.setPosition(p.x, p.y)
      sprite.setVisible(p.alive)
    }
  }
}
