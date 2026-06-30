import { World } from './world'
import { Rng } from './rng'
import { STEP_MS } from './clock'
import { movementSystem } from './systems/movement'
import { enemyAiSystem } from './systems/enemyAi'
import { spawnWave } from './systems/spawn'
import { weaponSystem } from './systems/weapon'
import { collisionSystem } from './systems/collision'
import { projectileLifetimeSystem } from './systems/projectile'
import { allPlayersDead } from './systems/gameRules'
import { MODE_PLAYER_COUNT, PLAYER_BASE, SPAWN, STARTING_WEAPONS, WORLD } from '@content/config'
import { ConstructionPhaseId, PHASES } from '@content/phases'
import type { ConstructionPhase } from '@content/phases'
import type {
  EnemyState,
  EntityId,
  GameMode,
  GameState,
  PlayerInput,
  PlayerState,
  ProjectileState,
  Vec2
} from './types'

export interface SimOptions {
  seed: number
  mode: GameMode
}

const COORD_SYSTEM = 'origin top-left, +x right, +y down'

/** Phase de slice 1 (colonne vertébrale : début du cycle de chantier). */
function resolvePhase(): ConstructionPhase {
  const phase = PHASES[ConstructionPhaseId.TERRAIN_VIERGE]
  if (phase === undefined) {
    throw new Error('Contenu invalide: phase terrain_vierge manquante')
  }
  return phase
}

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
  private rng: Rng
  private phase: ConstructionPhase
  private currentSeed: number
  private scene: GameState['scene'] = 'game'
  private elapsedMs = 0
  private remainderMs = 0
  private spawnAccMs = 0
  private score = 0
  private readonly inputs = new Map<number, PlayerInput>()
  private readonly playerEntities = new Map<number, EntityId>()

  constructor(opts: SimOptions) {
    this.mode = opts.mode
    this.currentSeed = opts.seed
    this.world = new World()
    this.rng = new Rng(opts.seed)
    this.phase = resolvePhase()
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
    return {
      scene: this.scene,
      seed: this.currentSeed,
      elapsedMs: this.elapsedMs,
      wave: 0,
      score: this.score,
      coordSystem: COORD_SYSTEM,
      players: this.collectPlayers(),
      enemies: this.collectEnemies(),
      projectiles: this.collectProjectiles(),
      pickups: [],
      pendingLevelUp: null
    }
  }

  /** Vue texte lisible pour « jouer à l'aveugle ». */
  renderToText(): string {
    const s = this.getState()
    const lines = [`scene=${s.scene} t=${Math.round(s.elapsedMs)}ms seed=${s.seed} score=${s.score}`]
    for (const p of s.players) {
      lines.push(
        `P${p.id} (${p.x.toFixed(0)},${p.y.toFixed(0)}) hp=${Math.round(p.hp)}/${p.maxHp} ${p.alive ? 'vivant' : 'mort'}`
      )
    }
    lines.push(`ennemis=${s.enemies.length} projectiles=${s.projectiles.length}`)
    return lines.join('\n')
  }

  // --- interne ------------------------------------------------------------

  private reset(seed: number): void {
    this.currentSeed = seed
    this.world = new World()
    this.rng = new Rng(seed)
    this.phase = resolvePhase()
    this.scene = 'game'
    this.elapsedMs = 0
    this.remainderMs = 0
    this.spawnAccMs = 0
    this.score = 0
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
      this.world.add(e, 'weapons', {
        slots: STARTING_WEAPONS.map((wid) => ({ id: wid, cooldownLeftMs: 0 }))
      })
      this.playerEntities.set(id, e)
      this.inputs.set(id, { move: { x: 0, y: 0 }, attack: false })
    }
  }

  private step(dtMs: number): void {
    if (this.scene === 'gameover') {
      return
    }
    this.runSpawns(dtMs)
    this.applyPlayerInputs()
    weaponSystem(this.world, dtMs)
    enemyAiSystem(this.world)
    movementSystem(this.world, dtMs)
    this.score += collisionSystem(this.world, dtMs)
    projectileLifetimeSystem(this.world, dtMs)
    this.updateGameOver()
  }

  private updateGameOver(): void {
    if (allPlayersDead(this.world)) {
      this.scene = 'gameover'
      this.events.dispatchEvent(new Event('gameOver'))
    }
  }

  private runSpawns(dtMs: number): void {
    this.spawnAccMs += dtMs
    while (this.spawnAccMs >= SPAWN.intervalMs) {
      this.spawnAccMs -= SPAWN.intervalMs
      if (this.countEnemies() < SPAWN.maxActive) {
        spawnWave(this.world, this.rng, this.phase, this.playersCentroid(), SPAWN.countPerWave)
      }
    }
  }

  private applyPlayerInputs(): void {
    for (const [playerId, e] of this.playerEntities) {
      const input = this.inputs.get(playerId)
      const player = this.world.get(e, 'player')
      const vel = this.world.get(e, 'velocity')
      const health = this.world.get(e, 'health')
      if (input === undefined || player === undefined || vel === undefined || health === undefined) {
        continue
      }
      if (health.hp <= 0) {
        vel.x = 0
        vel.y = 0
        continue
      }
      const dir = normalize(input.move)
      vel.x = dir.x * player.speed
      vel.y = dir.y * player.speed
    }
  }

  private collectPlayers(): PlayerState[] {
    const players: PlayerState[] = []
    for (const [id, e] of this.playerEntities) {
      const pos = this.world.get(e, 'position')
      const vel = this.world.get(e, 'velocity')
      const health = this.world.get(e, 'health')
      const player = this.world.get(e, 'player')
      if (pos === undefined || vel === undefined || health === undefined || player === undefined) {
        continue
      }
      const loadout = this.world.get(e, 'weapons')
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
        weapons: loadout === undefined ? [] : loadout.slots.map((s) => s.id)
      })
    }
    players.sort((a, b) => a.id - b.id)
    return players
  }

  private collectEnemies(): EnemyState[] {
    const enemies: EnemyState[] = []
    for (const e of this.world.query('enemy', 'position', 'health')) {
      const pos = this.world.get(e, 'position')
      const enemy = this.world.get(e, 'enemy')
      const health = this.world.get(e, 'health')
      if (pos === undefined || enemy === undefined || health === undefined) {
        continue
      }
      enemies.push({
        id: e,
        type: enemy.type,
        x: pos.x,
        y: pos.y,
        hp: health.hp,
        isElite: enemy.isElite,
        isBoss: enemy.isBoss
      })
    }
    enemies.sort((a, b) => a.id - b.id)
    return enemies
  }

  private collectProjectiles(): ProjectileState[] {
    const projectiles: ProjectileState[] = []
    for (const e of this.world.query('projectile', 'position', 'velocity')) {
      const pos = this.world.get(e, 'position')
      const vel = this.world.get(e, 'velocity')
      const proj = this.world.get(e, 'projectile')
      if (pos === undefined || vel === undefined || proj === undefined) {
        continue
      }
      projectiles.push({ id: e, x: pos.x, y: pos.y, vx: vel.x, vy: vel.y, type: proj.type })
    }
    return projectiles
  }

  private countEnemies(): number {
    let n = 0
    for (const _e of this.world.query('enemy')) {
      void _e
      n += 1
    }
    return n
  }

  private playersCentroid(): Vec2 {
    let sx = 0
    let sy = 0
    let n = 0
    for (const [, e] of this.playerEntities) {
      const pos = this.world.get(e, 'position')
      const health = this.world.get(e, 'health')
      if (pos === undefined || health === undefined || health.hp <= 0) {
        continue
      }
      sx += pos.x
      sy += pos.y
      n += 1
    }
    if (n === 0) {
      return { x: WORLD.width / 2, y: WORLD.height / 2 }
    }
    return { x: sx / n, y: sy / n }
  }
}
