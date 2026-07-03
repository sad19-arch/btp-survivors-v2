import type { GameState, PlayerState } from '@core/types'

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
}
