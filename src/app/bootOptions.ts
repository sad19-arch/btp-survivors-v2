import type { GameMode } from '@core/types'

export interface BootOptions {
  /** Mode à démarrer directement, ou null si pas de boot direct. */
  autostart: GameMode | null
  /** Seed du RNG (défaut: 1). */
  seed: number
  /** Active le seam de test (window.__GAME__ piloté, temps réel en pause). */
  test: boolean
  /** Niveau/phase demandé, ou null. */
  level: string | null
  /** Mode allégé : ne charge pas les feuilles de sprites lourdes (rendu en cercles).
   *  Utilisé par la suite e2e pour éviter la saturation mémoire du renderer logiciel. */
  lite: boolean
  /** Force l'intro cosmétique même en mode test (`?intro=1&test=1`). */
  intro: boolean
}

const VALID_MODES: ReadonlySet<string> = new Set<GameMode>(['solo', 'coop', 'coop3', 'coop4'])

/**
 * Parse les paramètres d'URL de boot (`?autostart=solo&seed=42&test=1&level=…`).
 * Fonction pure : pas d'accès à `window`, on lui passe la query string.
 */
export function parseBootOptions(search: string): BootOptions {
  const params = new URLSearchParams(search)

  const rawMode = params.get('autostart')
  const autostart = rawMode !== null && VALID_MODES.has(rawMode) ? (rawMode as GameMode) : null

  const rawSeed = params.get('seed')
  const parsedSeed = rawSeed !== null ? Number.parseInt(rawSeed, 10) : Number.NaN
  const seed = Number.isFinite(parsedSeed) ? parsedSeed : 1

  const test = params.get('test') === '1'
  const level = params.get('level')
  const lite = params.get('lite') === '1'
  const intro = params.get('intro') === '1'

  return { autostart, seed, test, level, lite, intro }
}
