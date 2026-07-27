export type UnlockRewardType = 'character' | 'weapon' | 'passive'
export type UnlockConditionType =
  | 'weapon_evolved'
  | 'combo_reached'
  | 'prisoners_rescued_total'
export type UnlockProgressMode = 'single_run' | 'cumulative'

/** Même fenêtre que le compteur CADENCE affiché au HUD. */
export const UNLOCK_COMBO_WINDOW_MS = 2000

export interface UnlockDefinition {
  id: string
  rewardType: UnlockRewardType
  rewardId: string
  rewardName: string
  rewardDescription: string
  title: string
  description: string
  conditionType: UnlockConditionType
  conditionValue: number | string
  progressMode: UnlockProgressMode
  priority: number
}

/**
 * Première tranche volontairement bornée à trois contenus déjà présents.
 * L'ordre n'est pas une règle métier : la priorité explicite décide de
 * l'objectif mis en avant.
 */
export const UNLOCKS: readonly UnlockDefinition[] = [
  {
    id: 'unlock_charpentier',
    rewardType: 'character',
    rewardId: 'charpentier',
    rewardName: 'Charpentier',
    rewardDescription: 'Spécialiste des Boulons ricochets.',
    title: 'Outillage de précision',
    description: 'Faire évoluer le Cloueur en Mitrailleuse à clous.',
    conditionType: 'weapon_evolved',
    conditionValue: 'cloueur',
    progressMode: 'single_run',
    priority: 1
  },
  {
    id: 'unlock_bonbonne',
    rewardType: 'weapon',
    rewardId: 'bonbonne_chantier',
    rewardName: 'Bonbonne de chantier',
    rewardDescription: 'Projectile lourd tiré dans les quatre directions.',
    title: 'Cadence infernale',
    description: 'Atteindre une cadence de ×500 dans une partie.',
    conditionType: 'combo_reached',
    conditionValue: 500,
    progressMode: 'single_run',
    priority: 2
  },
  {
    id: 'unlock_ouvriere',
    rewardType: 'character',
    rewardId: 'ouvriere',
    rewardName: 'Ouvrière',
    rewardDescription: 'Conductrice de Brouette à forte pénétration.',
    title: 'Personne ne reste derrière',
    description: 'Libérer 5 prisonniers au total, toutes parties confondues.',
    conditionType: 'prisoners_rescued_total',
    conditionValue: 5,
    progressMode: 'cumulative',
    priority: 3
  }
] as const

export const LOCKED_REWARD_IDS: ReadonlySet<string> = new Set(
  UNLOCKS.map((unlock) => unlock.rewardId)
)

export function unlockForReward(contentId: string): UnlockDefinition | undefined {
  return UNLOCKS.find((unlock) => unlock.rewardId === contentId)
}
