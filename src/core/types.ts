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
}

export type ComponentKey = keyof Components

// --- Modes & scènes -------------------------------------------------------

export type GameMode = 'solo' | 'coop' | 'coop3' | 'coop4'
export type SceneName = 'title' | 'game' | 'gameover'

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
  x: number
  y: number
  vx: number
  vy: number
  type: string
}

export interface PickupState {
  x: number
  y: number
  type: string
}

export interface PendingLevelUp {
  choices: string[]
}

export interface GameState {
  scene: SceneName
  seed: number
  elapsedMs: number
  wave: number
  score: number
  /** Repère documenté pour décider sans regarder l'écran. */
  coordSystem: string
  players: PlayerState[]
  enemies: EnemyState[]
  projectiles: ProjectileState[]
  pickups: PickupState[]
  pendingLevelUp: PendingLevelUp | null
}
