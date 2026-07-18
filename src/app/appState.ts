import type { GameState, PlayerState } from '@core/types'
import type { CardKind } from '@core/systems/cards'
import type { HiScoreEntry } from '@ui/hiscores'

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
  /**
   * Score de CLASSEMENT de la run (cf. `computeRunScore`) — combine kills, temps,
   * niveau et or, ×1.5 en victoire. Distinct de `kills` : c'est LUI qui est
   * comparé au tableau des high scores et inscrit dans `HiScoreEntry.score`.
   * Figé avec le reste du rapport (jamais recalculé d'une frame à l'autre).
   */
  runScore: number
  /** Or ramassé sur la run. */
  coins: number
  /** Niveau atteint (joueur 1 — le détail par joueur est dans `perPlayer`). */
  level: number
  /** Récap par joueur (1 entrée en solo, N en co-op). */
  perPlayer: RunReportPlayer[]
  /** Phrase sélectionnée une seule fois (moquerie en défaite, félicitation en victoire). */
  quote: string
  /** Note de fin de stage, 0 à 3 étoiles (cumulatives strictes — cf. `computeStars`). */
  stars: number
  /** Au moins une arme évoluée pendant la run (n'importe quel joueur en co-op). */
  evolvedAny: boolean
  /** Prisonniers libérés (compteur d'ÉQUIPE : les étoiles sont une note collective). */
  rescued: number
  /** Prisonniers à libérer sur le stage (= RESCUE.count). */
  rescueTotal: number
  /**
   * Podium co-op : meilleur / pire tueur, et leurs répliques. `null` en solo et
   * en cas d'égalité parfaite (cf. `selectPodium`) — il n'y a alors personne à
   * distinguer, et surtout personne à charrier.
   */
  podium: RunReportPodium | null
  /** Bilan du Mode Carnage ; `null` si le mode n'a pas été activé de la run. */
  carnage: RunReportCarnage | null
}

/**
 * Bilan du Mode Carnage (brief §12). `null` si le mode n'a pas été activé — le
 * rapport n'en dit alors pas un mot, comme si le secret n'existait pas.
 */
export interface RunReportCarnage {
  /** Flaques posées sur la run (cumul, pas le nombre encore visible). */
  pools: number
  /** Morts « critiques » (les rares, ~4 %). */
  criticals: number
  /** Surface repeinte, en m² — estimation volontairement fantaisiste. */
  surfaceM2: number
}

/** Podium de fin de run (co-op uniquement) : qui a porté l'équipe, qui a tenu la lampe. */
export interface RunReportPodium {
  bestId: number
  worstId: number
  /** Félicitation adressée au meilleur tueur. */
  praise: string
  /** Pique adressée au dernier. */
  mock: string
}

/**
 * Issue de l'ouverture d'un coffre (one-shot), enrichie pour la machine à sous.
 * `weaponId`/`weaponName` renseignés seulement pour `kind === 'evolution'`.
 */
/** Une issue révélée par un rouleau de la machine à sous (arme montée/évoluée, ou soin). */
export interface ChestResultView {
  kind: 'evolution' | 'weapon-up' | 'heal'
  weaponId: string | null
  weaponName: string | null
  /** Niveau résultant (montée : nouveau niveau ; évolution : 1). null pour un soin. */
  level: number | null
}

export interface ChestOpenView {
  isSuper: boolean
  /** 1 issue (coffre normal) ou jusqu'à 3 (super coffre). */
  results: ChestResultView[]
}

/** Écran applicatif courant (dérivé de l'état de la simulation + surcouches). */
export type Screen =
  | 'title'
  | 'characterSelect'
  | 'game'
  | 'paused'
  | 'upgrade'
  | 'gameover'
  | 'victory'
  | 'options'
  | 'nameEntry'
  | 'hiscores'
  | 'achievements'
  | 'evolutions'

/**
 * Saisie du prénom en fin de run (écran `nameEntry`), résolue pour l'affichage :
 * les CARACTÈRES (pas les index dans l'alphabet) — l'overlay n'a ainsi pas à
 * connaître `NAME_ENTRY_ALPHABET`.
 *
 * `cursor` est le focus de cet écran : il ne vit PAS dans le `FocusModel` (qui
 * n'a qu'un item ici), mais dans l'état pur `NameEntryState` — c'est pourquoi il
 * doit figurer dans la signature de l'overlay, sinon déplacer le curseur ne
 * redessinerait rien.
 */
export interface NameEntryView {
  /** 8 caractères résolus (espace = case vide). */
  chars: string[]
  /** Case focalisée (0..7). */
  cursor: number
  /** Nom résolu (trimé) — ce qui sera inscrit au tableau. */
  name: string
  /** Score de classement de la run qu'on s'apprête à inscrire (cf. `RunReport.runScore`). */
  score: number
  /** Libellé du stage dont on rejoint le classement. */
  stageTitle: string
}

/** Tableau des high scores affiché (écran `hiscores`) après inscription. */
export interface HiScoresView {
  /** Stage dont on affiche le classement (les tableaux sont PAR stage). */
  stageId: string
  /** Libellé humain du stage (ex. « Terrain vierge »). */
  stageTitle: string
  /** Top 20 trié par score décroissant. */
  entries: HiScoreEntry[]
  /** Rang (0-19) de la ligne du joueur, à mettre en surbrillance ; -1 si aucune. */
  rank: number
}

/**
 * Une ligne de l'écran des succès, RÉSOLUE pour l'affichage : le catalogue
 * (`src/content/achievements`) croisé avec le profil (`src/ui/achievements`).
 * L'overlay affiche, il ne teste aucun prédicat et ne lit aucun `localStorage`.
 */
export interface AchievementEntryView {
  id: string
  label: string
  description: string
  /**
   * Chemin d'icône relatif à `public/`, ou `null` si le succès n'en déclare pas
   * (l'affichage retombe alors sur un monogramme). `null` plutôt qu'optionnel :
   * `exactOptionalPropertyTypes` rendrait la construction bruyante pour rien.
   */
  icon: string | null
  unlocked: boolean
}

/**
 * Écran des succès (consultation depuis le titre). Contient TOUT le catalogue,
 * y compris les succès verrouillés : le joueur doit VOIR ce qu'il lui reste à
 * faire (même doctrine que `starRow` — une note qu'on ne voit pas n'incite à
 * rien). Figé à l'ouverture : le profil ne bouge pas pendant qu'on le consulte.
 */
export interface AchievementsView {
  entries: AchievementEntryView[]
  /** Succès débloqués (dénominateur = `entries.length`). */
  unlockedCount: number
}

/**
 * Une ligne de l'écran « Évolutions d'armes » (pause), RÉSOLUE pour l'affichage :
 * croise le catalogue `EVOLUTIONS` avec l'inventaire courant du/des joueurs.
 * `weaponId`/`weaponName`/`weaponLevel` portent la forme ACTUELLEMENT possédée
 * (arme de base tant que non évoluée, arme évoluée sinon) — `evolved` distingue
 * les deux cas, comme l'étoile pleine/vide de l'écran des succès.
 */
export interface EvolutionEntryView {
  weaponId: string
  weaponName: string
  weaponLevel: number
  reqBaseLevel: number
  evolvedName: string
  passiveId: string
  passiveName: string
  evolved: boolean
}

/**
 * Écran « Évolutions d'armes » (consultation depuis la PAUSE, en run — contrairement
 * aux succès, surcouche du titre). Ne liste QUE les armes déjà acquises (pas un
 * almanach complet : le jeu n'a pas de méta-progression, cf. CLAUDE.md).
 */
export interface EvolutionsView {
  entries: EvolutionEntryView[]
  /** Évolutions déjà obtenues cette run (dénominateur = `entries.length`). */
  evolvedCount: number
}

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
  /**
   * Joueur à qui appartient ce menu (écran d'upgrade uniquement ; `undefined`
   * partout ailleurs — titre, pause, options… sont des écrans d'équipe).
   *
   * L'identité vient de `PendingLevelUp.playerId` : le core la connaît depuis
   * toujours et applique bien la carte au bon joueur, mais l'UI ne l'affichait
   * nulle part — en co-op, l'écran était identique quel que soit le joueur qui
   * montait de niveau.
   */
  playerId?: number
}

/** Vue complète exposée par l'App (état du jeu + couche écrans/menus). */
export interface AppViewState extends Omit<GameState, 'players'> {
  players: AppPlayerState[]
  screen: Screen
  menu: MenuView | null
  /** Skin doré débloqué — cosmétique, session. Son déclencheur est en attente
   *  (le Konami active désormais le Mode Carnage). */
  goldSkin: boolean
  /** Mode Carnage actif (secret, Konami au titre) — cosmétique, hors simulation. */
  carnage: boolean
  /** Identifiant de run (incrémenté à chaque partie/restart) — le rendu s'en sert pour repartir propre. */
  runId: number
  /** Intro de run en cours (sim gelée, micro-animation d'entrée). */
  introActive: boolean
  /**
   * Temps écoulé depuis le début de l'intro (ms).
   * Progresse de 0 jusqu'à `totalIntroMs` ; reste 0 si introActive est faux.
   * Utilisé par la cinématique render-only pour animer les séquences.
   */
  introElapsedMs: number
  /** Libellé humain de la phase courante (ex. « Réseaux enterrés »). */
  stageTitle: string
  /** Sous-titre de la phase (ex. « Tranchées et canalisations »). */
  stageSubtitle: string
  /** Numéro de phase dans le cycle (1..10). */
  stageOrder: number
  /** Sélection de personnage en cours (joueur actif / total + perso courant) ; `null` hors de ce flux. */
  characterSelect: { player: number; total: number; charId: string } | null
  /** Saisie du prénom en cours (fin de run, score qualifiant) ; `null` hors de ce flux. */
  nameEntry: NameEntryView | null
  /** Tableau des scores affiché (après inscription du nom) ; `null` hors de ce flux. */
  hiScores: HiScoresView | null
  /** Écran des succès ouvert (consultation depuis le titre) ; `null` hors de ce flux. */
  achievements: AchievementsView | null
  /** Écran « Évolutions d'armes » ouvert (consultation depuis la pause) ; `null` hors de ce flux. */
  evolutions: EvolutionsView | null
  /** Mini-carte affichée (bas-gauche) — bascule clavier M / manette Back/Select. */
  minimapVisible: boolean
  /**
   * Compteur de SKIP de coffre : incrémenté quand le joueur presse A pendant la
   * machine à sous. L'overlay compare sa dernière valeur vue → ferme la révélation
   * immédiatement (découplage : pas d'appel direct app→overlay).
   */
  chestSkipToken: number
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
