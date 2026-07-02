import { World } from './world'
import { Rng } from './rng'
import {
  AuraPulseEvent,
  PrisonerFreedEvent,
  EnemyKilledEvent,
  PlayerHurtEvent,
  LevelUpEvent,
  WeaponFiredEvent,
  PickupCollectedEvent,
  BossSpawnedEvent,
  type AuraPulse
} from './events'
import { STEP_MS } from './clock'
import { movementSystem } from './systems/movement'
import { worldBoundsSystem } from './systems/bounds'
import { enemyAiSystem } from './systems/enemyAi'
import { spawnBoss, spawnWave } from './systems/spawn'
import { weaponSystem } from './systems/weapon'
import { collisionSystem } from './systems/collision'
import { reapDeadEnemies } from './systems/reap'
import { pickupSystem } from './systems/pickup'
import { rescueSystem } from './systems/rescue'
import { projectileLifetimeSystem } from './systems/projectile'
import { consumeLevelUp, initialProgress } from './systems/leveling'
import { allPlayersDead } from './systems/gameRules'
import { MINI_BOSS, MODE_PLAYER_COUNT, PLAYER_BASE, PROGRESSION, RESCUE, SPAWN, STARTING_WEAPONS, WORLD } from '@content/config'
import { SPAWN_RAMP, spawnParamsAt, difficultyScaleAt } from '@content/spawnRamp'
import { ConstructionPhaseId, PHASES } from '@content/phases'
import { ENEMIES, MINI_BOSS_ID } from '@content/enemies'
import { UPGRADES, rollUpgradeChoices } from '@content/upgrades'
import type { ConstructionPhase } from '@content/phases'
import type {
  EnemyState,
  EntityId,
  GameMode,
  GameState,
  PendingLevelUp,
  PickupState,
  PickupKind,
  PlayerInput,
  PlayerState,
  PrisonerState,
  ProjectileState,
  Vec2
} from './types'

export interface SimOptions {
  seed: number
  mode: GameMode
  /** Phase/stage du chantier (défaut : terrain vierge). */
  phaseId?: ConstructionPhaseId | undefined
}

const COORD_SYSTEM = 'origin top-left, +x right, +y down'

/** Résout une phase du cycle de chantier (source de vérité : thème + pools d'ennemis). */
function resolvePhase(phaseId: ConstructionPhaseId): ConstructionPhase {
  const phase = PHASES[phaseId]
  if (phase === undefined) {
    throw new Error(`Contenu invalide: phase « ${phaseId} » non définie`)
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
  /** RNG dédié au loot (drops bonus) — séparé du RNG de spawn/upgrade (équilibrage préservé). */
  private lootRng: Rng
  /** RNG dédié au placement du prisonnier — séparé pour NE PAS décaler la séquence de spawn/upgrade. */
  private prisonerRng: Rng
  private readonly phaseId: ConstructionPhaseId
  private phase: ConstructionPhase
  private currentSeed: number
  private scene: GameState['scene'] = 'game'
  private elapsedMs = 0
  private remainderMs = 0
  private spawnAccMs = 0
  private score = 0
  private miniBossSpawned = false
  /** Vrai une fois le boss RÉELLEMENT apparu (garde-fou anti faux-positif de victoire). */
  private bossEverSpawned = false
  private pendingLevelUp: PendingLevelUp | null = null
  /** PV totaux des joueurs au pas précédent → détecte les dégâts (SFX, observation pure). */
  private prevHpTotal = 0
  private readonly inputs = new Map<number, PlayerInput>()
  private readonly playerEntities = new Map<number, EntityId>()

  constructor(opts: SimOptions) {
    this.mode = opts.mode
    this.currentSeed = opts.seed
    this.world = new World()
    this.rng = new Rng(opts.seed)
    this.lootRng = new Rng((opts.seed ^ 0x1007) | 0)
    this.prisonerRng = new Rng((opts.seed ^ 0x2b1d) | 0)
    this.phaseId = opts.phaseId ?? ConstructionPhaseId.TERRAIN_VIERGE
    this.phase = resolvePhase(this.phaseId)
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

  /**
   * Avance la simulation de `ms` millisecondes logiques, par pas fixes.
   * Le temps est gelé tant que la partie n'est pas en cours (pause, game over)
   * ou qu'un choix de carte est en attente → déterministe via le seam.
   */
  advanceTime(ms: number): void {
    if (this.isFrozen()) {
      return
    }
    this.remainderMs += ms
    while (this.remainderMs >= STEP_MS) {
      this.remainderMs -= STEP_MS
      this.step(STEP_MS)
      this.elapsedMs += STEP_MS
      if (this.isFrozen()) {
        // Un level-up (ou game over) est survenu en cours d'avance : on gèle.
        this.remainderMs = 0
        break
      }
    }
  }

  /** Vrai si le temps de jeu ne doit pas s'écouler. */
  private isFrozen(): boolean {
    return this.scene !== 'game' || this.pendingLevelUp !== null
  }

  /** Met la partie en pause (depuis l'état en jeu). */
  pause(): void {
    if (this.scene === 'game') {
      this.scene = 'paused'
    }
  }

  /** Reprend la partie (depuis la pause). */
  resume(): void {
    if (this.scene === 'paused') {
      this.scene = 'game'
    }
  }

  /** Relance une partie neuve avec la seed courante. */
  restart(): void {
    this.reset(this.currentSeed)
  }

  /**
   * Applique la carte d'upgrade choisie au joueur concerné, lève le gel, puis
   * vérifie si un palier supplémentaire a été atteint (XP banque).
   */
  chooseUpgrade(index: number): void {
    const pending = this.pendingLevelUp
    if (pending === null) {
      return
    }
    const choice = pending.choices[index]
    if (choice !== undefined) {
      const e = this.playerEntities.get(pending.playerId)
      const def = UPGRADES[choice.id]
      if (e !== undefined && def !== undefined) {
        def.apply(this.world, e)
      }
    }
    this.pendingLevelUp = null
    this.checkLevelUp()
  }

  /** État complet sérialisable (contrat du seam). */
  getState(): GameState {
    return {
      scene: this.scene,
      seed: this.currentSeed,
      stageId: this.phaseId,
      elapsedMs: this.elapsedMs,
      wave: 0,
      score: this.score,
      coordSystem: COORD_SYSTEM,
      players: this.collectPlayers(),
      enemies: this.collectEnemies(),
      projectiles: this.collectProjectiles(),
      pickups: this.collectPickups(),
      prisoners: this.collectPrisoners(),
      pendingLevelUp: this.pendingLevelUp
    }
  }

  /** Vue texte lisible pour « jouer à l'aveugle ». */
  renderToText(): string {
    const s = this.getState()
    const lines = [`scene=${s.scene} t=${Math.round(s.elapsedMs)}ms seed=${s.seed} score=${s.score}`]
    for (const p of s.players) {
      lines.push(
        `P${p.id} (${p.x.toFixed(0)},${p.y.toFixed(0)}) hp=${Math.round(p.hp)}/${Math.round(p.maxHp)} ` +
          `niv.${p.level} xp=${Math.round(p.xp)}/${p.nextThreshold} ${p.alive ? 'vivant' : 'mort'}`
      )
    }
    lines.push(`ennemis=${s.enemies.length} projectiles=${s.projectiles.length} gemmes=${s.pickups.length}`)
    if (s.pendingLevelUp !== null) {
      const cards = s.pendingLevelUp.choices.map((c, i) => `[${i}] ${c.name}`).join('  ')
      lines.push(`CHOIX P${s.pendingLevelUp.playerId}: ${cards}`)
    }
    return lines.join('\n')
  }

  // --- interne ------------------------------------------------------------

  private reset(seed: number): void {
    this.currentSeed = seed
    this.world = new World()
    this.rng = new Rng(seed)
    this.lootRng = new Rng((seed ^ 0x1007) | 0)
    this.prisonerRng = new Rng((seed ^ 0x2b1d) | 0)
    this.phase = resolvePhase(this.phaseId)
    this.scene = 'game'
    this.elapsedMs = 0
    this.remainderMs = 0
    this.spawnAccMs = 0
    this.score = 0
    this.miniBossSpawned = false
    this.bossEverSpawned = false
    this.pendingLevelUp = null
    this.inputs.clear()
    this.playerEntities.clear()
    this.spawnPlayers()
    this.spawnPrisoner()
    this.prevHpTotal = this.totalPlayerHp()
  }

  /** Somme des PV de tous les joueurs (pour détecter une perte de PV entre deux pas). */
  private totalPlayerHp(): number {
    let total = 0
    for (const e of this.playerEntities.values()) {
      total += this.world.get(e, 'health')?.hp ?? 0
    }
    return total
  }

  /** Place l'unique ouvrier prisonnier de la run (position seedée, à distance du centre). */
  private spawnPrisoner(): void {
    const cx = WORLD.width / 2
    const cy = WORLD.height / 2
    const angle = this.prisonerRng.float(0, Math.PI * 2)
    const dist = this.prisonerRng.float(RESCUE.minDist, RESCUE.maxDist)
    const margin = 80
    const x = Math.min(WORLD.width - margin, Math.max(margin, cx + Math.cos(angle) * dist))
    const y = Math.min(WORLD.height - margin, Math.max(margin, cy + Math.sin(angle) * dist))
    const e = this.world.spawn()
    this.world.add(e, 'position', { x, y })
    this.world.add(e, 'prisoner', { freed: false })
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
        vigilance: PLAYER_BASE.vigilance,
        damageMult: 1,
        cooldownMult: 1,
        pickupRadius: PLAYER_BASE.pickupRadius
      })
      this.world.add(e, 'progress', initialProgress())
      this.world.add(e, 'weapons', {
        slots: STARTING_WEAPONS.map((wid) => ({ id: wid, cooldownLeftMs: 0 }))
      })
      this.playerEntities.set(id, e)
      this.inputs.set(id, { move: { x: 0, y: 0 }, attack: false })
    }
  }

  private step(dtMs: number): void {
    if (this.scene !== 'game') {
      return
    }
    const pulses: AuraPulse[] = []
    const freed: Vec2[] = []
    const fired: string[] = []
    const collected: PickupKind[] = []
    this.runSpawns(dtMs)
    this.applyPlayerInputs()
    weaponSystem(this.world, dtMs, pulses, fired)
    enemyAiSystem(this.world)
    movementSystem(this.world, dtMs)
    worldBoundsSystem(this.world, WORLD)
    collisionSystem(this.world, dtMs)
    const killed = reapDeadEnemies(this.world, this.lootRng)
    this.score += killed
    pickupSystem(this.world, dtMs, collected)
    rescueSystem(this.world, freed)
    projectileLifetimeSystem(this.world, dtMs)
    this.updateWin() // boss vaincu → victoire (priorité sur la mort simultanée)
    this.updateGameOver()
    if (this.scene === 'game') {
      this.checkLevelUp()
    }
    // --- Événements sémantiques pour l'audio (observation pure, aucun effet sim) ---
    const hpNow = this.totalPlayerHp()
    if (hpNow < this.prevHpTotal - 0.001) {
      this.events.dispatchEvent(new PlayerHurtEvent())
    }
    this.prevHpTotal = hpNow
    if (killed > 0) {
      this.events.dispatchEvent(new EnemyKilledEvent(killed))
    }
    for (const k of fired) {
      this.events.dispatchEvent(new WeaponFiredEvent(k))
    }
    for (const c of collected) {
      this.events.dispatchEvent(new PickupCollectedEvent(c))
    }
    for (const p of pulses) {
      this.events.dispatchEvent(new AuraPulseEvent(p.x, p.y, p.radius))
    }
    for (const f of freed) {
      this.events.dispatchEvent(new PrisonerFreedEvent(f.x, f.y))
    }
  }

  /**
   * Vérifie si un joueur a atteint un palier d'XP. Le cas échéant, prépare la
   * carte d'upgrade en attente (1 joueur à la fois → gel jusqu'au choix).
   */
  private checkLevelUp(): void {
    if (this.pendingLevelUp !== null) {
      return
    }
    for (const [playerId, e] of this.playerEntities) {
      const progress = this.world.get(e, 'progress')
      const health = this.world.get(e, 'health')
      if (progress === undefined || health === undefined || health.hp <= 0) {
        continue
      }
      if (consumeLevelUp(progress)) {
        this.events.dispatchEvent(new LevelUpEvent())
        this.pendingLevelUp = {
          playerId,
          choices: rollUpgradeChoices(this.rng, PROGRESSION.choices)
        }
        return
      }
    }
  }

  /** Victoire : le boss de fin a été invoqué puis vaincu (plus aucun boss vivant). */
  private updateWin(): void {
    if (this.scene === 'game' && this.bossEverSpawned && !this.anyBossAlive()) {
      this.scene = 'won'
      this.events.dispatchEvent(new Event('win'))
    }
  }

  private anyBossAlive(): boolean {
    for (const e of this.world.query('enemy')) {
      if (this.world.get(e, 'enemy')?.isBoss === true) {
        return true
      }
    }
    return false
  }

  private updateGameOver(): void {
    if (this.scene === 'game' && allPlayersDead(this.world)) {
      this.scene = 'gameover'
      this.events.dispatchEvent(new Event('gameOver'))
    }
  }

  private runSpawns(dtMs: number): void {
    this.maybeSpawnMiniBoss()
    this.spawnAccMs += dtMs
    const { intervalMs, countPerWave } = spawnParamsAt(SPAWN_RAMP, this.elapsedMs)
    const scale = difficultyScaleAt(this.elapsedMs)
    while (this.spawnAccMs >= intervalMs) {
      this.spawnAccMs -= intervalMs
      if (this.countEnemies() < SPAWN.maxActive) {
        spawnWave(this.world, this.rng, this.phase, this.playersCentroid(), countPerWave, scale)
      }
    }
  }

  /** Invoque le mini-boss une seule fois, au seuil temporel (PRD : 5:00). */
  private maybeSpawnMiniBoss(): void {
    if (this.miniBossSpawned || this.elapsedMs < MINI_BOSS.atMs) {
      return
    }
    const def = ENEMIES[MINI_BOSS_ID]
    if (def !== undefined) {
      spawnBoss(this.world, def, this.playersCentroid(), this.rng.float(0, Math.PI * 2), MINI_BOSS.spawnRadius)
      this.bossEverSpawned = true
      this.events.dispatchEvent(new BossSpawnedEvent())
    }
    this.miniBossSpawned = true
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
      const progress = this.world.get(e, 'progress')
      players.push({
        id,
        x: pos.x,
        y: pos.y,
        vx: vel.x,
        vy: vel.y,
        hp: health.hp,
        maxHp: health.maxHp,
        vigilance: player.vigilance,
        level: progress?.level ?? 1,
        xp: progress?.xp ?? 0,
        nextThreshold: progress?.nextThreshold ?? PROGRESSION.firstThreshold,
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
        maxHp: health.maxHp,
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
    // Les lames de scie sont rendues comme des projectiles (type 'scie').
    for (const e of this.world.query('orbiter', 'position')) {
      const pos = this.world.get(e, 'position')
      const orb = this.world.get(e, 'orbiter')
      if (pos === undefined || orb === undefined) {
        continue
      }
      projectiles.push({ id: e, x: pos.x, y: pos.y, vx: 0, vy: 0, type: orb.weaponId })
    }
    return projectiles
  }

  private collectPickups(): PickupState[] {
    const pickups: PickupState[] = []
    for (const e of this.world.query('pickup', 'position')) {
      const pos = this.world.get(e, 'position')
      const pickup = this.world.get(e, 'pickup')
      if (pos === undefined || pickup === undefined) {
        continue
      }
      pickups.push({ id: e, x: pos.x, y: pos.y, type: pickup.type, value: pickup.value })
    }
    return pickups
  }

  private collectPrisoners(): PrisonerState[] {
    const prisoners: PrisonerState[] = []
    for (const e of this.world.query('prisoner', 'position')) {
      const pos = this.world.get(e, 'position')
      const prisoner = this.world.get(e, 'prisoner')
      if (pos === undefined || prisoner === undefined) {
        continue
      }
      prisoners.push({ id: e, x: pos.x, y: pos.y, freed: prisoner.freed })
    }
    return prisoners
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
