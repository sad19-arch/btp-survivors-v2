import type { GameMode } from '@core/types'

/**
 * Données de configuration du jeu (data-driven, pures).
 *
 * Toute valeur d'équilibrage vit ici, pas en dur dans les systèmes.
 */

/** Dimensions du monde, en pixels. */
export const WORLD = {
  width: 1600,
  height: 1200
} as const

/** Stats de base d'un joueur. */
export const PLAYER_BASE = {
  hp: 240,
  speed: 200, // px/seconde
  vigilance: 100,
  /** Rayon d'aimantation des gemmes d'XP, en px. */
  pickupRadius: 90
} as const

/** Progression XP → niveaux (porté de l'ancien jeu). */
export const PROGRESSION = {
  /** XP requise pour le 1er niveau. */
  firstThreshold: 25,
  /** Facteur multiplicatif du seuil à chaque niveau. */
  growth: 1.15,
  /** Nombre de cartes proposées à chaque montée de niveau. */
  choices: 3
} as const

/** Paramètres des pickups. */
export const PICKUP = {
  /** Vitesse d'aimantation vers le joueur, en px/seconde. */
  magnetSpeed: 420,
  /** Rayon de collecte (en plus du rayon joueur), en px. */
  collectRadius: 10
} as const

/** Nombre de joueurs selon le mode. */
export const MODE_PLAYER_COUNT: Record<GameMode, number> = {
  solo: 1,
  coop: 2,
  coop3: 3,
  coop4: 4
}

/** Rayons de collision (px), par catégorie d'entité. */
export const HITBOX = {
  player: 16,
  enemy: 12,
  projectile: 6
} as const

/** Armes de départ du joueur (slice 1). */
export const STARTING_WEAPONS: readonly string[] = ['cloueur']

/**
 * Paramètres de spawn (baseline MVP).
 *
 * Courbe PRD : 0-1 min = apprentissage, peu d'ennemis. La montée en difficulté
 * temporelle (et le mini-boss à 5:00) est ajoutée par le directeur de spawn.
 */
export const SPAWN = {
  /** Intervalle entre deux vagues, en ms. */
  intervalMs: 1400,
  /** Nombre d'ennemis par vague. */
  countPerWave: 1,
  /** Rayon d'apparition autour du centre des joueurs (hors écran). */
  ringRadius: 700,
  /** Plafond d'ennemis simultanés (perf). */
  maxActive: 200
} as const
