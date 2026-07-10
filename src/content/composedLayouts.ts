/**
 * composedLayouts — REGISTRE des compositions du Stage Composer Editor,
 * committées sous src/content/layouts/*.json.
 *
 * ⚠️ FICHIER GÉNÉRÉ par tools/vite/saveLayoutPlugin.ts à chaque « Sauver au repo ».
 * Ne pas éditer à la main. Imports statiques (pas d'import.meta.glob → tsx-safe).
 * Registre vide ⇒ getComposedLayout renvoie null ⇒ jeu génératif + sim:check diff 0.
 */

import type { StageLayout } from './stageLayout'

const REGISTRY: Record<string, StageLayout> = {}

/** Compo committée d'un stage, ou null si aucune (le jeu reste génératif). */
export function getComposedLayout(stageId: string): StageLayout | null {
  return REGISTRY[stageId] ?? null
}

/** Ids des stages ayant une compo committée (diagnostic / tests). */
export function composedStageIds(): string[] {
  return Object.keys(REGISTRY)
}
