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
  vigilance: 100
} as const

/** Nombre de joueurs selon le mode. */
export const MODE_PLAYER_COUNT: Record<GameMode, number> = {
  solo: 1,
  coop: 2,
  coop3: 3,
  coop4: 4
}

/** Paramètres de spawn (slice 1). */
export const SPAWN = {
  /** Intervalle entre deux vagues, en ms. */
  intervalMs: 1000,
  /** Nombre d'ennemis par vague. */
  countPerWave: 2,
  /** Rayon d'apparition autour du centre des joueurs (hors écran). */
  ringRadius: 700,
  /** Plafond d'ennemis simultanés (perf). */
  maxActive: 200
} as const
