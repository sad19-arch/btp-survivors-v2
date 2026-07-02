import type { GameState } from '@core/types'

/** Écran applicatif courant (dérivé de l'état de la simulation). */
export type Screen = 'title' | 'game' | 'paused' | 'upgrade' | 'gameover' | 'victory'

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
export interface AppViewState extends GameState {
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
}
