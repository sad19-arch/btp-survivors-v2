import type { GameState, PlayerState } from '@core/types'
import type { CardKind } from '@core/systems/cards'

/** Issue d'une run terminée : chantier interrompu (mort) ou livré (boss final tué). */
export type RunOutcome = 'defeat' | 'victory'

/** Ligne de récap d'un joueur dans le rapport (co-op : une par joueur). */
export interface RunReportPlayer {
  id: number
  /** Ennemis tués par CE joueur (attribution au dernier frappeur). */
  kills: number
  level: number
  alive: boolean
}

/**
 * Rapport de fin de run, figé UNE SEULE FOIS à l'entrée de l'écran de fin
 * (game-over OU victoire). Jamais recalculé entre deux appels à `getState()` :
 * phrase et stats sont stables.
 *
 * Les DEUX issues partagent la même structure — l'écran est le même « Rapport de
 * chantier », seule la présentation diffère (`outcome`). Avant, la victoire lisait
 * l'état VIVANT et n'avait ni phrase, ni barre, ni kills, ni or.
 */
export interface RunReport {
  outcome: RunOutcome
  /** Libellé de la phase jouée (ex. « Terrain vierge »). */
  stageTitle: string
  /** Temps écoulé à la fin de la run (ms). */
  elapsedMs: number
  /** Durée totale du stage (ms). */
  stageDurationMs: number
  /** Progression [0, 1] dans le stage (toujours 1 en victoire : chantier livré). */
  progressRatio: number
  /** Progression arrondie en % entier. */
  progressPercent: number
  /** Secondes restantes avant la fin du stage (≥ 0 ; 0 en victoire). */
  remainingSeconds: number
  /** Total d'ennemis tués (= score). */
  kills: number
  /** Or ramassé sur la run. */
  coins: number
  /** Niveau atteint (joueur 1 — le détail par joueur est dans `perPlayer`). */
  level: number
  /** Récap par joueur (1 entrée en solo, N en co-op). */
  perPlayer: RunReportPlayer[]
  /** Phrase sélectionnée une seule fois (moquerie en défaite, félicitation en victoire). */
  quote: string
}

/**
 * Issue de l'ouverture d'un coffre (one-shot), enrichie pour la machine à sous.
 * `weaponId`/`weaponName` renseignés seulement pour `kind === 'evolution'`.
 */
export interface ChestOpenView {
  kind: 'evolution' | 'cards' | 'heal'
  weaponId: string | null
  weaponName: string | null
  isSuper: boolean
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
  /** Sélection de personnage en cours (joueur actif / total + perso courant) ; `null` hors de ce flux. */
  characterSelect: { player: number; total: number; charId: string } | null
  /** Mini-carte affichée (bas-gauche) — bascule clavier M / manette Back/Select. */
  minimapVisible: boolean
  /**
   * Transitoire (one-shot) : nom lisible de l'arme évoluée ce pas (résolu via WEAPONS
   * dans `App.getState()`), ou `null`. Miroir de `GameState.justEvolved` enrichi du
   * nom lisible pour l'overlay (qui ne dépend pas de `src/content`).
   */
  justEvolvedWeaponName: string | null
  /**
   * Transitoire (one-shot) : issue de l'ouverture d'un coffre ce pas, enrichie du
   * nom + de l'icône d'arme (résolus via WEAPONS), ou `null`. Consommé par
   * `overlay.sync` pour lancer la machine à sous. Miroir de `GameState.chestOpened`.
   */
  chestOpen: ChestOpenView | null
  /**
   * Rapport de fin de run figé — calculé UNE SEULE FOIS à l'entrée de l'écran de
   * fin (`gameover` OU `victory`), stable entre les appels à `getState()`. `null`
   * tant que la run n'est pas finie ; redevient `null` après `restart()` / `start()`.
   */
  runReport: RunReport | null
}
