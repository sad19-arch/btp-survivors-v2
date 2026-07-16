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
  ChestOpenedEvent,
  DestructibleBrokenEvent,
  type AuraPulse
} from './events'
import { STEP_MS } from './clock'
import { movementSystem } from './systems/movement'
import { tetherSystem } from './systems/tether'
import { worldBoundsSystem } from './systems/bounds'
import { enemyAiSystem } from './systems/enemyAi'
import { bossSystem } from './systems/bossSystem'
import { slowSystem } from './systems/slow'
import { spawnBoss, spawnGroup, spawnSummons, spawnWave } from './systems/spawn'
import { createWaveDirectorState, stepWaveDirector, type WaveDirectorState } from './systems/waveDirector'
import { weaponSystem } from './systems/weapon'
import { collisionSystem } from './systems/collision'
import { knockbackSystem } from './systems/knockback'
import { reapDeadEnemies, type ReapResult } from './systems/reap'
import { reapDestructibles, destructibleContactSystem, type BrokenDestructible } from './systems/destructible'
import { destructibleDef, type DestructibleSpawn } from '@content/destructibles'
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
import { tickChestBearer, dropChestBearerLoot } from './systems/chestDirector'
import { resolveObstacleCollisions } from './systems/obstacleCollision'
import { buildSiteLayout, type Obstacle, type SurfaceSlowZone } from './siteLayout'
import { surfaceSlowMultiplierAt } from './systems/surfaceSlow'
import { buildFlowField, CELL_FLOW, HALF_FLOW, type FlowField } from './systems/flowField'
import { bossLevelHpMult, CHEST, coopHpFactor, FINAL_BOSS, MID_BOSS_WAVES, MODE_PLAYER_COUNT, PLAYER_BASE, PROGRESSION, RESCUE, SPAWN, TETHER, WORLD } from '@content/config'
import { SPAWN_RAMP, difficultyScaleAt } from '@content/spawnRamp'
import { eventPoolForPhase } from '@content/waveEvents'
import { ConstructionPhaseId, PHASES } from '@content/phases'
import { ENEMIES, MINI_BOSS_ID } from '@content/enemies'
import { characterDef, DEFAULT_CHARACTER_ID } from '@content/characters'
import type { ConstructionPhase } from '@content/phases'
import type {
  EnemyState,
  EntityId,
  GameMode,
  ChestOpenOutcome,
  DestructibleState,
  GameState,
  HazardState,
  PendingFormation,
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
  /** RNG dédié aux destructibles (contenu en pièces) — séparé, ne décale pas la sim. */
  private destructibleRng: Rng
  /** Pièces d'or collectées durant ce run (monnaie méta, persistée côté app). */
  private coinsThisRun = 0
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
  /** Tally cumulatif de kills par joueur (attribution par dernier frappeur). */
  private killsByPlayer = new Map<number, number>()
  /**
   * Nombre de paliers de mid-boss déjà spawné (rôle `mid`). Chaque valeur dans
   * `MID_BOSS_WAVES.atMs` est consommée exactement une fois (palier par index).
   * 0 = aucun spawné, 1 = 5:00 spawné, 2 = 10:00 spawné, 3 = 15:00 spawné.
   */
  private midBossWaveIndex = 0
  /** Vrai une fois le boss FINAL (rôle `final`) RÉELLEMENT apparu (garde-fou anti faux-positif de victoire). */
  private finalBossSpawned = false
  private choiceQueue: PendingLevelUp[] = []
  /** PV totaux des joueurs au pas précédent → détecte les dégâts (SFX, observation pure). */
  private prevHpTotal = 0
  /** Nombre de prisonniers libérés depuis le début de la run (progression des sauvetages). */
  private rescuedTotal = 0
  /**
   * Flag transitoire (one-shot) : id de l'arme évoluée, posé dans
   * `handleChestPickups` ; remis à `null` par `getState()` après lecture
   * (une seule frame). Exposé dans `GameState.justEvolved` pour que
   * `overlay.sync` lance le jackpot sans event ad hoc.
   */
  private _justEvolved: string | null = null
  /**
   * Flag transitoire (one-shot) : issue de l'ouverture d'un coffre CE pas (les 3
   * branches), posé dans `handleChestPickups` ; réinitialisé en début d'`advanceTime`
   * (comme `_justEvolved`). Exposé dans `GameState.chestOpened` pour que
   * `overlay.sync` lance la machine à sous. Purement cosmétique.
   */
  private _chestOpened: ChestOpenOutcome | null = null
  private readonly inputs = new Map<number, PlayerInput>()
  private readonly playerEntities = new Map<number, EntityId>()
  /** Index spatial des ennemis (positions courantes, post-mouvement), reconstruit chaque pas
   *  juste avant `collisionSystem`. Indexe TOUS les ennemis avec position (pas de filtre HP :
   *  le contact ennemi→joueur d'origine n'a jamais filtré par HP — un ennemi tué ce pas-ci par
   *  `weaponSystem` doit encore pouvoir taper au contact avant d'être récolté). Ne fournit que
   *  des candidats — le test de distance + toute logique de dégâts restent exacts et inchangés
   *  (cf. `collisionSystem`), donc n'affecte pas les dégâts observables. */
  private readonly enemyGrid = new SpatialGrid(64)
  /** Obstacles statiques du site (calculés UNE fois au reset, vide pour terrain_vierge). */
  private obstacles: readonly Obstacle[] = []
  /** Beton frais et autres surfaces sans degats qui affectent uniquement les joueurs. */
  private slowZones: readonly SurfaceSlowZone[] = []
  /** Champ de flux courant (null si aucun obstacle ou pas encore construit). */
  private flowField: FlowField | null = null
  /** Colonne de la cellule du joueur lors du dernier build du champ de flux. */
  private lastFlowCol = -1
  /** Ligne de la cellule du joueur lors du dernier build du champ de flux. */
  private lastFlowRow = -1

  constructor(opts: SimOptions) {
    this.mode = opts.mode
    this.currentSeed = opts.seed
    this.world = new World()
    this.rng = new Rng(opts.seed)
    this.lootRng = new Rng((opts.seed ^ 0x1007) | 0)
    this.prisonerRng = new Rng((opts.seed ^ 0x2b1d) | 0)
    this.chestRng = new Rng((opts.seed ^ 0x3c7a) | 0)
    this.destructibleRng = new Rng((opts.seed ^ 0x6e2f) | 0)
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
   *
   * Réinitialise `_justEvolved` en entrée (one-shot pour cet appel) : si une
   * évolution survient dans l'un des pas, le flag est positionné et conservé
   * jusqu'au prochain `advanceTime`. Cela garantit que `getState()` retourne
   * `justEvolved !== null` jusqu'à la prochaine avance, quelle que soit la durée
   * des pas ou leur nombre dans cet appel.
   */
  advanceTime(ms: number): void {
    if (this.isFrozen()) {
      return
    }
    // Réinitialise le flag transitoire : valide SEULEMENT pour cet appel.
    // Si une évolution survient dans n'importe quel pas, le flag est posé et
    // NE SERA PAS remis à null avant le prochain `advanceTime`.
    this._justEvolved = null
    this._chestOpened = null
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
    return this.scene !== 'game' || this.choiceQueue.length > 0
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
    const pending = this.choiceQueue[0]
    if (pending === undefined) {
      return
    }
    const choice = pending.choices[index]
    if (choice !== undefined) {
      const e = this.playerEntities.get(pending.playerId)
      if (e !== undefined) {
        this.applyCard(e, choice)
      }
    }
    this.choiceQueue.shift()
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
      destructibles: this.collectDestructibles(),
      rescue: { total: RESCUE.count, rescued: this.rescuedTotal },
      hazards: this.collectHazards(),
      pendingLevelUp: this.choiceQueue[0] ?? null,
      pendingFormations: this.collectPendingFormations(),
      // Flag transitoire : non null pendant tout le pas où une évolution vient d'être
      // déclenchée ; remis à null par `step()` au pas SUIVANT. Toutes les lectures de
      // `getState()` dans la même fenêtre de pas voient la même valeur (pas de reset ici).
      justEvolved: this._justEvolved,
      chestOpened: this._chestOpened,
      coins: this.coinsThisRun
    }
  }

  /** Expose les formations annoncées non encore spawnées (télégraphe, Task 10). */
  private collectPendingFormations(): readonly PendingFormation[] {
    const u = this.waveDir.upcoming
    if (u === null) {
      return []
    }
    const triggersInMs = Math.max(0, u.triggersAtMs - this.elapsedMs)
    return [{ kind: u.kind, angle: u.angle, radius: u.radius, triggersInMs }]
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
  debugAddXp(amount: number, playerId = 1): void {
    const e = this.playerEntities.get(playerId)
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
   * ou `final`) au centroïde des joueurs, sans attendre le seuil temporel.
   * Pose le flag `*BossSpawned` correspondant, exactement comme le spawn normal,
   * pour que `updateWin`/le coffre en mi-mort se comportent de façon identique.
   * Réservé aux tests et au seam de debug — jamais utilisé en jeu normal.
   */
  debugSpawnBoss(role: 'mid' | 'final'): void {
    const def = ENEMIES[MINI_BOSS_ID]
    if (def === undefined) {
      return
    }
    const radius = role === 'mid' ? MID_BOSS_WAVES.spawnRadius : FINAL_BOSS.spawnRadius
    const hpMult = role === 'mid' ? (MID_BOSS_WAVES.hpMults[0] ?? 1.0) : FINAL_BOSS.hpMult
    const bossScale = { hp: coopHpFactor(this.playerCount()) * hpMult * bossLevelHpMult(this.maxPlayerLevel()), contactDamage: 1, speed: 1 }
    spawnBoss(this.world, def, this.playersCentroid(), this.rng.float(0, Math.PI * 2), radius, role, bossScale)
    this.events.dispatchEvent(new BossSpawnedEvent(role))
    if (role === 'mid') {
      // Pour le debug, marque tous les paliers mid comme spawné (évite un re-spawn automatique).
      this.midBossWaveIndex = MID_BOSS_WAVES.atMs.length
    } else {
      this.finalBossSpawned = true
    }
  }

  /**
   * [Debug/seam] Fait apparaître `n` ennemis de la phase courante autour du
   * centroïde des joueurs, via le spawner de vague normal (RNG seedé →
   * déterministe). Ne clampe PAS sur `SPAWN.maxActive` : c'est un helper de
   * stress dont le but est justement de dépasser le plafond normal.
   *
   * `radius` optionnel (test-only) : quand fourni, spawne les ennemis sur un
   * anneau de ce rayon AUTOUR du joueur (via `spawnSummons`, « à l'écran »)
   * plutôt qu'à l'anneau de spawn lointain hors-écran de `spawnWave`. Utile
   * aux e2e qui veulent des ennemis immédiatement à portée d'arme (feedback,
   * AOE). Le chemin par défaut (sans `radius`) est INCHANGÉ — les bots de la
   * sim n'appellent jamais ce helper → `sim:check` diff 0.
   *
   * Réservé aux tests et au seam de debug (`window.__GAME__`) — jamais en jeu normal.
   */
  debugSpawnEnemies(n: number, radius?: number): void {
    const scale = difficultyScaleAt(this.elapsedMs)
    if (radius !== undefined) {
      spawnSummons(this.world, this.rng, this.phase, this.playersCentroid(), n, radius, scale)
    } else {
      spawnWave(this.world, this.rng, this.phase, this.playersCentroid(), n, scale)
    }
  }

  /**
   * [Debug/seam] Met les PV de tous les joueurs à 0.
   * Au prochain pas de simulation, le système de mort détecte les PV ≤ 0 et
   * bascule la scène en `'gameover'`. Helper pur : aucun random, aucun effet
   * secondaire hors du composant `health`. Réservé aux tests e2e et au seam
   * de debug — jamais appelé en jeu normal.
   */
  /**
   * Met des joueurs à terre (PV = 0). Sans argument : TOUS (→ game-over, usage
   * historique). Avec `playerId` : ce joueur SEUL — indispensable pour tester la
   * relève co-op, qui exige un coéquipier encore vivant.
   */
  debugKillPlayer(playerId?: number): void {
    for (const [id, e] of this.playerEntities) {
      if (playerId !== undefined && id !== playerId) {
        continue
      }
      const health = this.world.get(e, 'health')
      if (health !== undefined) {
        health.hp = 0
      }
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
    this.chestRng = new Rng((seed ^ 0x3c7a) | 0)
    this.destructibleRng = new Rng((seed ^ 0x6e2f) | 0)
    this.coinsThisRun = 0
    this._waveRng = new Rng((seed ^ 0x5a1e) | 0)
    this.waveDir = createWaveDirectorState()
    this.phase = resolvePhase(this.phaseId)
    this.scene = 'game'
    this.elapsedMs = 0
    this.remainderMs = 0
    this.chestAccMs = 0
    this.score = 0
    this.killsByPlayer = new Map<number, number>()
    this.midBossWaveIndex = 0
    this.finalBossSpawned = false
    this.choiceQueue = []
    this.inputs.clear()
    this.playerEntities.clear()
    this.rescuedTotal = 0
    // Calcul du layout UNE fois — RNG interne isolé (seed ^ 0x51e0), n'affecte PAS le
    // flux RNG de la sim. Pour terrain_vierge : obstacles = [] → no-op garanti.
    const site = buildSiteLayout(seed, WORLD.width, WORLD.height, this.phaseId)
    this.obstacles = site.obstacles
    this.slowZones = site.slowZones ?? []
    // Réinitialise le champ de flux (sera reconstruit au premier pas si obstacles > 0).
    this.flowField = null
    this.lastFlowCol = -1
    this.lastFlowRow = -1
    this.spawnPlayers()
    this.spawnPrisoners()
    this.spawnDestructibles(site.destructibles ?? [])
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

  /**
   * Place les objets destructibles du layout (éditeur ou scatter). Chaque objet
   * porte `health` + `destructible {typeId, coinDrop}`. `coinDrop` est PRÉ-TIRÉ
   * ici (RNG dédié `destructibleRng`) → la casse reste déterministe et le reap
   * lâche simplement ce nombre de pièces. Pas de `velocity` (immobile), pas de
   * `enemy` (non-bloquant, non-menaçant) : ciblé par les armes via la grille.
   */
  private spawnDestructibles(spawns: readonly DestructibleSpawn[]): void {
    for (const s of spawns) {
      const def = destructibleDef(s.typeId)
      if (def === undefined) {
        continue
      }
      let coinDrop = 0
      if (this.destructibleRng.chance(def.coinChance)) {
        const span = Math.max(0, def.coinMax - def.coinMin)
        coinDrop = def.coinMin + Math.floor(this.destructibleRng.float(0, span + 1))
      }
      const e = this.world.spawn()
      this.world.add(e, 'position', { x: s.x, y: s.y })
      this.world.add(e, 'health', { hp: def.hp, maxHp: def.hp })
      this.world.add(e, 'destructible', { typeId: def.id, coinDrop })
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
    // Note : `_justEvolved` n'est PAS remis à null ici. Il est réinitialisé en
    // début d'`advanceTime` (avant les pas) pour durer exactement un appel
    // `advanceTime` complet, même si plusieurs pas sont exécutés en séquence.
    const pulses: AuraPulse[] = []
    const freed: Vec2[] = []
    const fired: string[] = []
    const collected: PickupKind[] = []
    const chestCollectors: number[] = []
    const coinsCollected: number[] = []
    const brokenDestructibles: BrokenDestructible[] = []
    this.runSpawns(dtMs)
    // Directeur de porteurs de coffre (RNG isolé, déterministe) : invoque un élite
    // « convoyeur » sur cadence — sa mort lâche le coffre. Plus de coffre au hasard.
    this.chestAccMs += dtMs
    this.chestAccMs = tickChestBearer(
      this.world,
      this.chestRng,
      this.chestAccMs,
      this.playersCentroid(),
      difficultyScaleAt(this.elapsedMs)
    )
    this.applyPlayerInputs()
    // Snapshot pré-mouvement : les armes voient les ennemis là où ils sont AVANT
    // `movementSystem` (le scan linéaire qu'elles remplaçaient itérait le monde à cet
    // instant précis). Reconstruit une seconde fois plus bas (post-mouvement) pour
    // `collisionSystem` — deux instantanés distincts, chacun exact pour son système.
    this.rebuildEnemyGrid()
    weaponSystem(this.world, dtMs, pulses, fired, this.rng, this.enemyGrid)
    slowSystem(this.world, dtMs)
    // Champ de flux : construit UNIQUEMENT si obstacles présents.
    // Gate déterminisme : terrain_vierge (obstacles=[]) → flowField reste null
    // → enemyAiSystem reçoit null → chemin de code actuel INCHANGÉ → sim:check diff 0.
    if (this.obstacles.length > 0) {
      const leaderPos = this.getLeaderPosition()
      if (leaderPos !== null) {
        // Cellule absolue du joueur dans la grille mondiale (throttle = rebuild uniquement
        // quand le joueur franchit une frontière de cellule CELL_FLOW).
        const col = Math.floor(leaderPos.x / CELL_FLOW)
        const row = Math.floor(leaderPos.y / CELL_FLOW)
        if (this.flowField === null || col !== this.lastFlowCol || row !== this.lastFlowRow) {
          this.flowField = buildFlowField(leaderPos.x, leaderPos.y, this.obstacles, CELL_FLOW, HALF_FLOW)
          this.lastFlowCol = col
          this.lastFlowRow = row
        }
      }
    }
    // Mini-événement boss (enrage + invocation d'add) AVANT le steering : l'enrage
    // doit être à jour quand `steerBoss` calcule la vitesse. Add mis à l'échelle
    // comme une vague normale (difficulté temporelle × co-op).
    const bossScale = difficultyScaleAt(this.elapsedMs)
    bossSystem(this.world, this.rng, this.phase, { ...bossScale, hp: bossScale.hp * coopHpFactor(this.playerCount()) })
    enemyAiSystem(this.world, this.elapsedMs, dtMs, this.flowField)
    tetherSystem(this.world, MODE_PLAYER_COUNT[this.mode] ?? 1, TETHER.maxRadius)
    movementSystem(this.world, dtMs)
    worldBoundsSystem(this.world, WORLD)
    // Résolution des obstacles statiques : repousse joueurs+ennemis hors du décor.
    // No-op pour terrain_vierge (obstacles = []) → sim:check diff 0 garanti.
    resolveObstacleCollisions(this.world, this.obstacles)
    boomerangSystem(this.world, dtMs)
    this.rebuildEnemyGrid()
    collisionSystem(this.world, dtMs, this.enemyGrid)
    knockbackSystem(this.world, dtMs)
    // Le recul ne doit jamais pousser une cible à travers une structure.
    resolveObstacleCollisions(this.world, this.obstacles)
    // Casse au CONTACT du joueur (complète la casse par les armes via la grille).
    destructibleContactSystem(this.world)
    const deadBearerPositions = this.collectDeadChestBearers()
    const reap: ReapResult = reapDeadEnemies(this.world, this.lootRng)
    // Coffre GARANTI sur mort d'un porteur (convoyeur). Positions collectées AVANT
    // le reap (qui supprime les entités). Pas de RNG : récompense méritée.
    for (const pos of deadBearerPositions) {
      dropChestBearerLoot(this.world, pos)
    }
    // Destructibles cassés (armes OU contact) → lâchent leurs pièces, collectés
    // pour le VFX/débris. Ni score ni kill (ce ne sont pas des ennemis).
    reapDestructibles(this.world, brokenDestructibles)
    this.score += reap.total
    // Cumul des kills par joueur (attribution par dernier frappeur).
    for (const [pid, n] of reap.killsByPlayer) {
      this.killsByPlayer.set(pid, (this.killsByPlayer.get(pid) ?? 0) + n)
    }
    pickupSystem(this.world, dtMs, collected, chestCollectors, coinsCollected)
    for (const v of coinsCollected) {
      this.coinsThisRun += v
    }
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
    if (reap.total > 0) {
      this.events.dispatchEvent(new EnemyKilledEvent(reap.total))
    }
    for (const k of fired) {
      this.events.dispatchEvent(new WeaponFiredEvent(k))
    }
    for (const c of collected) {
      this.events.dispatchEvent(new PickupCollectedEvent(c))
    }
    for (const p of pulses) {
      this.events.dispatchEvent(new AuraPulseEvent(p.x, p.y, p.radius, p.kind, p.dirX, p.dirY, p.weaponId))
    }
    for (const f of freed) {
      this.events.dispatchEvent(new PrisonerFreedEvent(f.x, f.y))
    }
    for (const b of brokenDestructibles) {
      this.events.dispatchEvent(new DestructibleBrokenEvent(b.x, b.y, b.typeId))
    }
  }

  /**
   * Traite les coffres d'évolution ramassés ce pas — garantit TOUJOURS un effet :
   *
   * 1. Évolution : `tryEvolve` ≠ null → `EvolvedEvent` + pose `_justEvolved`
   *    (jackpot + voix, 1 frame).
   * 2. Choix de cartes : construit l'inventaire → `rollCards` → si cartes dispo
   *    → push dans `choiceQueue` (gel + écran Upgrade existants).
   * 3. Secours (tout maxé) : soin `CHEST.fallbackHealPct * maxHp`, borné à maxHp.
   *
   * Boucle intentionnelle : chaque coffre réévalue l'inventaire APRÈS la mutation
   * du coffre précédent (une évolution consommée ce tour ne doit pas retenter
   * d'évoluer la même arme deux fois dans la même frame). En solo, un seul
   * ramasseur possible (joueur 1) → comportement inchangé.
   */
  private handleChestPickups(collectors: number[]): void {
    for (const playerId of collectors) {
      const playerEntity = this.playerEntities.get(playerId)
      if (playerEntity === undefined) {
        continue
      }

      // Branche 1 : évolution disponible.
      const evolvedId = tryEvolve(this.world, playerEntity)
      if (evolvedId !== null) {
        this.events.dispatchEvent(new EvolvedEvent(evolvedId, playerId))
        this._justEvolved = evolvedId
        // Machine à sous « super » (gros moment) : révèle l'arme évoluée.
        this._chestOpened = { kind: 'evolution', weaponId: evolvedId, isSuper: true }
        this.events.dispatchEvent(new ChestOpenedEvent('evolution', playerId, true))
        continue
      }

      // Branche 2 : pas d'évolution — proposer des cartes si l'inventaire n'est pas maxé.
      const loadout = this.world.get(playerEntity, 'weapons')
      const passives = this.world.get(playerEntity, 'passives')
      const inv: Inventory = {
        weapons: loadout?.slots.map((s) => ({ id: s.id, level: s.level })) ?? [],
        passives: passives?.list.map((p) => ({ id: p.id, level: p.level })) ?? []
      }
      // rollCards vérifie lui-même l'éligibilité (via eligibleCards) puis échantillonne :
      // s'il renvoie ≥ 1 carte, l'inventaire n'est pas maxé → on propose un choix.
      // (Pas de double-vérification eligibleCards : évite une fenêtre logique non testée.)
      const choices = rollCards(this.rng, inv, PROGRESSION.choices)
      if (choices.length > 0) {
        this.choiceQueue.push({ playerId, choices })
        // Machine à sous : la roulette tourne puis révèle l'écran de choix (temps gelé).
        this._chestOpened = { kind: 'cards', isSuper: false }
        this.events.dispatchEvent(new ChestOpenedEvent('cards', playerId, false))
        continue
      }

      // Branche 3 : secours déterministe (tout maxé, rien à tirer).
      const health = this.world.get(playerEntity, 'health')
      if (health !== undefined) {
        health.hp = Math.min(health.maxHp, health.hp + health.maxHp * CHEST.fallbackHealPct)
      }
      // Machine à sous : révèle une icône de soin.
      this._chestOpened = { kind: 'heal', isSuper: false }
      this.events.dispatchEvent(new ChestOpenedEvent('heal', playerId, false))
    }
  }

  /**
   * Vérifie si un joueur a atteint un palier d'XP. Le cas échéant, pousse un
   * élément dans la file de choix (1 palier à la fois → gel jusqu'au choix).
   */
  private checkLevelUp(): void {
    if (this.choiceQueue.length > 0) {
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
          this.choiceQueue.push({ playerId, choices })
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

  /**
   * Niveau du joueur le plus haut (co-op : le max de la table). Sert à faire
   * monter les PV des boss avec la puissance du joueur (`bossLevelHpMult`), pour
   * que le boss reste une menace même quand le joueur a beaucoup d'upgrades.
   * Défaut 1 si aucun joueur/progress (jamais négatif, jamais < 1).
   */
  private maxPlayerLevel(): number {
    let max = 1
    for (const e of this.playerEntities.values()) {
      const progress = this.world.get(e, 'progress')
      if (progress !== undefined && progress.level > max) {
        max = progress.level
      }
    }
    return max
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
      events: eventPoolForPhase(this.phaseId),
      ringRadius: SPAWN.ringRadius,
      rng: this._waveRng
    })
    // Clamp au budget restant : une vague dense (jusqu'à 17) ne doit PAS pousser
    // le total au-delà de `maxActive` (l'invariant sanity du harness le vérifie).
    const budget = SPAWN.maxActive - this.countEnemies()
    if (placements.length > 0 && budget > 0) {
      const clamped = placements.length > budget ? placements.slice(0, budget) : placements
      spawnGroup(this.world, this._waveRng, this.phase, center, clamped, coopScale)
    }
  }

  /**
   * Invoque le prochain palier de mid-boss périodique si son seuil temporel est
   * atteint. Paliers : 5:00 / 10:00 / 15:00. Rôle `mid` : NE déclenche PAS la
   * victoire (sa mort lâche un coffre d'évolution, cf. reap.ts). Déterministe :
   * angle via `this.rng`, seuils temporels fixes dans `MID_BOSS_WAVES.atMs`.
   */
  private maybeSpawnMidBoss(): void {
    const nextIndex = this.midBossWaveIndex
    const nextAtMs = MID_BOSS_WAVES.atMs[nextIndex]
    if (nextAtMs === undefined || this.elapsedMs < nextAtMs) {
      return
    }
    const def = ENEMIES[MINI_BOSS_ID]
    if (def !== undefined) {
      const hpMult = MID_BOSS_WAVES.hpMults[nextIndex] ?? 1.0
      const bossScale = { hp: coopHpFactor(this.playerCount()) * hpMult * bossLevelHpMult(this.maxPlayerLevel()), contactDamage: 1, speed: 1 }
      spawnBoss(this.world, def, this.playersCentroid(), this.rng.float(0, Math.PI * 2), MID_BOSS_WAVES.spawnRadius, 'mid', bossScale)
      this.events.dispatchEvent(new BossSpawnedEvent('mid'))
    }
    this.midBossWaveIndex = nextIndex + 1
  }

  /** Invoque le boss FINAL une seule fois, au seuil temporel (~10:30). Sa mort = victoire. */
  private maybeSpawnFinalBoss(): void {
    if (this.finalBossSpawned || this.elapsedMs < FINAL_BOSS.atMs) {
      return
    }
    const def = ENEMIES[MINI_BOSS_ID]
    if (def !== undefined) {
      const bossScale = { hp: coopHpFactor(this.playerCount()) * FINAL_BOSS.hpMult * bossLevelHpMult(this.maxPlayerLevel()), contactDamage: 1, speed: 1 }
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
      const pos = this.world.get(e, 'position')
      const surfaceMult = pos === undefined ? 1 : surfaceSlowMultiplierAt(pos.x, pos.y, this.slowZones)
      vel.x = dir.x * player.speed * surfaceMult
      vel.y = dir.y * player.speed * surfaceMult
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
        passives: passives === undefined ? [] : passives.list.map((p) => ({ id: p.id, level: p.level })),
        kills: this.killsByPlayer.get(id) ?? 0
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
        ...(enemy.chestBearer === true ? { chestBearer: true } : {}),
        ...(enemy.bossRole !== undefined ? { bossRole: enemy.bossRole } : {}),
        ...(enemy.behavior === 'boss' && (enemy.bMode === 1 || enemy.bMode === 2)
          ? { bossCharge: enemy.bMode === 1 ? ('telegraph' as const) : ('charge' as const) }
          : {})
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

  private collectDestructibles(): DestructibleState[] {
    const out: DestructibleState[] = []
    for (const e of this.world.query('destructible', 'position', 'health')) {
      const pos = this.world.get(e, 'position')
      const comp = this.world.get(e, 'destructible')
      const health = this.world.get(e, 'health')
      if (pos === undefined || comp === undefined || health === undefined) {
        continue
      }
      out.push({ id: e, x: pos.x, y: pos.y, typeId: comp.typeId, hp: health.hp, maxHp: health.maxHp })
    }
    return out
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
    // Destructibles insérés dans la MÊME grille → ciblés par les armes (AoE, cône,
    // projectiles) qui infligent des dégâts à toute entité avec `health`. Les sites
    // de dégât gardent déjà `enemy.lastHitBy` (posé seulement si `enemy` présent).
    // AUCUN destructible ⇒ boucle vide ⇒ grille identique ⇒ sim:check diff 0.
    for (const e of this.world.query('destructible', 'position')) {
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
   * Collecte les positions des porteurs de coffre (`chestBearer`) morts, AVANT
   * leur reap — pour faire apparaître le coffre garanti à leur position de mort
   * sans modifier la signature de `reapDeadEnemies`.
   */
  private collectDeadChestBearers(): Vec2[] {
    const positions: Vec2[] = []
    for (const e of this.world.query('enemy', 'health', 'position')) {
      const health = this.world.get(e, 'health')
      const enemy = this.world.get(e, 'enemy')
      const pos = this.world.get(e, 'position')
      if (health !== undefined && health.hp <= 0 && enemy?.chestBearer === true && pos !== undefined) {
        positions.push({ x: pos.x, y: pos.y })
      }
    }
    return positions
  }

  /**
   * Retourne la position du joueur leader (playerId=1, ou premier vivant).
   * Utilisé pour centrer la fenêtre du champ de flux.
   * Retourne null si aucun joueur vivant.
   */
  private getLeaderPosition(): Vec2 | null {
    // Tente d'abord le joueur 1
    const e1 = this.playerEntities.get(1)
    if (e1 !== undefined) {
      const pos = this.world.get(e1, 'position')
      const health = this.world.get(e1, 'health')
      if (pos !== undefined && health !== undefined && health.hp > 0) {
        return { x: pos.x, y: pos.y }
      }
    }
    // Fallback : premier joueur vivant
    for (const [, e] of this.playerEntities) {
      const pos = this.world.get(e, 'position')
      const health = this.world.get(e, 'health')
      if (pos !== undefined && health !== undefined && health.hp > 0) {
        return { x: pos.x, y: pos.y }
      }
    }
    return null
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
