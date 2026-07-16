/**
 * Persistance des SUCCÈS (ids débloqués + compteurs de profil), localStorage.
 * Couche UI/impure (comme [[hiscores]]) : clé versionnée, validation champ par
 * champ après `JSON.parse`, repli silencieux si stockage absent/corrompu.
 * N'affecte JAMAIS la sim. Flux `ui → content` : on lit `src/content/achievements`,
 * jamais l'inverse.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ DEUX NATURES DE COMPTEURS — LA FAUTE À NE PAS COMMETTRE
 * ---------------------------------------------------------------------------
 * `AchievementProgress` mélange (c'est documenté par champ dans
 * `src/content/achievements.ts`) :
 *   - des CUMULS DE PROFIL, qui s'ADDITIONNENT d'une run à l'autre ;
 *   - des RECORDS DE RUN (`bestSurvivalMs`, `bestLevel`), qui prennent le MAXIMUM.
 *
 * Additionner un record débloquerait « tenir 10 minutes » avec DIX RUNS D'UNE
 * MINUTE : le succès deviendrait faux sans qu'aucun test naïf ne bronche.
 *
 * La parade est structurelle, pas déclarative : `MERGE_KIND` est un type mappé
 * sur `keyof AchievementProgress`. Ajouter un champ au contenu CASSE LE BUILD
 * tant qu'on ne l'a pas classé `'sum'` ou `'max'` — impossible de retomber
 * silencieusement sur « somme par défaut ».
 */

import type { AchievementProgress } from '@content/achievements'
import { ACHIEVEMENTS, evaluateAchievements } from '@content/achievements'

const STORAGE_KEY = 'btp:achievements_v1'

/** Comment un champ se fusionne d'une run vers le profil. */
type MergeKind = 'sum' | 'max'

/**
 * Nature de CHAQUE champ — miroir des commentaires de `src/content/achievements.ts`.
 * Type mappé : exhaustif par construction (cf. en-tête).
 */
const MERGE_KIND: { readonly [K in keyof AchievementProgress]: MergeKind } = {
  kills: 'sum',
  bossKills: 'sum',
  chestsOpened: 'sum',
  weaponEvolutions: 'sum',
  prisonersFreed: 'sum',
  stagesCompleted: 'sum',
  // Records : MAX, jamais somme (cf. en-tête).
  bestSurvivalMs: 'max',
  bestLevel: 'max'
}

const PROGRESS_KEYS = Object.keys(MERGE_KIND) as (keyof AchievementProgress)[]

/** Ids du catalogue courant — sert à écarter les succès retirés du contenu. */
const KNOWN_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((a) => a.id))

/** Profil vierge (tous les compteurs à zéro). */
export const EMPTY_PROGRESS: AchievementProgress = {
  kills: 0,
  bossKills: 0,
  chestsOpened: 0,
  weaponEvolutions: 0,
  prisonersFreed: 0,
  stagesCompleted: 0,
  bestSurvivalMs: 0,
  bestLevel: 0
}

interface AchievementStore {
  readonly unlocked: readonly string[]
  readonly progress: AchievementProgress
}

/** Entier ≥ 0, ou 0 si la valeur stockée est absente/NaN/négative/du mauvais type. */
function sanitizeCount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    return 0
  }
  return Math.floor(v)
}

/** Valide un `AchievementProgress` lu depuis le JSON : champ par champ, jamais de cast aveugle. */
function parseProgress(raw: unknown): AchievementProgress {
  if (typeof raw !== 'object' || raw === null) {
    return { ...EMPTY_PROGRESS }
  }
  const p = raw as Record<string, unknown>
  const out = {} as Record<keyof AchievementProgress, number>
  for (const key of PROGRESS_KEYS) {
    out[key] = sanitizeCount(p[key])
  }
  return out
}

/**
 * Valide la liste d'ids débloqués. Un id INCONNU (succès retiré du catalogue
 * depuis, profil d'une version ultérieure) est IGNORÉ, jamais fatal : un profil
 * qui refuse de se charger est pire que le succès manquant.
 */
function parseUnlocked(raw: unknown): Set<string> {
  const out = new Set<string>()
  if (!Array.isArray(raw)) {
    return out
  }
  for (const id of raw) {
    if (typeof id === 'string' && KNOWN_IDS.has(id)) {
      out.add(id)
    }
  }
  return out
}

function readStore(): { unlocked: Set<string>; progress: AchievementProgress } {
  try {
    if (typeof localStorage === 'undefined') {
      return { unlocked: new Set<string>(), progress: { ...EMPTY_PROGRESS } }
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return { unlocked: new Set<string>(), progress: { ...EMPTY_PROGRESS } }
    }
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) {
      return { unlocked: new Set<string>(), progress: { ...EMPTY_PROGRESS } }
    }
    const p = parsed as Record<string, unknown>
    return { unlocked: parseUnlocked(p.unlocked), progress: parseProgress(p.progress) }
  } catch {
    return { unlocked: new Set<string>(), progress: { ...EMPTY_PROGRESS } }
  }
}

function writeStore(store: AchievementStore): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    }
  } catch {
    /* stockage indisponible : on ignore silencieusement */
  }
}

/**
 * Fusionne les compteurs d'une run dans le profil, CHAQUE CHAMP SELON SA NATURE
 * (cf. `MERGE_KIND`). Fonction PURE : ne mute ni `stored` ni `run`, ne touche
 * pas au stockage → testable seule.
 */
export function mergeProgress(
  stored: AchievementProgress,
  run: AchievementProgress
): AchievementProgress {
  const out = {} as Record<keyof AchievementProgress, number>
  for (const key of PROGRESS_KEYS) {
    const a = sanitizeCount(stored[key])
    const b = sanitizeCount(run[key])
    out[key] = MERGE_KIND[key] === 'max' ? Math.max(a, b) : a + b
  }
  return out
}

/** Ids des succès déjà acquis (les ids absents du catalogue courant sont écartés). */
export function readUnlocked(): ReadonlySet<string> {
  return readStore().unlocked
}

/** Compteurs cumulés du profil (profil vierge si absent/corrompu). */
export function readProgress(): AchievementProgress {
  return readStore().progress
}

/**
 * Fusionne `run` dans le profil, persiste, et retourne les ids NOUVELLEMENT
 * débloqués — jamais un succès déjà acquis (sinon le toast se rejouerait à
 * chaque fin de run).
 *
 * ⚠️ NON IDEMPOTENT, et c'est voulu : chaque appel représente UNE run terminée,
 * donc ses cumuls s'ajoutent au profil. Committer deux fois la même run compte
 * ses kills deux fois. L'appelant doit appeler `commitRun` UNE SEULE FOIS par
 * run (les records, eux, sont naturellement stables par idempotence du `max`).
 */
export function commitRun(run: AchievementProgress): string[] {
  const { unlocked, progress } = readStore()
  const merged = mergeProgress(progress, run)
  const newly = evaluateAchievements(merged, unlocked)
  const allUnlocked = [...unlocked, ...newly]
  writeStore({ unlocked: allUnlocked, progress: merged })
  return newly
}

/** Remet le profil de succès à zéro (option « effacer les données »). */
export function resetAchievements(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* stockage indisponible : on ignore silencieusement */
  }
}
