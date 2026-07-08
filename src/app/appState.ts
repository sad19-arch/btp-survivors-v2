import type { GameState, PlayerState } from '@core/types'
import type { CardKind } from '@core/systems/cards'

/**
 * Rapport figé généré UNE SEULE FOIS à l'entrée du game-over.
 * Jamais recalculé entre deux appels à `getState()` : la phrase est stable.
 */
export interface DeathReport {
  /** Temps écoulé au moment de la mort (ms). */
  elapsedMs: number
  /** Nombre d'ennemis tués (= score). */
  kills: number
  /** Progression [0, 1] dans le stage. */
  progressRatio: number
  /** Progression arrondie en % entier. */
  progressPercent: number
  /** Secondes restantes avant la fin du stage (≥ 0). */
  remainingSeconds: number
  /** Durée totale du stage (ms). */
  stageDurationMs: number
  /** Phrase de mort sélectionnée une seule fois. */
  quote: string
}

/** Écran applicatif courant (dérivé de l'état de la simulation + surcouche Options). */
export type Screen =
  | 'title'
  | 'characterSelect'
  | 'game'
  | 'paused'
  | 'upgrade'
  | 'gameover'
  | 'victory'
  | 'options'

/** Une entrée d'inventaire résolue : id + nom lisible + niveau courant. */
export interface InventoryEntry {
  id: string
  name: string
  level: number
  maxLevel?: number
  /** Vrai si cette arme peut évoluer MAINTENANT (base au max + passif catalyseur). */
  evolveReady?: boolean
  /** Indice FR : « Prête à évoluer ! » / « Passif manquant : <nom> » / « Monte-la au max ». */
  evolveHint?: string
}

/** Inventaire résolu d'un joueur (armes + passifs), pour l'affichage HUD. */
export interface InventoryView {
  weapons: InventoryEntry[]
  passives: InventoryEntry[]
}

/** `PlayerState` (core) enrichi de l'inventaire résolu (noms) — additif, couche App. */
export interface AppPlayerState extends PlayerState {
  inventory: InventoryView
}

/** Direction de navigation dans les menus. */
export type NavDir = 'up' | 'down' | 'left' | 'right'

/** Un item de menu prêt à afficher. */
export interface MenuItemView {
  id: string
  label: string
  /** Détail optionnel (ex. effet d'une carte d'upgrade). */
  hint: string | null
  /** Ligne d'explication de l'effet (cartes d'upgrade). */
  description?: string
  /** Niveau courant de l'arme/passif (cartes d'upgrade). */
  currentLevel?: number
  /** Niveau maximum de l'arme/passif (cartes d'upgrade). */
  maxLevel?: number
  /** Type de carte (arme ou passif). */
  kind?: CardKind
  /** Fragment FR décrivant le gain du niveau (ex. « +2 dégâts · +1 projectile »). */
  delta?: string
}

/** Le menu actif (null en jeu). */
export interface MenuView {
  screen: Screen
  items: MenuItemView[]
  /** Index focalisé (-1 si pas d'items). */
  index: number
}

/** Vue complète exposée par l'App (état du jeu + couche écrans/menus). */
export interface AppViewState extends Omit<GameState, 'players'> {
  players: AppPlayerState[]
  screen: Screen
  menu: MenuView | null
  /** Skin doré débloqué (code Konami au titre) — cosmétique, session. */
  goldSkin: boolean
  /** Identifiant de run (incrémenté à chaque partie/restart) — le rendu s'en sert pour repartir propre. */
  runId: number
  /** Intro de run en cours (sim gelée, micro-animation d'entrée). */
  introActive: boolean
  /** Libellé humain de la phase courante (ex. « Réseaux enterrés »). */
  stageTitle: string
  /** Sous-titre de la phase (ex. « Tranchées et canalisations »). */
  stageSubtitle: string
  /** Numéro de phase dans le cycle (1..10). */
  stageOrder: number
  /** Sélection de personnage en cours (joueur actif / total) ; `null` hors de ce flux. */
  characterSelect: { player: number; total: number } | null
  /** Mini-carte affichée (bas-gauche) — bascule clavier M / manette Back/Select. */
  minimapVisible: boolean
  /**
   * Transitoire (one-shot) : nom lisible de l'arme évoluée ce pas (résolu via WEAPONS
   * dans `App.getState()`), ou `null`. Miroir de `GameState.justEvolved` enrichi du
   * nom lisible pour l'overlay (qui ne dépend pas de `src/content`).
   */
  justEvolvedWeaponName: string | null
  /**
   * Rapport de mort figé — calculé UNE SEULE FOIS quand `screen === 'gameover'`,
   * stable entre les appels à `getState()`. `null` tant que le game-over n'est pas
   * atteint ; redevient `null` après `restart()` / `start()`.
   */
  deathReport: DeathReport | null
}
