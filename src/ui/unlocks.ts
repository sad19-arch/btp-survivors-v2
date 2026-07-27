import {
  LOCKED_REWARD_IDS,
  UNLOCKS,
  type UnlockConditionType,
  type UnlockDefinition
} from '@content/unlocks'

export const UNLOCK_STORAGE_KEY = 'btp:unlocks_v1'

/** Traces fiables d'un profil antérieur à l'introduction des déblocages. */
const LEGACY_PROFILE_KEYS = [
  'btp:achievements_v1',
  'btp:stage_progress_v1',
  'btp:hiscores_v1',
  'btp:metaCoins',
  'btp:hiscore'
] as const

export interface UnlockProgressState {
  version: 1
  unlockedContentIds: string[]
  seenUnlockIds: string[]
  triedContentIds: string[]
  cumulativeProgress: Record<string, number>
  /** Arme nouvellement ouverte à garantir une seule fois dans les cartes. */
  trialWeaponId: string | null
}

export interface UnlockUpdate {
  state: UnlockProgressState
  newlyUnlockedIds: string[]
}

const KNOWN_UNLOCK_IDS = new Set(UNLOCKS.map((unlock) => unlock.id))
const KNOWN_REWARD_IDS = new Set(UNLOCKS.map((unlock) => unlock.rewardId))

export function freshUnlockProgress(): UnlockProgressState {
  return {
    version: 1,
    unlockedContentIds: [],
    seenUnlockIds: [],
    triedContentIds: [],
    cumulativeProgress: {},
    trialWeaponId: null
  }
}

function legacyUnlockProgress(): UnlockProgressState {
  const rewards = UNLOCKS.map((unlock) => unlock.rewardId)
  return {
    version: 1,
    unlockedContentIds: rewards,
    seenUnlockIds: UNLOCKS.map((unlock) => unlock.id),
    triedContentIds: rewards,
    cumulativeProgress: {},
    trialWeaponId: null
  }
}

function uniqueKnown(raw: unknown, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return [...new Set(raw.filter((value): value is string => typeof value === 'string' && known.has(value)))]
}

function parseProgress(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) {
    return {}
  }
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      out[key] = Math.floor(value)
    }
  }
  return out
}

function parseStore(raw: unknown): UnlockProgressState | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const source = raw as Record<string, unknown>
  const unlockedContentIds = uniqueKnown(source.unlockedContentIds, KNOWN_REWARD_IDS)
  const trialWeaponId =
    typeof source.trialWeaponId === 'string'
    && unlockedContentIds.includes(source.trialWeaponId)
    && UNLOCKS.some((unlock) => unlock.rewardType === 'weapon' && unlock.rewardId === source.trialWeaponId)
      ? source.trialWeaponId
      : null
  return {
    version: 1,
    unlockedContentIds,
    seenUnlockIds: uniqueKnown(source.seenUnlockIds, KNOWN_UNLOCK_IDS),
    triedContentIds: uniqueKnown(source.triedContentIds, KNOWN_REWARD_IDS),
    cumulativeProgress: parseProgress(source.cumulativeProgress),
    trialWeaponId
  }
}

export function saveUnlockProgress(state: UnlockProgressState): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify(state))
    }
  } catch {
    /* stockage indisponible */
  }
}

/**
 * Migration non destructive : l'absence de notre clé + la présence d'une trace
 * de profil signifie « joueur existant ». On ne lui retire alors aucun des trois
 * contenus. Une installation réellement vierge commence avec ces seuls contenus
 * verrouillés.
 */
export function readUnlockProgress(): UnlockProgressState {
  try {
    if (typeof localStorage === 'undefined') {
      return legacyUnlockProgress()
    }
    const raw = localStorage.getItem(UNLOCK_STORAGE_KEY)
    if (raw !== null) {
      const parsed = parseStore(JSON.parse(raw) as unknown)
      return parsed ?? freshUnlockProgress()
    }
    const migrated = LEGACY_PROFILE_KEYS.some((key) => localStorage.getItem(key) !== null)
      ? legacyUnlockProgress()
      : freshUnlockProgress()
    saveUnlockProgress(migrated)
    return migrated
  } catch {
    return freshUnlockProgress()
  }
}

export function isContentUnlocked(state: UnlockProgressState, contentId: string): boolean {
  return !LOCKED_REWARD_IDS.has(contentId) || state.unlockedContentIds.includes(contentId)
}

export function unlockProgressValue(state: UnlockProgressState, unlock: UnlockDefinition): number {
  if (state.unlockedContentIds.includes(unlock.rewardId)) {
    return typeof unlock.conditionValue === 'number' ? unlock.conditionValue : 1
  }
  const key =
    unlock.conditionType === 'weapon_evolved'
      ? `weapon_evolved:${String(unlock.conditionValue)}`
      : unlock.conditionType
  return state.cumulativeProgress[key] ?? 0
}

export function applyUnlockSignal(
  previous: UnlockProgressState,
  conditionType: UnlockConditionType,
  value: number | string
): UnlockUpdate {
  const state: UnlockProgressState = {
    ...previous,
    unlockedContentIds: [...previous.unlockedContentIds],
    seenUnlockIds: [...previous.seenUnlockIds],
    triedContentIds: [...previous.triedContentIds],
    cumulativeProgress: { ...previous.cumulativeProgress }
  }
  if (conditionType === 'weapon_evolved') {
    state.cumulativeProgress[`weapon_evolved:${String(value)}`] = 1
  } else if (conditionType === 'combo_reached') {
    state.cumulativeProgress.combo_reached = Math.max(
      state.cumulativeProgress.combo_reached ?? 0,
      typeof value === 'number' ? Math.floor(value) : 0
    )
  } else {
    state.cumulativeProgress.prisoners_rescued_total =
      (state.cumulativeProgress.prisoners_rescued_total ?? 0)
      + (typeof value === 'number' ? Math.max(0, Math.floor(value)) : 0)
  }

  const newlyUnlockedIds: string[] = []
  for (const unlock of UNLOCKS) {
    if (unlock.conditionType !== conditionType || state.unlockedContentIds.includes(unlock.rewardId)) {
      continue
    }
    const target = unlock.conditionValue
    const complete =
      conditionType === 'weapon_evolved'
        ? String(value) === String(target)
        : unlockProgressValue(state, unlock) >= Number(target)
    if (!complete) {
      continue
    }
    state.unlockedContentIds.push(unlock.rewardId)
    newlyUnlockedIds.push(unlock.id)
    if (unlock.rewardType === 'weapon') {
      state.trialWeaponId = unlock.rewardId
    }
  }
  saveUnlockProgress(state)
  return { state, newlyUnlockedIds }
}

export function markUnlocksSeen(
  previous: UnlockProgressState,
  unlockIds: readonly string[]
): UnlockProgressState {
  const seen = new Set(previous.seenUnlockIds)
  for (const id of unlockIds) {
    if (KNOWN_UNLOCK_IDS.has(id)) {
      seen.add(id)
    }
  }
  const state = { ...previous, seenUnlockIds: [...seen] }
  saveUnlockProgress(state)
  return state
}

export function markContentTried(
  previous: UnlockProgressState,
  contentId: string
): UnlockProgressState {
  if (!KNOWN_REWARD_IDS.has(contentId) || previous.triedContentIds.includes(contentId)) {
    return previous
  }
  const state = { ...previous, triedContentIds: [...previous.triedContentIds, contentId] }
  saveUnlockProgress(state)
  return state
}

export function consumeTrialWeapon(
  previous: UnlockProgressState,
  weaponId: string
): UnlockProgressState {
  if (previous.trialWeaponId !== weaponId) {
    return previous
  }
  const state = { ...previous, trialWeaponId: null }
  saveUnlockProgress(state)
  return state
}

export function resetUnlockProgress(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(UNLOCK_STORAGE_KEY)
    }
  } catch {
    /* stockage indisponible */
  }
}
