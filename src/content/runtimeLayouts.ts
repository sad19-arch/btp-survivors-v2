/**
 * Override RUNTIME des compositions de stage (layouts édités par le joueur,
 * injectés au boot par l'app depuis [[userLayouts]]). Séparé de
 * `composedLayouts.ts` — qui est un fichier GÉNÉRÉ (régénéré par le plugin Vite à
 * chaque « Sauver au repo ») et écraserait tout ajout manuel.
 *
 * Déterminisme préservé : `runtime` est vide par défaut ; seul l'APP (couche
 * impure) appelle `setRuntimeLayout` AVANT de démarrer la sim. Le harness
 * `npm run sim` et l'e2e ne l'appellent jamais → `resolveComposedLayout` retombe
 * sur la compo committée → sim:check diff 0. Lecture pure (aucun DOM/localStorage
 * ici : on reçoit des DONNÉES déjà parsées).
 */
import { getComposedLayout } from './composedLayouts'
import type { StageLayout } from './stageLayout'

const runtime: Record<string, StageLayout> = {}

/** Injecte (ou retire, avec `null`) le layout runtime d'un stage. Appelé par l'app au boot. */
export function setRuntimeLayout(stage: string, layout: StageLayout | null): void {
  if (layout === null) {
    delete runtime[stage]
  } else {
    runtime[stage] = layout
  }
}

/**
 * Compo effective d'un stage : layout runtime du joueur EN PRIORITÉ, sinon la
 * compo committée (`getComposedLayout`), sinon `null` (jeu génératif). Point
 * d'entrée UNIQUE côté jeu (sim + rendu) pour la parité.
 */
export function resolveComposedLayout(stage: string): StageLayout | null {
  return runtime[stage] ?? getComposedLayout(stage)
}
