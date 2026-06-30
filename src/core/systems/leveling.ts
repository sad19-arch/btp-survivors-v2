import type { ProgressComp } from '../types'
import { PROGRESSION } from '@content/config'

/**
 * Logique de montée de niveau (pure). Si l'XP accumulée atteint le palier, on la
 * consomme, on incrémente le niveau et on calcule le palier suivant (×growth).
 *
 * Renvoie `true` si un niveau a été gagné (le joueur doit alors choisir une carte).
 */
export function consumeLevelUp(progress: ProgressComp): boolean {
  if (progress.xp < progress.nextThreshold) {
    return false
  }
  progress.xp -= progress.nextThreshold
  progress.level += 1
  progress.nextThreshold = Math.ceil(progress.nextThreshold * PROGRESSION.growth)
  return true
}

/** Progression initiale d'un joueur (niveau 1, premier palier). */
export function initialProgress(): ProgressComp {
  return { xp: 0, level: 1, nextThreshold: PROGRESSION.firstThreshold }
}
