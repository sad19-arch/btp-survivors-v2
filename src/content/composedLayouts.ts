/**
 * composedLayouts — REGISTRE des compositions du Stage Composer Editor,
 * committées sous src/content/layouts/*.json.
 *
 * ⚠️ FICHIER GÉNÉRÉ par tools/vite/saveLayoutPlugin.ts à chaque « Sauver au repo ».
 * Ne pas éditer à la main. Imports statiques (pas d'import.meta.glob → tsx-safe).
 * Registre vide ⇒ getComposedLayout renvoie null ⇒ jeu génératif + sim:check diff 0.
 */

import type { StageLayout } from './stageLayout'
import l0 from './layouts/charpente_toiture.json'
import l1 from './layouts/echafaudages.json'
import l2 from './layouts/finitions.json'
import l3 from './layouts/fondations.json'
import l4 from './layouts/gros_oeuvre.json'
import l5 from './layouts/livraison_audit.json'
import l6 from './layouts/reseaux_enterres.json'
import l7 from './layouts/second_oeuvre.json'
import l8 from './layouts/terrain_vierge.json'
import l9 from './layouts/terrassement.json'

const REGISTRY: Record<string, StageLayout> = {
  'charpente_toiture': l0 as unknown as StageLayout,
  'echafaudages': l1 as unknown as StageLayout,
  'finitions': l2 as unknown as StageLayout,
  'fondations': l3 as unknown as StageLayout,
  'gros_oeuvre': l4 as unknown as StageLayout,
  'livraison_audit': l5 as unknown as StageLayout,
  'reseaux_enterres': l6 as unknown as StageLayout,
  'second_oeuvre': l7 as unknown as StageLayout,
  'terrain_vierge': l8 as unknown as StageLayout,
  'terrassement': l9 as unknown as StageLayout
}

/** Compo committée d'un stage, ou null si aucune (le jeu reste génératif). */
export function getComposedLayout(stageId: string): StageLayout | null {
  return REGISTRY[stageId] ?? null
}

/** Ids des stages ayant une compo committée (diagnostic / tests). */
export function composedStageIds(): string[] {
  return Object.keys(REGISTRY)
}
