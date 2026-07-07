/**
 * Types fondamentaux du cœur de simulation.
 *
 * Repère de coordonnées (documenté pour le seam de test) :
 *   origine en haut-gauche, +x vers la droite, +y vers le bas.
 */

import type { PlayerStats } from '@content/passives'
import type { Card } from '@core/systems/cards'

export type EntityId = number

export interface Vec2 {
  x: number
  y: number
}

export interface Health {
  hp: number
  maxHp: number
}

/** Données propres à une entité joueur. */
export interface PlayerComp {
  playerId: number
  speed: number // px/seconde
  vigilance: number
  /**
   * Multiplicateur de dégâts des armes. RÉSERVÉ/INUTILISÉ actuellement : le
   * système d'armes (`weaponSystem`/`effectiveWeaponStats`) lit `stats` (agrégé
   * des passifs), pas ce champ. Conservé pour éviter du churn ; pas de logique lue.
   */
  damageMult: number
  /**
   * Multiplicateur de cooldown des armes (<1 = tire plus vite). RÉSERVÉ/INUTILISÉ
   * actuellement, pour la même raison que `damageMult` ci-dessus.
   */
  cooldownMult: number
  /** Rayon d'aimantation des pickups, en px. */
  pickupRadius: number
  /**
   * Id du personnage jouable (`@content/characters`), déterminant l'arme de
   * départ et (plus tard) le skin. Optionnel pour ne pas casser les fixtures
   * de test existantes qui construisent un `PlayerComp` littéral sans ce
   * champ ; absent ⇒ traité comme `DEFAULT_CHARACTER_ID` par `collectPlayers`.
   */
  characterId?: string
}

/** Progression d'un joueur (XP / niveau). Par joueur → prêt-N-joueurs. */
export interface ProgressComp {
  /** XP accumulée vers le prochain niveau. */
  xp: number
  level: number
  /** XP requise pour le prochain niveau. */
  nextThreshold: number
}

/** Comportements d'IA disponibles pour les ennemis. */
export type EnemyBehavior = 'chase' | 'zigzag' | 'circler' | 'sweep' | 'charger'

/** Données propres à une entité ennemie. */
export interface EnemyComp {
  type: string
  speed: number // px/seconde
  isElite: boolean
  isBoss: boolean
  /** Rôle de boss (mini-boss intermédiaire vs boss final). Absent pour les ennemis non-boss. */
  bossRole?: 'mid' | 'final'
  contactDamage: number
  /** XP lâchée à la mort. */
  xpValue: number
  /** Comportement d'IA. Absent sur les fixtures de test anciennes → traité comme 'chase'. */
  behavior?: EnemyBehavior
  /** Phase interne du comportement (utilisée par zigzag, circler…). */
  bPhase?: number
  /** Angle courant du comportement (utilisé par circler…). */
  bAngle?: number
  /** Mode interne du comportement (utilisé par charger…). */
  bMode?: number
  /** Timer interne du comportement (utilisé par charger…). */
  bTimer?: number
}

/** Types de pickups ramassables. */
export type PickupKind = 'xp' | 'heal' | 'magnet' | 'chest' | 'coffre'

/** Un pickup ramassable au sol (gemme d'XP, soin, aimant, coffre). */
export interface PickupComp {
  type: PickupKind
  value: number
  /** Durée de vie restante (ms) avant despawn auto. Seules les gemmes d'XP en ont une. */
  lifeMs?: number
}

/** Un projectile en vol. */
export interface ProjectileComp {
  type: string
  damage: number
  ownerId: number
  /** Durée de vie restante, en ms. */
  lifeMs: number
  radius: number
  /** Nombre d'ennemis SUPPLÉMENTAIRES que le projectile peut encore traverser après un impact (0 = despawn au 1er impact). */
  pierce: number
  /** Nombre de rebonds restants (ricochet). Absent ou 0 = comportement classique. */
  bounces?: number
  /**
   * Temps avant inversion (boomerang), en ms. Décrémenté par `boomerangSystem`.
   * `undefined` = pas un boomerang (champ absent). `<= 0` avec `returning=false` → déclenche l'inversion.
   */
  boomerangOutMs?: number
  /** Vrai une fois l'inversion déclenchée : le projectile revient vers son owner. */
  returning?: boolean
  /** Liste des ids d'ennemis déjà touchés par ce projectile (pour le ricochet, éviter re-hit). */
  hitIds?: number[]
}

/**
 * Une flaque de goudron au sol (kind `hazard`).
 * Inflige `damagePerTick` à tous les ennemis vivants dans son `radius` toutes
 * les `tickMs` ms, jusqu'à ce que `lifeMs` atteigne 0 (despawn automatique).
 */
export interface HazardComp {
  /** Id de l'arme source (ex. `'goudron'`). */
  type: string
  /** PlayerId du joueur qui a posé la flaque. */
  ownerId: number
  /** Dégâts infligés par intervalle. */
  damagePerTick: number
  /** Rayon de la zone (px). */
  radius: number
  /** Durée entre deux ticks de dégâts (ms). */
  tickMs: number
  /** Temps restant avant le prochain tick (ms). 0 ou négatif → tick immédiat. */
  tickLeftMs: number
  /** Durée de vie restante de la flaque (ms). 0 ou négatif → despawn. */
  lifeMs: number
}

/** Progrès de relève d'un joueur à terre (hp<=0), en cours de secours par un coéquipier. */
export interface ReviveComp {
  /** Progression vers la relève, [0,1[ ; >=1 déclenche la relève (retire ce composant). */
  progress: number
}

/** Une lame en orbite autour d'un joueur (arme « scie »). */
export interface OrbiterComp {
  ownerId: number
  weaponId: string
  /** Angle courant autour du propriétaire, en radians. */
  angle: number
  radius: number
  hitRadius: number
}

/** Un ouvrier prisonnier à libérer (clin d'œil « otage » ; cosmétique + petit bonus). */
export interface PrisonerComp {
  /** true une fois le joueur passé à proximité (cage ouverte, remerciement). */
  freed: boolean
}

/**
 * Effet de ralentissement posé sur un ennemi (premier effet de contrôle du jeu).
 * Posé par les armes de kind `cone` (extincteur, canon_mousse).
 * Retiré par `slowSystem` quand `remainingMs` atteint 0.
 */
export interface SlowComp {
  /** Multiplicateur de vélocité appliqué par `enemyAiSystem` (< 1 = ralenti). */
  mult: number
  /** Durée restante du ralentissement, en ms. */
  remainingMs: number
}

/** Une arme équipée, son niveau et son cooldown courant. */
export interface WeaponSlot {
  id: string
  level: number
  cooldownLeftMs: number
}

/** L'arsenal d'une entité (joueur). */
export interface WeaponLoadout {
  slots: WeaponSlot[]
}

/** Un passif possédé et son niveau. */
export interface PassiveSlot {
  id: string
  level: number
}

/** Les passifs possédés par une entité (joueur). */
export interface PassiveLoadout {
  list: PassiveSlot[]
}

/**
 * Registre des composants ECS : nom → forme des données.
 * Ajouter un composant = ajouter une entrée ici (typage propagé partout).
 */
export interface Components {
  position: Vec2
  velocity: Vec2
  health: Health
  player: PlayerComp
  progress: ProgressComp
  enemy: EnemyComp
  projectile: ProjectileComp
  pickup: PickupComp
  orbiter: OrbiterComp
  weapons: WeaponLoadout
  prisoner: PrisonerComp
  passives: PassiveLoadout
  /** Stats dérivées des passifs possédés (recalculées par `recomputePlayerStats`). */
  stats: PlayerStats
  /** Présent uniquement pendant qu'un joueur à terre est en cours de relève. */
  revive: ReviveComp
  /** Flaque de goudron au sol (kind `hazard`) : dégâts par tick. */
  hazard: HazardComp
  /**
   * Ralentissement actif sur un ennemi (posé par les armes de kind `cone`).
   * Absent = pas de slow courant.
   */
  slow: SlowComp
}

export type ComponentKey = keyof Components

// --- Modes & scènes -------------------------------------------------------

export type GameMode = 'solo' | 'coop' | 'coop3' | 'coop4'
export type SceneName = 'title' | 'game' | 'paused' | 'gameover' | 'won'

// --- Entrées joueur (injectées via le seam) -------------------------------

export interface PlayerInput {
  /** Direction de déplacement, composantes dans [-1, 1]. */
  move: Vec2
  attack: boolean
  /** Bouton d'action MAINTENU (relever un coéquipier à terre). Optionnel : lu `?? false`. */
  action?: boolean
}

// --- État de jeu sérialisable (contrat du seam window.__GAME__) -----------

export interface PlayerState {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  maxHp: number
  vigilance: number
  level: number
  xp: number
  nextThreshold: number
  alive: boolean
  /** À terre (hp<=0) mais partie en cours (pas de game over) — en attente de relève. */
  downed: boolean
  /** Progrès de relève courant [0,1] (0 si pas à terre ou pas en cours de relève). */
  reviveProgress: number
  /** Id du personnage jouable (`@content/characters`). Additif. */
  characterId: string
  weapons: string[]
  weaponLevels: number[]
  passives: { id: string; level: number }[]
}

export interface EnemyState {
  id: number
  type: string
  x: number
  y: number
  hp: number
  maxHp: number
  isElite: boolean
  isBoss: boolean
  /** Rôle de boss (mini-boss intermédiaire vs boss final). Absent pour les ennemis non-boss. */
  bossRole?: 'mid' | 'final'
}

export interface ProjectileState {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  type: string
}

export interface PickupState {
  id: number
  x: number
  y: number
  type: PickupKind
  value: number
}

export interface PrisonerState {
  id: number
  x: number
  y: number
  freed: boolean
}

/** Flaque de goudron exposée dans le view-state (pour le rendu — Task 7/8). */
export interface HazardState {
  id: number
  x: number
  y: number
  radius: number
  remainingMs: number
}

export interface PendingLevelUp {
  playerId: number
  choices: Card[]
}

export interface GameState {
  scene: SceneName
  seed: number
  /** Phase/stage courant (id, ex. 'terrain_vierge'). Pilote le thème + les assets. */
  stageId: string
  elapsedMs: number
  wave: number
  score: number
  /** Repère documenté pour décider sans regarder l'écran. */
  coordSystem: string
  players: PlayerState[]
  enemies: EnemyState[]
  projectiles: ProjectileState[]
  pickups: PickupState[]
  /** Ouvriers prisonniers présents (cage + sosie à libérer). */
  prisoners: PrisonerState[]
  /** Progression des sauvetages (mini-carte + HUD). */
  rescue: { total: number; rescued: number }
  /** Flaques de goudron actives (pour le rendu — Task 7/8). */
  hazards: HazardState[]
  pendingLevelUp: PendingLevelUp | null
}
