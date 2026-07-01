/**
 * Types fondamentaux du cœur de simulation.
 *
 * Repère de coordonnées (documenté pour le seam de test) :
 *   origine en haut-gauche, +x vers la droite, +y vers le bas.
 */

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
  /** Multiplicateur de dégâts des armes (modifié par les upgrades). */
  damageMult: number
  /** Multiplicateur de cooldown des armes (<1 = tire plus vite). */
  cooldownMult: number
  /** Rayon d'aimantation des pickups, en px. */
  pickupRadius: number
}

/** Progression d'un joueur (XP / niveau). Par joueur → prêt-N-joueurs. */
export interface ProgressComp {
  /** XP accumulée vers le prochain niveau. */
  xp: number
  level: number
  /** XP requise pour le prochain niveau. */
  nextThreshold: number
}

/** Données propres à une entité ennemie. */
export interface EnemyComp {
  type: string
  speed: number // px/seconde
  isElite: boolean
  isBoss: boolean
  contactDamage: number
  /** XP lâchée à la mort. */
  xpValue: number
}

/** Types de pickups ramassables. */
export type PickupKind = 'xp' | 'heal' | 'magnet' | 'chest'

/** Un pickup ramassable au sol (gemme d'XP, soin, aimant, coffre). */
export interface PickupComp {
  type: PickupKind
  value: number
}

/** Un projectile en vol. */
export interface ProjectileComp {
  type: string
  damage: number
  ownerId: number
  /** Durée de vie restante, en ms. */
  lifeMs: number
  radius: number
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

/** Une arme équipée et son cooldown courant. */
export interface WeaponSlot {
  id: string
  cooldownLeftMs: number
}

/** L'arsenal d'une entité (joueur). */
export interface WeaponLoadout {
  slots: WeaponSlot[]
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
}

export type ComponentKey = keyof Components

// --- Modes & scènes -------------------------------------------------------

export type GameMode = 'solo' | 'coop' | 'coop3' | 'coop4'
export type SceneName = 'title' | 'game' | 'paused' | 'gameover'

// --- Entrées joueur (injectées via le seam) -------------------------------

export interface PlayerInput {
  /** Direction de déplacement, composantes dans [-1, 1]. */
  move: Vec2
  attack: boolean
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
  weapons: string[]
}

export interface EnemyState {
  id: number
  type: string
  x: number
  y: number
  hp: number
  isElite: boolean
  isBoss: boolean
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

/** Une carte d'upgrade proposée (résolue depuis le contenu pour l'affichage). */
export interface UpgradeChoice {
  id: string
  name: string
  description: string
}

export interface PendingLevelUp {
  playerId: number
  choices: UpgradeChoice[]
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
  pendingLevelUp: PendingLevelUp | null
}
