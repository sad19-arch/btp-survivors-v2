import { World } from './world'
import { STEP_MS } from './clock'
import { movementSystem } from './systems/movement'
import { MODE_PLAYER_COUNT, PLAYER_BASE, WORLD } from '@content/config'
import type { EntityId, GameMode, GameState, PlayerInput, PlayerState, Vec2 } from './types'

export interface SimOptions {
  seed: number
  mode: GameMode
}

const COORD_SYSTEM = 'origin top-left, +x right, +y down'

/** Normalise un vecteur (longueur 1), ou zéro si le vecteur est nul. */
function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y)
  if (len === 0) {
    return { x: 0, y: 0 }
  }
  return { x: v.x / len, y: v.y / len }
}

/**
 * Façade de simulation : c'est le « seam » exposé plus tard sur `window.__GAME__`.
 *
 * Pilote le World de façon déterministe (seed + pas fixe), accepte des entrées
 * par API (`setInput`) et expose l'état complet en JSON (`getState`). Aucun
 * Phaser, aucun DOM autre que `EventTarget` (disponible aussi côté Node).
 */
export class Simulation {
  readonly events = new EventTarget()

  private readonly mode: GameMode
  private world: World
  private currentSeed: number
  private scene: GameState['scene'] = 'game'
  private elapsedMs = 0
  private remainderMs = 0
  private readonly inputs = new Map<number, PlayerInput>()
  private readonly playerEntities = new Map<number, EntityId>()

  constructor(opts: SimOptions) {
    this.mode = opts.mode
    this.currentSeed = opts.seed
    this.world = new World()
    this.reset(opts.seed)
  }

  /** Réinitialise complètement la partie pour une seed donnée. */
  setSeed(seed: number): void {
    this.reset(seed)
  }

  /** Injecte l'état d'entrée d'un joueur (déplacement + attaque). */
  setInput(playerId: number, input: PlayerInput): void {
    this.inputs.set(playerId, input)
  }

  /** Avance la simulation de `ms` millisecondes logiques, par pas fixes. */
  advanceTime(ms: number): void {
    this.remainderMs += ms
    while (this.remainderMs >= STEP_MS) {
      this.remainderMs -= STEP_MS
      this.step(STEP_MS)
      this.elapsedMs += STEP_MS
    }
  }

  /** État complet sérialisable (contrat du seam). */
  getState(): GameState {
    const players: PlayerState[] = []
    for (const [id, e] of this.playerEntities) {
      const pos = this.world.get(e, 'position')
      const vel = this.world.get(e, 'velocity')
      const health = this.world.get(e, 'health')
      const player = this.world.get(e, 'player')
      if (pos === undefined || vel === undefined || health === undefined || player === undefined) {
        continue
      }
      players.push({
        id,
        x: pos.x,
        y: pos.y,
        vx: vel.x,
        vy: vel.y,
        hp: health.hp,
        maxHp: health.maxHp,
        vigilance: player.vigilance,
        alive: health.hp > 0,
        weapons: []
      })
    }
    players.sort((a, b) => a.id - b.id)

    return {
      scene: this.scene,
      seed: this.currentSeed,
      elapsedMs: this.elapsedMs,
      wave: 0,
      score: 0,
      coordSystem: COORD_SYSTEM,
      players,
      enemies: [],
      projectiles: [],
      pickups: [],
      pendingLevelUp: null
    }
  }

  /** Vue texte lisible pour « jouer à l'aveugle ». */
  renderToText(): string {
    const s = this.getState()
    const lines = [`scene=${s.scene} t=${Math.round(s.elapsedMs)}ms seed=${s.seed}`]
    for (const p of s.players) {
      lines.push(
        `P${p.id} (${p.x.toFixed(0)},${p.y.toFixed(0)}) hp=${p.hp}/${p.maxHp} ${p.alive ? 'vivant' : 'mort'}`
      )
    }
    lines.push(`ennemis=${s.enemies.length} projectiles=${s.projectiles.length}`)
    return lines.join('\n')
  }

  // --- interne ------------------------------------------------------------

  private reset(seed: number): void {
    this.currentSeed = seed
    this.world = new World()
    this.scene = 'game'
    this.elapsedMs = 0
    this.remainderMs = 0
    this.inputs.clear()
    this.playerEntities.clear()
    this.spawnPlayers()
  }

  private spawnPlayers(): void {
    const count = MODE_PLAYER_COUNT[this.mode]
    const cx = WORLD.width / 2
    const cy = WORLD.height / 2
    for (let i = 0; i < count; i++) {
      const id = i + 1
      const e = this.world.spawn()
      this.world.add(e, 'position', { x: cx + i * 40, y: cy }) // formation en ligne
      this.world.add(e, 'velocity', { x: 0, y: 0 })
      this.world.add(e, 'health', { hp: PLAYER_BASE.hp, maxHp: PLAYER_BASE.hp })
      this.world.add(e, 'player', {
        playerId: id,
        speed: PLAYER_BASE.speed,
        vigilance: PLAYER_BASE.vigilance
      })
      this.playerEntities.set(id, e)
      this.inputs.set(id, { move: { x: 0, y: 0 }, attack: false })
    }
  }

  private step(dtMs: number): void {
    // Entrées joueur → vélocité.
    for (const [playerId, e] of this.playerEntities) {
      const input = this.inputs.get(playerId)
      const player = this.world.get(e, 'player')
      const vel = this.world.get(e, 'velocity')
      if (input === undefined || player === undefined || vel === undefined) {
        continue
      }
      const dir = normalize(input.move)
      vel.x = dir.x * player.speed
      vel.y = dir.y * player.speed
    }

    movementSystem(this.world, dtMs)
  }
}
