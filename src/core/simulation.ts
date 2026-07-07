import { World } from './world'
import { Rng } from './rng'
import { SpatialGrid } from './spatialGrid'
import {
  AuraPulseEvent,
  PrisonerFreedEvent,
  EnemyKilledEvent,
  PlayerHurtEvent,
  LevelUpEvent,
  WeaponFiredEvent,
  PickupCollectedEvent,
  BossSpawnedEvent,
  EvolvedEvent,
  type AuraPulse
} from './events'
import { STEP_MS } from './clock'
import { movementSystem } from './systems/movement'
import { tetherSystem } from './systems/tether'
import { worldBoundsSystem } from './systems/bounds'
import { enemyAiSystem } from './systems/enemyAi'
import { slowSystem } from './systems/slow'
import { spawnBoss, spawnGroup, spawnWave } from './systems/spawn'
import { createWaveDirectorState, stepWaveDirector, type WaveDirectorState } from './systems/waveDirector'
import { weaponSystem } from './systems/weapon'
import { collisionSystem } from './systems/collision'
import { reapDeadEnemies } from './systems/reap'
import { pickupSystem } from './systems/pickup'
import { rescueSystem } from './systems/rescue'
import { reviveSystem } from './systems/revive'
import { projectileLifetimeSystem } from './systems/projectile'
import { hazardSystem } from './systems/hazard'
import { boomerangSystem } from './systems/boomerang'
import { consumeLevelUp, initialProgress } from './systems/leveling'
import { allPlayersDead } from './systems/gameRules'
import { recomputePlayerStats } from './systems/playerStats'
import { rollCards, type Inventory } from './systems/cards'
import { tryEvolve } from './systems/evolution'
import { tickChestDirector, maybeDropEliteChest } from './systems/chestDirector'
import { coopHpFactor, FINAL_BOSS, MINI_BOSS, MODE_PLAYER_COUNT, PLAYER_BASE, PROGRESSION, RESCUE, SPAWN, TETHER, WORLD } from '@content/config'
import { SPAWN_RAMP, difficultyScaleAt } from '@content/spawnRamp'
import { EVENT_POOL_DEFAULT } from '@content/waveEvents'
import { ConstructionPhaseId, PHASES } from '@content/phases'
import { ENEMIES, MINI_BOSS_ID } from '@content/enemies'
import { characterDef, DEFAULT_CHARACTER_ID } from '@content/characters'
import type { ConstructionPhase } from '@content/phases'
import type {
  EnemyState,
  EntityId,
  GameMode,
  GameState,
  HazardState,
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
  /**
   * Id de personnage par joueur (index = playerId-1). Détermine l'arme de
   * départ (et plus tard le skin). Absent/index manquant ⇒ `DEFAULT_CHARACTER_ID`
   * (ouvrier + cloueur) — comportement solo/défaut inchangé.
   */
  characters?: readonly string[] | undefined
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
  /** RNG dédié au directeur de coffres — séparé du RNG spawn/loot/upgrade. */
  private chestRng: Rng
  /** RNG dédié au directeur de vagues — séparé de tous les autres flux (placement déterministe). */
  private _waveRng: Rng
  /** État du directeur de vagues (cadence accalmie ↔ événement). */
  private waveDir: WaveDirectorState = createWaveDirectorState()
  /** Ms accumulées depuis le dernier coffre périodique (directeur de coffres). */
  private chestAccMs = 0
  private readonly phaseId: ConstructionPhaseId
  private phase: ConstructionPhase
  /** Id de personnage par joueur (index = playerId-1), résolu au spawn. */
  private readonly characters: readonly string[]
  private currentSeed: number
  private scene: GameState['scene'] = 'game'
  private elapsedMs = 0
  private remainderMs = 0
  private score = 0
  /** Vrai une fois le boss de mi-parcours (5:00, rôle `mid`) apparu. Ne déclenche PAS la victoire. */
  private midBossSpawned = false
  /** Vrai une fois le boss FINAL (rôle `final`) RÉELLEMENT apparu (garde-fou anti faux-positif de victoire). */
  private finalBossSpawned = false
  private pendingLevelUp: PendingLevelUp | null = null
  /** PV totaux des joueurs au pas précédent → détecte les dégâts (SFX, observation pure). */
  private prevHpTotal = 0
  /** Nombre de prisonniers libérés depuis le début de la run (progression des sauvetages). */
  private rescuedTotal = 0
  private readonly inputs = new Map<number, PlayerInput>()
  private readonly playerEntities = new Map<number, EntityId>()
  /** Index spatial des ennemis (positions courantes, post-mouvement), reconstruit chaque pas
   *  juste avant `collisionSystem`. Indexe TOUS les ennemis avec position (pas de filtre HP :
   *  le contact ennemi→joueur d'origine n'a jamais filtré par HP — un ennemi tué ce pas-ci par
   *  `weaponSystem` doit encore pouvoir taper au contact avant d'être récolté). Ne fournit que
   *  des candidats — le test de distance + toute logique de dégâts restent exacts et inchangés
   *  (cf. `collisionSystem`), donc n'affecte pas les dégâts observables. */
  private readonly enemyGrid = new SpatialGrid(64)

  constructor(opts: SimOptions) {
    this.mode = opts.mode
    this.currentSeed = opts.seed
    this.world = new World()
    this.rng = new Rng(opts.seed)
    this.lootRng = new Rng((opts.seed ^ 0x1007) | 0)
    this.prisonerRng = new Rng((opts.seed ^ 0x2b1d) | 0)
    this.chestRng = new Rng((opts.seed ^ 0x3c7a) | 0)
    this._waveRng = new Rng((opts.seed ^ 0x5a1e) | 0)
    this.phaseId = opts.phaseId ?? ConstructionPhaseId.TERRAIN_VIERGE
    this.phase = resolvePhase(this.phaseId)
    this.characters = opts.characters ?? []
    this.reset(opts.seed)
  }

  /** Réinitialise complètement la partie pour une seed donnée. */
  setSeed(seed: number): void {
    this.reset(seed)
  }

  /**
   * Expose le flux RNG dédié aux vagues — utilisé par le directeur de vagues (Task 8)
   * pour appeler `spawnGroup` sans perturber le flux `rng` principal.
   */
  get waveRng(): Rng {
    return this._waveRng
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
      if (e !== undefined) {
        this.applyCard(e, choice)
      }
    }
    this.pendingLevelUp = null
    this.checkLevelUp()
  }

  /** Applique l'effet d'une carte de level-up au joueur (mutation des composants). */
  private applyCard(e: EntityId, card: PendingLevelUp['choices'][number]): void {
    switch (card.kind) {
      case 'weapon-new': {
        const loadout = this.world.get(e, 'weapons')
        if (loadout !== undefined && !loadout.slots.some((s) => s.id === card.id)) {
          loadout.slots.push({ id: card.id, level: 1, cooldownLeftMs: 0 })
        }
        break
      }
      case 'weapon-up': {
        const loadout = this.world.get(e, 'weapons')
        const slot = loadout?.slots.find((s) => s.id === card.id)
        if (slot !== undefined) {
          slot.level += 1
        }
        break
      }
      case 'passive-new': {
        const passives = this.world.get(e, 'passives')
        if (passives !== undefined && !passives.list.some((p) => p.id === card.id)) {
          passives.list.push({ id: card.id, level: 1 })
          recomputePlayerStats(this.world, e)
        }
        break
      }
      case 'passive-up': {
        const passives = this.world.get(e, 'passives')
        const slot = passives?.list.find((p) => p.id === card.id)
        if (slot !== undefined) {
          slot.level += 1
          recomputePlayerStats(this.world, e)
        }
        break
      }
    }
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
      rescue: { total: RESCUE.count, rescued: this.rescuedTotal },
      hazards: this.collectHazards(),
      pendingLevelUp: this.pendingLevelUp
    }
  }

  /**
   * [Debug/seam] Octroie directement des armes/passifs à un joueur (1 par
   * défaut), sans passer par la progression normale (upgrades). Réservé aux
   * tests et au seam de debug (`window.__GAME__`) — jamais utilisé en jeu
   * normal.
   */
  debugGrant(
    opts: { weapons?: { id: string; level: number }[]; passives?: { id: string; level: number }[] },
    playerId = 1
  ): void {
    const e = this.playerEntities.get(playerId)
    if (e === undefined) {
      return
    }
    if (opts.weapons !== undefined) {
      const loadout = this.world.get(e, 'weapons')
      if (loadout !== undefined) {
        loadout.slots = opts.weapons.map((w) => ({ id: w.id, level: w.level, cooldownLeftMs: 0 }))
      }
    }
    if (opts.passives !== undefined) {
      const passives = this.world.get(e, 'passives')
      if (passives !== undefined) {
        passives.list = opts.passives.map((p) => ({ id: p.id, level: p.level }))
      }
    }
    recomputePlayerStats(this.world, e)
  }

  /**
   * [Debug/seam] Ajoute de l'XP directement à la progression du joueur 1, sans
   * passer par un pickup. Permet de forcer un level-up de façon déterministe
   * (tests, seam de debug) — jamais utilisé en jeu normal.
   */
  debugAddXp(amount: number): void {
    const e = this.playerEntities.get(1)
    if (e === undefined) {
      return
    }
    const progress = this.world.get(e, 'progress')
    if (progress === undefined) {
      return
    }
    progress.xp += amount
  }

  /**
   * [Debug/seam] Fait apparaître un coffre d'évolution sur la position d'un
   * joueur (1 par défaut ; collecte immédiate au pas suivant), sans attendre
   * le boss.
   */
  debugSpawnChestOnPlayer(playerId = 1): void {
    const e = this.playerEntities.get(playerId)
    if (e === undefined) {
      return
    }
    const pos = this.world.get(e, 'position')
    if (pos === undefined) {
      return
    }
    const gem = this.world.spawn()
    this.world.add(gem, 'position', { x: pos.x, y: pos.y })
    this.world.add(gem, 'pickup', { type: 'coffre', value: 0 })
  }

  /**
   * [Debug/seam] Fait apparaître immédiatement le boss du rôle demandé (`mid`
   * ou `final`) au centroïde des joueurs, sans attendre le seuil temporel
   * (5:00 / ~10:30). Pose le flag `*BossSpawned` correspondant, exactement
   * comme le spawn normal, pour que `updateWin`/le coffre en mi-mort se
   * comportent de façon identique. Réservé aux tests et au seam de debug —
   * jamais utilisé en jeu normal.
   */
  debugSpawnBoss(role: 'mid' | 'final'): void {
    const def = ENEMIES[MINI_BOSS_ID]
    if (def === undefined) {
      return
    }
    const radius = role === 'mid' ? MINI_BOSS.spawnRadius : FINAL_BOSS.spawnRadius
    const hpMult = role === 'mid' ? MINI_BOSS.hpMult : FINAL_BOSS.hpMult
    const bossScale = { hp: coopHpFactor(this.playerCount()) * hpMult, contactDamage: 1, speed: 1 }
    spawnBoss(this.world, def, this.playersCentroid(), this.rng.float(0, Math.PI * 2), radius, role, bossScale)
    this.events.dispatchEvent(new BossSpawnedEvent(role))
    if (role === 'mid') {
      this.midBossSpawned = true
    } else {
      this.finalBossSpawned = true
    }
  }

  /**
   * [Debug/seam] Fait apparaître `n` ennemis de la phase courante autour du
   * centroïde des joueurs, via le spawner de vague normal (RNG seedé →
   * déterministe). Ne clampe PAS sur `SPAWN.maxActive` : c'est un helper de
   * stress dont le but est justement de dépasser le plafond normal. Réservé
   * aux tests et au seam de debug (`window.__GAME__`) — jamais en jeu normal.
   */
  debugSpawnEnemies(n: number): void {
    spawnWave(this.world, this.rng, this.phase, this.playersCentroid(), n, difficultyScaleAt(this.elapsedMs))
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
    this.chestRng = new Rng((seed ^ 0x3c7a) | 0)
    this._waveRng = new Rng((seed ^ 0x5a1e) | 0)
    this.waveDir = createWaveDirectorState()
    this.phase = resolvePhase(this.phaseId)
    this.scene = 'game'
    this.elapsedMs = 0
    this.remainderMs = 0
    this.chestAccMs = 0
    this.score = 0
    this.midBossSpawned = false
    this.finalBossSpawned = false
    this.pendingLevelUp = null
    this.inputs.clear()
    this.playerEntities.clear()
    this.rescuedTotal = 0
    this.spawnPlayers()
    this.spawnPrisoners()
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

  /** Place les `RESCUE.count` prisonniers, éparpillés loin dans des secteurs distincts. */
  private spawnPrisoners(): void {
    const cx = WORLD.width / 2
    const cy = WORLD.height / 2
    const margin = 80
    const base = this.prisonerRng.float(0, Math.PI * 2)
    for (let i = 0; i < RESCUE.count; i++) {
      const jitter = this.prisonerRng.float(-0.35, 0.35) // ±20°
      const angle = base + (i * 2 * Math.PI) / RESCUE.count + jitter
      const dist = this.prisonerRng.float(RESCUE.distMin, RESCUE.distMax)
      const x = Math.min(WORLD.width - margin, Math.max(margin, cx + Math.cos(angle) * dist))
      const y = Math.min(WORLD.height - margin, Math.max(margin, cy + Math.sin(angle) * dist))
      const e = this.world.spawn()
      this.world.add(e, 'position', { x, y })
      this.world.add(e, 'prisoner', { freed: false })
    }
  }

  private spawnPlayers(): void {
    const count = MODE_PLAYER_COUNT[this.mode]
    const cx = WORLD.width / 2
    const cy = WORLD.height / 2
    for (let i = 0; i < count; i++) {
      const id = i + 1
      const charId = this.characters[i] ?? DEFAULT_CHARACTER_ID
      const char = characterDef(charId)
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
        pickupRadius: PLAYER_BASE.pickupRadius,
        characterId: char.id
      })
      this.world.add(e, 'progress', initialProgress())
      this.world.add(e, 'weapons', {
        slots: [{ id: char.startingWeapon, level: 1, cooldownLeftMs: 0 }]
      })
      this.world.add(e, 'passives', { list: [] })
      recomputePlayerStats(this.world, e)
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
    const chestCollectors: number[] = []
    this.runSpawns(dtMs)
    // Directeur de coffres périodiques (RNG isolé, déterministe).
    this.chestAccMs += dtMs
    this.chestAccMs = tickChestDirector(this.world, this.chestRng, this.chestAccMs, this.playersCentroid())
    this.applyPlayerInputs()
    // Snapshot pré-mouvement : les armes voient les ennemis là où ils sont AVANT
    // `movementSystem` (le scan linéaire qu'elles remplaçaient itérait le monde à cet
    // instant précis). Reconstruit une seconde fois plus bas (post-mouvement) pour
    // `collisionSystem` — deux instantanés distincts, chacun exact pour son système.
    this.rebuildEnemyGrid()
    weaponSystem(this.world, dtMs, pulses, fired, this.rng, this.enemyGrid)
    slowSystem(this.world, dtMs)
    enemyAiSystem(this.world, this.elapsedMs, dtMs)
    tetherSystem(this.world, MODE_PLAYER_COUNT[this.mode] ?? 1, TETHER.maxRadius)
    movementSystem(this.world, dtMs)
    worldBoundsSystem(this.world, WORLD)
    boomerangSystem(this.world, dtMs)
    this.rebuildEnemyGrid()
    collisionSystem(this.world, dtMs, this.enemyGrid)
    const deadElitePositions = this.collectDeadElitePositions()
    const killed = reapDeadEnemies(this.world, this.lootRng)
    // Drop coffre sur mort d'élite (RNG dédié, ne perturbe pas lootRng/rng).
    for (const pos of deadElitePositions) {
      maybeDropEliteChest(this.world, this.chestRng, pos)
    }
    this.score += killed
    pickupSystem(this.world, dtMs, collected, chestCollectors)
    this.handleChestPickups(chestCollectors)
    rescueSystem(this.world, freed)
    this.rescuedTotal += freed.length
    projectileLifetimeSystem(this.world, dtMs)
    hazardSystem(this.world, dtMs, this.enemyGrid)
    // Après collision/reap (les joueurs peuvent tomber à terre ce pas-ci), avant les
    // vérifs de fin de partie (une relève complétée ce pas-ci doit annuler un game over).
    reviveSystem(this.world, this.inputs, dtMs)
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
      this.events.dispatchEvent(new AuraPulseEvent(p.x, p.y, p.radius, p.kind, p.dirX, p.dirY))
    }
    for (const f of freed) {
      this.events.dispatchEvent(new PrisonerFreedEvent(f.x, f.y))
    }
  }

  /**
   * Traite les coffres d'évolution ramassés ce pas, crédités au ramasseur réel
   * (identifié par `pickupSystem` via le composant `player` de l'entité qui a
   * touché le coffre — plus de joueur 1 codé en dur) : évolution si éligible
   * (`tryEvolve` + `EvolvedEvent`), sinon bonus de soin de repli (30 PV bornés
   * à `maxHp`). En solo, un seul ramasseur possible (joueur 1) → comportement
   * inchangé.
   */
  private handleChestPickups(collectors: number[]): void {
    // Boucle intentionnelle : chaque coffre réévalue l'inventaire APRÈS la
    // mutation du coffre précédent (une évolution consommée ce tour ne doit
    // pas retenter d'évoluer la même arme deux fois dans la même frame).
    for (const playerId of collectors) {
      const player = this.playerEntities.get(playerId)
      if (player === undefined) {
        continue
      }
      const evolvedId = tryEvolve(this.world, player)
      if (evolvedId !== null) {
        this.events.dispatchEvent(new EvolvedEvent(evolvedId, playerId))
      } else {
        const health = this.world.get(player, 'health')
        if (health !== undefined) {
          health.hp = Math.min(health.maxHp, health.hp + 30)
        }
      }
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
        const loadout = this.world.get(e, 'weapons')
        const passives = this.world.get(e, 'passives')
        const inv: Inventory = {
          weapons: loadout?.slots.map((s) => ({ id: s.id, level: s.level })) ?? [],
          passives: passives?.list.map((p) => ({ id: p.id, level: p.level })) ?? []
        }
        const choices = rollCards(this.rng, inv, PROGRESSION.choices)
        // Inventaire déjà maxé (0 carte éligible) : le niveau est déjà consommé
        // (`consumeLevelUp` ci-dessus), mais on ne gèle PAS le temps sur un écran
        // à 0 carte — ce serait un soft-lock (aucun moyen de le lever). On continue.
        if (choices.length > 0) {
          this.pendingLevelUp = { playerId, choices }
          return
        }
        continue
      }
    }
  }

  /** Victoire : le boss FINAL a été invoqué puis vaincu (plus aucun boss final vivant). */
  private updateWin(): void {
    if (this.scene === 'game' && this.finalBossSpawned && !this.anyFinalBossAlive()) {
      this.scene = 'won'
      this.events.dispatchEvent(new Event('win'))
    }
  }

  /** Vrai si le boss FINAL précisément (rôle `final`) est vivant — condition de victoire. */
  private anyFinalBossAlive(): boolean {
    for (const e of this.world.query('enemy')) {
      if (this.world.get(e, 'enemy')?.bossRole === 'final') {
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

  /** Nombre de joueurs du mode courant (garde défensive : au moins 1). */
  private playerCount(): number {
    return MODE_PLAYER_COUNT[this.mode] ?? 1
  }

  private runSpawns(dtMs: number): void {
    this.maybeSpawnMidBoss()
    this.maybeSpawnFinalBoss()
    const scale = difficultyScaleAt(this.elapsedMs)
    // Renforce les PV ennemis selon le nombre de joueurs (co-op) — dégâts/vitesse
    // inchangés. Solo (n=1) : `coopHpFactor(1)=1` → `scale.hp` identique à avant.
    const coopScale = { ...scale, hp: scale.hp * coopHpFactor(this.playerCount()) }
    const center = this.playersCentroid()
    const placements = stepWaveDirector(this.waveDir, {
      dtMs,
      elapsedMs: this.elapsedMs,
      center,
      ramp: SPAWN_RAMP,
      events: EVENT_POOL_DEFAULT,
      ringRadius: SPAWN.ringRadius,
      rng: this._waveRng
    })
    if (placements.length > 0 && this.countEnemies() < SPAWN.maxActive) {
      spawnGroup(this.world, this._waveRng, this.phase, center, placements, coopScale)
    }
  }

  /**
   * Invoque le boss de mi-parcours une seule fois, au seuil temporel (PRD : 5:00).
   * Rôle `mid` : NE déclenche PAS la victoire (sa mort lâche un coffre, cf. reap.ts).
   */
  private maybeSpawnMidBoss(): void {
    if (this.midBossSpawned || this.elapsedMs < MINI_BOSS.atMs) {
      return
    }
    const def = ENEMIES[MINI_BOSS_ID]
    if (def !== undefined) {
      const bossScale = { hp: coopHpFactor(this.playerCount()) * MINI_BOSS.hpMult, contactDamage: 1, speed: 1 }
      spawnBoss(this.world, def, this.playersCentroid(), this.rng.float(0, Math.PI * 2), MINI_BOSS.spawnRadius, 'mid', bossScale)
      this.events.dispatchEvent(new BossSpawnedEvent('mid'))
    }
    this.midBossSpawned = true
  }

  /** Invoque le boss FINAL une seule fois, au seuil temporel (~10:30). Sa mort = victoire. */
  private maybeSpawnFinalBoss(): void {
    if (this.finalBossSpawned || this.elapsedMs < FINAL_BOSS.atMs) {
      return
    }
    const def = ENEMIES[MINI_BOSS_ID]
    if (def !== undefined) {
      const bossScale = { hp: coopHpFactor(this.playerCount()) * FINAL_BOSS.hpMult, contactDamage: 1, speed: 1 }
      spawnBoss(this.world, def, this.playersCentroid(), this.rng.float(0, Math.PI * 2), FINAL_BOSS.spawnRadius, 'final', bossScale)
      this.events.dispatchEvent(new BossSpawnedEvent('final'))
    }
    this.finalBossSpawned = true
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
      const passives = this.world.get(e, 'passives')
      const revive = this.world.get(e, 'revive')
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
        downed: health.hp <= 0,
        reviveProgress: revive?.progress ?? 0,
        characterId: player.characterId ?? DEFAULT_CHARACTER_ID,
        weapons: loadout === undefined ? [] : loadout.slots.map((s) => s.id),
        weaponLevels: loadout === undefined ? [] : loadout.slots.map((s) => s.level),
        passives: passives === undefined ? [] : passives.list.map((p) => ({ id: p.id, level: p.level }))
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
        isBoss: enemy.isBoss,
        ...(enemy.bossRole !== undefined ? { bossRole: enemy.bossRole } : {})
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

  private collectHazards(): HazardState[] {
    const hazards: HazardState[] = []
    for (const e of this.world.query('hazard', 'position')) {
      const pos = this.world.get(e, 'position')
      const haz = this.world.get(e, 'hazard')
      if (pos === undefined || haz === undefined) {
        continue
      }
      hazards.push({ id: e, x: pos.x, y: pos.y, radius: haz.radius, remainingMs: haz.lifeMs })
    }
    hazards.sort((a, b) => a.id - b.id)
    return hazards
  }

  /**
   * Reconstruit l'index spatial des ennemis (positions courantes) avant collision.
   * Indexe TOUS les ennemis avec position — SANS filtre HP. Le scan linéaire projectile↔ennemi
   * qu'il remplace filtrait déjà `hp > 0` lui-même (exact check dans `collisionSystem`) ; le
   * contact ennemi↔joueur qu'il remplace ne filtrait PAS par HP. Filtrer ici casserait ce
   * second cas (un ennemi tué ce pas-ci par `weaponSystem`, avant collision, doit encore
   * pouvoir taper au contact une dernière fois avant `reapDeadEnemies`) : sortie identique
   * garantie par `npm run sim:check` (baseline inchangée).
   */
  private rebuildEnemyGrid(): void {
    this.enemyGrid.clear()
    for (const e of this.world.query('enemy', 'position')) {
      const p = this.world.get(e, 'position')
      if (p !== undefined) {
        this.enemyGrid.insert(e, p.x, p.y)
      }
    }
  }

  private countEnemies(): number {
    let n = 0
    for (const _e of this.world.query('enemy')) {
      void _e
      n += 1
    }
    return n
  }

  /**
   * Collecte les positions des ennemis élites dont les PV sont à 0 ou moins,
   * AVANT leur reap — pour pouvoir faire apparaître des coffres à leur position
   * de mort sans modifier la signature de `reapDeadEnemies`.
   */
  private collectDeadElitePositions(): Vec2[] {
    const positions: Vec2[] = []
    for (const e of this.world.query('enemy', 'health', 'position')) {
      const health = this.world.get(e, 'health')
      const enemy = this.world.get(e, 'enemy')
      const pos = this.world.get(e, 'position')
      if (health !== undefined && health.hp <= 0 && enemy?.isElite === true && pos !== undefined) {
        positions.push({ x: pos.x, y: pos.y })
      }
    }
    return positions
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
