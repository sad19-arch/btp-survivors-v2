import { ORDERED_PHASES, type ConstructionPhaseId } from '@content/phases'
import type { StarRating } from '@content/stars'

/** Clé versionnée du profil de progression des stages. */
export const STAGE_PROGRESS_STORAGE_KEY = 'btp:stage_progress_v1'

const STORAGE_VERSION = 1
const KNOWN_STAGE_IDS = new Set<ConstructionPhaseId>(ORDERED_PHASES.map((phase) => phase.id))

/** Meilleure note connue par stage. Les absents n'ont jamais été livrés. */
export type StageProgress = Partial<Record<ConstructionPhaseId, StarRating>>

interface StoredStageProgress {
  version: number
  bestStars: StageProgress
}

function isStarRating(value: unknown): value is StarRating {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3
}

/** Valide seulement les entrées connues d'un profil lu depuis le stockage. */
function parseBestStars(value: unknown): StageProgress {
  if (typeof value !== 'object' || value === null) {
    return {}
  }
  const progress: StageProgress = {}
  for (const [stageId, stars] of Object.entries(value)) {
    if (KNOWN_STAGE_IDS.has(stageId as ConstructionPhaseId) && isStarRating(stars)) {
      progress[stageId as ConstructionPhaseId] = stars
    }
  }
  return progress
}

function parseStore(value: unknown): StageProgress {
  if (typeof value !== 'object' || value === null) {
    return {}
  }
  const store = value as Record<string, unknown>
  return store.version === STORAGE_VERSION ? parseBestStars(store.bestStars) : {}
}

/** Profil lu et validé, ou profil vierge si le stockage est absent/corrompu. */
export function readStageProgress(): StageProgress {
  try {
    if (typeof localStorage === 'undefined') {
      return {}
    }
    const raw = localStorage.getItem(STAGE_PROGRESS_STORAGE_KEY)
    return raw === null ? {} : parseStore(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

function writeStageProgress(progress: StageProgress): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const store: StoredStageProgress = { version: STORAGE_VERSION, bestStars: progress }
      localStorage.setItem(STAGE_PROGRESS_STORAGE_KEY, JSON.stringify(store))
    }
  } catch {
    /* stockage indisponible : le profil mémoire continue de fonctionner */
  }
}

/** Maximum par stage entre deux snapshots (onglet mémoire et stockage partagé). */
function mergeProgress(left: StageProgress, right: StageProgress): StageProgress {
  const merged: StageProgress = { ...left }
  for (const [stageId, stars] of Object.entries(right)) {
    const id = stageId as ConstructionPhaseId
    if (stars > (merged[id] ?? 0)) {
      merged[id] = stars
    }
  }
  return merged
}

/** Égalité sémantique de profils, sans dépendre de l'ordre des clés sérialisées. */
function sameProgress(left: StageProgress, right: StageProgress): boolean {
  const leftEntries = Object.entries(left)
  return leftEntries.length === Object.keys(right).length && leftEntries.every(([stageId, stars]) => right[stageId as ConstructionPhaseId] === stars)
}

/** Fusion pure : un résultat inférieur ne peut jamais régresser le meilleur historique. */
export function mergeStageStars(
  progress: StageProgress,
  stageId: ConstructionPhaseId,
  stars: StarRating
): StageProgress {
  const previous = progress[stageId] ?? 0
  return stars > previous ? { ...progress, [stageId]: stars } : { ...progress }
}

/**
 * Enregistre le résultat d'UNE run après avoir fusionné l'état mémoire avec le
 * profil le plus récent du stockage. Évite un write si aucun meilleur score ne
 * change : deux onglets ne peuvent ni régresser l'autre, ni écrire à vide.
 */
export function commitStageStars(
  stageId: ConstructionPhaseId,
  stars: StarRating,
  current: StageProgress = readStageProgress()
): StageProgress {
  const stored = readStageProgress()
  const merged = mergeStageStars(mergeProgress(stored, current), stageId, stars)
  if (!sameProgress(stored, merged)) {
    writeStageProgress(merged)
  }
  return merged
}

/** Le terrain vierge est toujours ouvert ; chaque maillon précédent doit avoir 3 étoiles. */
export function isStageUnlocked(progress: StageProgress, stageId: ConstructionPhaseId): boolean {
  const targetIndex = ORDERED_PHASES.findIndex((phase) => phase.id === stageId)
  if (targetIndex < 0) {
    return false
  }
  for (let index = 0; index < targetIndex; index++) {
    const previous = ORDERED_PHASES[index]
    if (previous === undefined || progress[previous.id] !== 3) {
      return false
    }
  }
  return true
}

/** Prochain stage seulement s'il existe et est déjà accessible avec ce profil. */
export function nextUnlockedStage(progress: StageProgress, stageId: ConstructionPhaseId): ConstructionPhaseId | null {
  const index = ORDERED_PHASES.findIndex((phase) => phase.id === stageId)
  const next = index < 0 ? undefined : ORDERED_PHASES[index + 1]
  return next !== undefined && isStageUnlocked(progress, next.id) ? next.id : null
}

/** Nombre de stages accessibles dans la chaîne continue. */
export function unlockedStageCount(progress: StageProgress): number {
  return ORDERED_PHASES.filter((phase) => isStageUnlocked(progress, phase.id)).length
}

/** Efface la progression — réservé aux flux qui réinitialisent explicitement un profil. */
export function resetStageProgress(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STAGE_PROGRESS_STORAGE_KEY)
    }
  } catch {
    /* stockage indisponible : rien à faire */
  }
}
