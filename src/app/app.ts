import { Simulation } from '@core/simulation'
import {
  AuraPulseEvent,
  PrisonerFreedEvent,
  EnemyKilledEvent,
  EnemyDiedEvent,
  PlayerHurtEvent,
  LevelUpEvent,
  WeaponFiredEvent,
  PickupCollectedEvent,
  BossSpawnedEvent,
  EvolvedEvent,
  ChestOpenedEvent,
  DestructibleBrokenEvent
} from '@core/events'
import { FocusModel } from '@ui/focusModel'
import { addMetaCoins } from '@ui/metaProgress'
import { readHiScore, writeHiScore } from '@ui/hiscore'
import { readHiScores, qualifies, insertHiScore, type HiScoreEntry } from '@ui/hiscores'
import { commitRun, readUnlocked } from '@ui/achievements'
import { ACHIEVEMENTS, type AchievementProgress } from '@content/achievements'
import { AchievementUnlockedEvent } from './achievementBridge'
import { computeRunScore } from '@content/score'
import {
  emptyNameEntry,
  moveCursor,
  cycleChar,
  clearChar,
  nameOf,
  NAME_ENTRY_ALPHABET,
  type NameEntryState
} from './nameEntry'
import { ConstructionPhaseId, ORDERED_PHASES } from '@content/phases'
import { FINAL_BOSS, MODE_PLAYER_COUNT, modeForCount } from '@content/config'
import { introDurationFor } from '@content/introScripts'
import { WEAPONS } from '@content/weapons'
import { PASSIVES, aggregatePassives } from '@content/passives'
import { describeWeaponLevelDelta } from '@content/weaponDelta'
import { CHARACTER_IDS, DEFAULT_CHARACTER_ID, characterDef } from '@content/characters'
import { loadAudioSettings, saveAudioSettings, clamp01, type AudioLevels } from '@/audio/settings'
import { loadHaptics, saveHaptics } from './hapticsSettings'
import { evolutionStatuses } from '@core/systems/evolution'
import { chestRevealTotalMs } from '@ui/overlay'
import type { GameMode, GameState, PlayerInput, PlayerState } from '@core/types'
import type { AchievementsView, AppViewState, RunReport, HiScoresView, InventoryEntry, InventoryView, MenuItemView, MenuView, NavDir, Screen, EvolutionEntryView, EvolutionsView } from './appState'
import { selectDeathQuote } from '@content/deathQuotes'
import { selectVictoryQuote } from '@content/victoryQuotes'
import { EVOLUTIONS } from '@content/evolutions'
import { computeStars } from '@content/stars'
import { selectPodium } from '@content/podium'
import { selectPraiseQuote, selectMockQuote } from '@content/podiumQuotes'

export interface AppOptions {
  seed: number
  mode: GameMode
  autostart: boolean
  /** Phase/stage du chantier (défaut : terrain vierge). */
  phaseId?: ConstructionPhaseId
  /** Joue l'intro de run (préambule cosmétique). Défaut : false (tests/e2e/capture). */
  intro?: boolean
}

/** Action prise en compte par le code secret (directions + valider/annuler). */
type ComboAction = NavDir | 'back' | 'confirm'

/**
 * Grâce (ms) laissée au gel casino après un SKIP (A). Retour playtest : mettre
 * `chestRevealMsLeft` à 0 DANS le même appel que `confirm()` permettait au
 * `advanceTime()` de CETTE frame de reprendre la sim avant que la boucle DOM
 * indépendante (`overlay.sync()`, dans `main.ts`, sur son propre `requestAnimationFrame`)
 * n'ait eu l'occasion de retirer le panneau — course entre deux boucles non
 * synchronisées. Cette grâce garantit plusieurs frames réelles de gel supplémentaire
 * (le décompte existant dans `advanceTime` s'en charge), le temps que l'overlay
 * observe `chestSkipToken` et ferme la modale AVANT que la partie ne reprenne visiblement.
 */
const CHEST_SKIP_GRACE_MS = 96

/** Séquence Konami recontextualisée : ↑↑↓↓←→←→ B A (B=annuler, A=valider). */
const KONAMI: readonly ComboAction[] = [
  'up',
  'up',
  'down',
  'down',
  'left',
  'right',
  'left',
  'right',
  'back',
  'confirm'
]

/** Items fixes des menus (hors titre — dynamique — et cartes d'upgrade). */
const PAUSE_ITEMS: MenuItemView[] = [
  { id: 'reprendre', label: 'Reprendre', hint: null },
  { id: 'evolutions', label: 'Évolutions', hint: null },
  { id: 'options', label: 'Options', hint: null },
  { id: 'recommencer', label: 'Recommencer', hint: null },
  { id: 'quitter', label: 'Quitter', hint: null }
]
const GAMEOVER_ITEMS: MenuItemView[] = [
  { id: 'recommencer', label: 'Recommencer', hint: null },
  { id: 'titre', label: 'Menu titre', hint: null }
]
/**
 * Écran du tableau des scores : les 20 lignes sont CONSULTATIVES (pas des items
 * de menu), seul « Retour » est focalisable. Un tableau navigable exigerait un
 * scroll — explicitement rejeté par la DA (cf. `styles.ts`, « compacité du
 * rapport ») puisque le jeu doit rester 100 % manette.
 */
const HISCORES_ITEMS: MenuItemView[] = [{ id: 'retour', label: 'Retour', hint: null }]
/**
 * Écran des succès : même parti pris que le tableau des scores — les ~10 lignes
 * sont CONSULTATIVES, seul « Retour » est focalisable. Le catalogue tient à
 * l'écran (grille 2 colonnes), donc rien à scroller (cf. `styles.ts`).
 */
const ACHIEVEMENTS_ITEMS: MenuItemView[] = [{ id: 'retour', label: 'Retour', hint: null }]
/**
 * Écran « Évolutions d'armes » (consultation depuis la PAUSE, en run) : même parti
 * pris que les succès — liste CONSULTATIVE, seul « Retour » est focalisable.
 */
const EVOLUTIONS_ITEMS: MenuItemView[] = [{ id: 'retour', label: 'Retour', hint: null }]

/**
 * Coquille applicative : orchestre les écrans (Titre → Jeu → Pause / Upgrade /
 * Game Over) autour de la `Simulation`, et tient un modèle de focus pour la
 * navigation manette/clavier. Pure (aucun DOM) → testable en Vitest et pilotable
 * par le seam Playwright.
 */
export class App {
  readonly events = new EventTarget()

  private sim: Simulation | null = null
  private seed: number
  private mode: GameMode
  /** Phase sélectionnée au titre (départ : URL `?level=` ou terrain vierge). */
  private selectedPhase: ConstructionPhaseId
  /** Nombre de joueurs sélectionné au titre (départ : dérivé du mode de boot, ex. `?autostart=coop4`). */
  private selectedPlayers: number
  private started = false
  private readonly focus = new FocusModel()
  private focusKey = ''
  /**
   * Skin doré (cosmétique, mémoire de session).
   *
   * Le code Konami active désormais le MODE CARNAGE ; le casque doré attend un
   * nouveau déclencheur. Toute sa machinerie est intacte (feuilles `player_gold`,
   * `walkTextureKey`/`idleTextureKey` côté rendu) : seul le déclencheur manque.
   * `debugUnlockGold()` (seam) permet de l'exercer en test en attendant.
   */
  private goldSkin = false
  /**
   * Mode Carnage actif (secret, code Konami au titre). Cosmétique et hors sim :
   * `src/core` ignore ce flag, comme il ignore `goldSkin`.
   */
  private carnage = false
  /** Compteurs du Mode Carnage sur la run, alimentés par le rendu (pour le rapport). */
  private carnageStats: { pools: number; criticals: number; surfaceM2: number } | null = null
  /** Historique des dernières actions au titre, pour détecter le code Konami. */
  private comboBuffer: ComboAction[] = []
  /** Intro activée (vrai joueur) ; désactivée en test/e2e/capture. */
  private readonly introEnabled: boolean
  /** Durée totale de l'intro pour la run en cours (0 si intro désactivée). */
  private totalIntroMs = 0
  /** Temps restant de gel pour l'intro de run, en ms (0 = pas d'intro en cours). */
  private introMsLeft = 0
  /**
   * Gel « casino » : temps restant (ms) pendant lequel la partie est FIGÉE le temps
   * de la machine à sous d'ouverture de coffre (comme `introMsLeft` pour l'intro).
   * Posé à l'ouverture d'un coffre, décrémenté dans `advanceTime` ; A le remet à 0
   * (skip). > 0 ⇒ la sim n'avance pas (le joueur ne peut pas se faire toucher).
   */
  private chestRevealMsLeft = 0
  /**
   * Compteur incrémenté à chaque SKIP de coffre (A). Exposé dans l'état ; l'overlay
   * le compare pour fermer immédiatement la machine à sous (pas de couplage direct).
   */
  private chestSkipToken = 0
  /** Écran Options ouvert (surcouche au-dessus du titre / pause). */
  private optionsOpen = false
  /** Sélection de personnage en cours (ouverte par « Jouer » au titre, avant le lancement de la partie). */
  private charSelectOpen = false
  /** Joueur (1-based) en train de choisir son personnage. */
  private charSelectPlayer = 1
  /** Personnages choisis jusqu'ici (index = playerId-1), passés à `start()` une fois complets. */
  private selectedCharacters: string[] = []
  /** Index courant dans la liste de roster (curseur du carrousel), remis à 0 à chaque joueur. */
  private charCursor = 0
  /** Niveaux audio (possédés ici pour l'UI Options ; l'AudioDirector les lit). */
  private audioLevels: AudioLevels = loadAudioSettings()
  /** Vibrations manette activées (juice #2) ; lues par le Rumbler via `getVibrations()`. */
  private vibrationsEnabled: boolean = loadHaptics()
  /** Compteur de frame, bumpé en fin d'`advanceTime` — clé du cache `getStateForFrame`. */
  private frame = 0
  /** Cache du dernier `AppViewState` calculé, partagé par rendu/overlay/audio sur une frame. */
  private cachedState: AppViewState | null = null
  /** Frame à laquelle `cachedState` a été calculé (-1 = jamais). */
  private cachedFrame = -1
  /**
   * Identifiant de run, incrémenté à CHAQUE `start()` (nouvelle partie, restart,
   * stage suivant, setSeed). Exposé dans l'état pour que le rendu détecte un
   * restart MÊME STAGE (où `stageId` ne change pas) et reparte d'une scène
   * propre — sinon les sprites/VFX de la partie précédente s'accumulent (fuite).
   */
  private runId = 0
  /**
   * Mini-carte affichée (bas-gauche). Purement UI (observer-only) : bascule
   * clavier `M` / bouton manette Back/Select via `toggleMinimap()`. Défaut visible.
   */
  minimapVisible = true
  /**
   * Rapport de fin de run figé — calculé une seule fois à la première entrée sur un
   * écran de fin (game-over OU victoire), remis à `null` à chaque `start()` /
   * `restart()`. Le roll (phrase) est tiré ici (composition root — `Math.random`
   * AUTORISÉ hors `src/core`).
   */
  private _runReport: RunReport | null = null
  /** Garde one-shot : pièces du run déjà versées au total méta (fin de run). */
  private _coinsBanked = false
  /**
   * Saisie du prénom en cours (écran `nameEntry`) ; `null` hors de ce flux.
   * Le curseur de saisie vit ICI, pas dans le `FocusModel` : l'écran n'a qu'un
   * item de menu, et `nav()` route gauche/droite → case, haut/bas → lettre
   * (cf. [[nameEntry]]). C'est ce qui permet à `routeInput` de rester sans
   * condition d'écran — la grille est une affaire d'App, pas d'input.
   */
  private nameEntryState: NameEntryState | null = null
  /** Tableau des scores affiché (écran `hiscores`, après inscription) ; `null` hors de ce flux. */
  private hiScoreView: HiScoresView | null = null
  /**
   * Garde one-shot : le score du run a déjà été TRAITÉ (inscrit au tableau, ou
   * jugé non qualifiant). Sans elle, chaque validation sur l'écran de fin
   * relancerait la saisie du prénom et ré-inscrirait la même run.
   * Remis à `false` à chaque `start()`, comme `_coinsBanked`/`_runReport`.
   */
  private _scoreHandled = false
  /**
   * Garde one-shot : les succès de la run ont déjà été versés au profil.
   *
   * ⚠️ VITALE — `commitRun` n'est PAS idempotent (c'est documenté et verrouillé
   * par test côté `src/ui/achievements.ts`) : un appel = une run terminée, donc
   * ses cumuls s'AJOUTENT. Or `getState()` tourne à 60 Hz sur l'écran de fin :
   * sans cette garde, une seconde passée sur le rapport compterait les kills de
   * la run SOIXANTE fois, et « 1000 ennemis » tomberait au premier game over.
   * Même patron que `_coinsBanked` / `_scoreHandled` — remis à `false` par `start()`.
   */
  private _achievementsBanked = false
  /**
   * Coffres ouverts sur la run courante (`ChestOpenedEvent`, non plafonné).
   * Compté ici faute de compteur dans `GameState` — l'événement est le seul
   * porteur de l'information, et il ne survit pas au pas.
   */
  private runChestsOpened = 0
  /** Évolutions d'arme de la run courante (`EvolvedEvent`, non plafonné) — même raison. */
  private runEvolutions = 0
  /** Écran des succès ouvert (consultation depuis le titre) ; `null` hors de ce flux. */
  private achievementsView: AchievementsView | null = null
  /** Écran « Évolutions d'armes » ouvert (consultation depuis la pause) ; `null` hors de ce flux. */
  private evolutionsView: EvolutionsView | null = null

  constructor(opts: AppOptions) {
    this.seed = opts.seed
    this.mode = opts.mode
    this.selectedPhase = opts.phaseId ?? ConstructionPhaseId.TERRAIN_VIERGE
    this.selectedPlayers = MODE_PLAYER_COUNT[opts.mode] ?? 1
    this.introEnabled = opts.intro ?? false
    if (opts.autostart) {
      this.start(opts.mode)
    }
  }

  // --- cycle de vie ---------------------------------------------------------

  /**
   * Démarre une nouvelle partie (depuis le titre, ou après la sélection de personnage).
   * `characters` défaut = la dernière sélection mémorisée → restart / stage suivant /
   * setSeed conservent le(s) perso(s) choisi(s) (sinon retour silencieux à l'ouvrier).
   */
  start(mode: GameMode = this.mode, characters: readonly string[] = this.selectedCharacters): void {
    this.bumpState()
    this._runReport = null
    this._coinsBanked = false
    // Flux high-scores : une nouvelle run = un nouveau score à inscrire, et aucun
    // écran de saisie/tableau en cours (sinon `screen` resterait bloqué dessus).
    this._scoreHandled = false
    this.nameEntryState = null
    this.hiScoreView = null
    // Succès : une nouvelle run = de nouveaux cumuls à verser UNE fois, et des
    // compteurs d'événements repartant de zéro (sinon la run suivante hériterait
    // des coffres/évolutions de la précédente et les compterait deux fois).
    this._achievementsBanked = false
    this.runChestsOpened = 0
    this.runEvolutions = 0
    // L'écran des succès est une surcouche du TITRE : lancer une partie le ferme
    // (sinon `screen` resterait bloqué dessus, comme pour `hiScoreView`).
    this.achievementsView = null
    // Idem pour les évolutions (surcouche de la PAUSE) : une nouvelle run repart
    // d'un inventaire vierge, une vue périmée de la run précédente n'a pas de sens.
    this.evolutionsView = null
    const wasStarted = this.started // RE-démarrage ? (partie déjà en cours)
    this.mode = mode
    this.selectedCharacters = [...characters] // persiste pour restart/stage suivant/setSeed
    this.sim = new Simulation({ seed: this.seed, mode, phaseId: this.selectedPhase, characters })
    // Relaie les événements de sim (ex. onde d'aura, libération) vers l'App → rendu.
    // Relai COMPLET : dirX/dirY (orientation des cônes — leur omission faisait pointer
    // tous les jets vers le haut) + weaponId (choix du VFX mousse vs flammes).
    this.sim.events.addEventListener('auraPulse', (e) => {
      const p = e as AuraPulseEvent
      this.events.dispatchEvent(new AuraPulseEvent(p.x, p.y, p.radius, p.kind, p.dirX, p.dirY, p.weaponId))
    })
    this.sim.events.addEventListener('prisonerFreed', (e) => {
      const p = e as PrisonerFreedEvent
      this.events.dispatchEvent(new PrisonerFreedEvent(p.x, p.y))
    })
    // Relais des événements sémantiques audio (sim → App → AudioDirector).
    this.sim.events.addEventListener('enemyKilled', (e) => {
      this.events.dispatchEvent(new EnemyKilledEvent((e as EnemyKilledEvent).count))
    })
    this.sim.events.addEventListener('enemyDied', (e) => {
      const d = e as EnemyDiedEvent
      this.events.dispatchEvent(
        new EnemyDiedEvent(d.x, d.y, d.enemyType, d.isElite, d.bossRole, d.weapon, d.dirX, d.dirY)
      )
    })
    this.sim.events.addEventListener('playerHurt', () => { this.events.dispatchEvent(new PlayerHurtEvent()) })
    this.sim.events.addEventListener('levelUp', () => { this.events.dispatchEvent(new LevelUpEvent()) })
    this.sim.events.addEventListener('weaponFired', (e) => {
      this.events.dispatchEvent(new WeaponFiredEvent((e as WeaponFiredEvent).kind))
    })
    this.sim.events.addEventListener('pickupCollected', (e) => {
      this.events.dispatchEvent(new PickupCollectedEvent((e as PickupCollectedEvent).kind))
    })
    this.sim.events.addEventListener('bossSpawned', (e) => {
      this.events.dispatchEvent(new BossSpawnedEvent((e as BossSpawnedEvent).role))
    })
    this.sim.events.addEventListener('evolved', (e) => {
      const ev = e as EvolvedEvent
      this.runEvolutions++ // cumul de run pour les succès (l'événement ne survit pas au pas)
      this.events.dispatchEvent(new EvolvedEvent(ev.weaponId, ev.playerId))
    })
    this.sim.events.addEventListener('chestOpened', (e) => {
      const ev = e as ChestOpenedEvent
      this.runChestsOpened++ // idem — les 3 issues de coffre comptent comme « ouvert »
      // GÈLE la partie le temps de la machine à sous (super = 3 rouleaux → plus long).
      this.chestRevealMsLeft = chestRevealTotalMs(ev.isSuper ? 3 : 1)
      this.events.dispatchEvent(new ChestOpenedEvent(ev.kind, ev.playerId, ev.isSuper))
    })
    this.sim.events.addEventListener('destructibleBroken', (e) => {
      const ev = e as DestructibleBrokenEvent
      this.events.dispatchEvent(new DestructibleBrokenEvent(ev.x, ev.y, ev.typeId))
    })
    // Durée du gel d'intro : cinématique complète (6.5 s) si le stage a un script
    // de montage, sinon micro-préambule héros (2 s) — cf. `introDurationFor`. En
    // test/e2e l'intro est désactivée (introEnabled=false → 0). La sim est GELÉE
    // pendant tout ce laps : la durée est cosmétique, sans effet sur le déterminisme.
    this.totalIntroMs = this.introEnabled ? introDurationFor(this.selectedPhase) : 0
    this.introMsLeft = this.totalIntroMs
    this.started = true
    // Bump SEULEMENT sur un RE-démarrage (game over→restart, stage suivant,
    // setSeed) : le rendu repart alors d'une scène propre (cf. `runId`, fuite
    // T6). La 1re partie depuis le titre n'a rien accumulé — y déclencher un
    // scene.restart interromprait le chargement à la volée du skin de perso.
    if (wasStarted) {
      this.runId++
    }
    this.refreshFocus()
  }

  /** Change la seed ; relance la partie en cours le cas échéant. */
  setSeed(seed: number): void {
    this.bumpState()
    this.seed = seed
    if (this.started) {
      this.start(this.mode)
    }
  }

  /** Relance une partie neuve (même seed). */
  restart(): void {
    this.bumpState()
    this.start(this.mode)
  }

  /** Avance le temps logique (sans effet hors écran de jeu). */
  advanceTime(ms: number): void {
    // Intro de run : on consomme le temps SANS faire avancer la sim (gel cosmétique).
    if (this.introMsLeft > 0) {
      this.introMsLeft = Math.max(0, this.introMsLeft - ms)
      this.refreshFocus()
      this.bumpState()
      return
    }
    // Ouverture de coffre : la partie est GELÉE le temps de la machine à sous (le
    // joueur regarde le spectacle sans risque). Skippable avec A (`skipChestReveal`).
    if (this.chestRevealMsLeft > 0) {
      this.chestRevealMsLeft = Math.max(0, this.chestRevealMsLeft - ms)
      this.refreshFocus()
      this.bumpState()
      return
    }
    this.sim?.advanceTime(ms)
    this.refreshFocus()
    this.bumpState()
  }

  /** Identifiant de frame courant (bumpé à chaque mutation d'état observable) — clé de `getStateForFrame`. */
  get frameId(): number {
    return this.frame
  }

  /** Incrémente le compteur de version d'état — à appeler en tête de toute méthode publique mutatrice. */
  private bumpState(): void {
    this.frame++
  }

  setInput(playerId: number, input: PlayerInput): void {
    this.bumpState()
    this.sim?.setInput(playerId, input)
  }

  // --- navigation manette/clavier ------------------------------------------

  /** Déplace le curseur dans le menu actif. */
  nav(dir: NavDir): void {
    this.bumpState()
    this.recordCombo(dir)
    this.refreshFocus()
    if (this.menuItems().length === 0) {
      return
    }
    // Sélecteur de joueurs au titre : gauche/droite changent le nombre (pas le focus).
    if (this.screen === 'title' && this.focus.current() === 'players' && (dir === 'left' || dir === 'right')) {
      this.cyclePlayers(dir === 'right' ? 1 : -1)
      this.emitUi('menuMove')
      return
    }
    // Sélecteur de niveau au titre : gauche/droite changent la phase (pas le focus).
    if (this.screen === 'title' && this.focus.current() === 'stage' && (dir === 'left' || dir === 'right')) {
      this.cycleStage(dir === 'right' ? 1 : -1)
      this.emitUi('menuMove')
      return
    }
    // Saisie du prénom : les 4 directions pilotent la GRILLE, jamais le focus
    // (un seul item). C'est ici — et pas dans `src/input` — que le vocabulaire
    // up/down/left/right prend son sens sur cet écran : `routeInput` reste sans
    // condition d'écran, ce qui garde la règle « 100 % manette » tenable.
    if (this.screen === 'nameEntry' && this.nameEntryState !== null) {
      this.nameEntryState =
        dir === 'left'
          ? moveCursor(this.nameEntryState, -1)
          : dir === 'right'
            ? moveCursor(this.nameEntryState, 1)
            : cycleChar(this.nameEntryState, dir === 'up' ? 1 : -1)
      this.emitUi('menuMove')
      return
    }
    // Carrousel de personnage : gauche/droite changent le perso (pas le focus, un seul item).
    if (this.screen === 'characterSelect' && this.focus.current() === 'char' && (dir === 'left' || dir === 'right')) {
      this.cycleCharacter(dir === 'right' ? 1 : -1)
      this.emitUi('menuMove')
      return
    }
    // Options : gauche/droite règlent le volume de l'item focalisé.
    const cur = this.focus.current()
    if (this.screen === 'options' && cur !== null && cur.startsWith('vol_') && (dir === 'left' || dir === 'right')) {
      this.adjustVolume(cur.slice(4) as 'master' | 'music' | 'sfx', dir === 'right' ? 0.1 : -0.1)
      this.emitUi('menuMove')
      return
    }
    const delta = dir === 'up' ? -1 : dir === 'down' ? 1 : dir === 'left' ? -1 : 1
    this.focus.move(delta)
    this.emitUi('menuMove')
  }

  /** Sélectionne+valide un item par index (clic souris) — passe par le focus + `activate`. */
  clickItem(index: number): void {
    this.bumpState()
    this.refreshFocus()
    const items = this.menuItems()
    if (items[index] === undefined) {
      return
    }
    this.focus.setIndex(index)
    this.activate(this.screen, items[index].id)
  }

  /**
   * Valide l'item focalisé du menu actif.
   *
   * @param byPlayers - Joueurs ayant pressé « valider » cette frame (fourni par
   * le routeur d'input). Sur l'écran d'upgrade, la carte appartient à UN joueur :
   * seul lui peut la choisir. Partout ailleurs (titre, pause, options, fin), les
   * écrans sont d'équipe et n'importe qui valide.
   *
   * Omis (`undefined`) = appel système : le seam de test et les clics souris ne
   * sont jamais filtrés.
   */
  confirm(byPlayers?: ReadonlySet<number>): void {
    this.bumpState()
    // Ouverture de coffre en cours : A SAUTE le spectacle (dégèle + ferme la machine à
    // sous). Consommé ici → ne déclenche rien d'autre. Le résultat est déjà appliqué.
    if (this.chestRevealMsLeft > 0) {
      this.chestRevealMsLeft = CHEST_SKIP_GRACE_MS
      this.chestSkipToken++
      return
    }
    // Au titre, la touche « valider » peut compléter le code Konami : on la consomme alors.
    if (this.recordCombo('confirm')) {
      return
    }
    if (!this.mayConfirm(byPlayers)) {
      return
    }
    this.refreshFocus()
    const id = this.focus.current()
    if (id === null) {
      return
    }
    this.activate(this.screen, id)
  }

  /** Vrai si ce « valider » a le droit d'agir sur l'écran courant. */
  private mayConfirm(byPlayers?: ReadonlySet<number>): boolean {
    if (byPlayers === undefined || this.screen !== 'upgrade') {
      return true
    }
    const owner = this.sim?.getState().pendingLevelUp?.playerId
    // Propriétaire inconnu : on ne bloque pas (on ne rend pas l'écran injouable
    // sur un état inattendu — le soft-lock serait pire que le partage).
    return owner === undefined || byPlayers.has(owner)
  }

  /** Retour / annulation, selon l'écran. */
  back(): void {
    this.bumpState()
    this.recordCombo('back')
    if (this.optionsOpen) {
      this.optionsOpen = false
      this.emitUi('menuBack')
      this.refreshFocus()
      return
    }
    switch (this.screen) {
      case 'game':
        this.sim?.pause()
        break
      case 'paused':
        this.sim?.resume()
        break
      case 'gameover':
        this.started = false
        break
      case 'nameEntry':
        // « B » EFFACE la case, il ne quitte PAS l'écran : quitter par réflexe
        // ferait perdre la saisie (et le score, qu'on ne peut plus inscrire).
        if (this.nameEntryState !== null) {
          this.nameEntryState = clearChar(this.nameEntryState)
        }
        break
      case 'hiscores':
        // Le tableau est consultatif : « B » en sort comme « Retour ».
        this.hiScoreView = null
        break
      case 'achievements':
        // Consultatif lui aussi : « B » revient au titre, comme « Retour ».
        this.achievementsView = null
        break
      case 'evolutions':
        // Consultatif : « B » revient à la pause, comme « Retour ».
        this.evolutionsView = null
        break
      case 'characterSelect':
        if (this.charSelectPlayer > 1) {
          this.charSelectPlayer--
          this.selectedCharacters.pop()
          this.charCursor = 0
        } else {
          this.charSelectOpen = false
        }
        break
      default:
        break // titre / upgrade : pas de retour
    }
    this.emitUi('menuBack')
    this.refreshFocus()
  }

  /** Met en pause (depuis le jeu). */
  pause(): void {
    this.bumpState()
    this.sim?.pause()
    this.refreshFocus()
  }

  /** Reprend (depuis la pause). */
  resume(): void {
    this.bumpState()
    this.sim?.resume()
    this.refreshFocus()
  }

  /** Saute l'intro (fin du gel) — câblée sur toute entrée pendant l'intro. */
  skipIntro(): void {
    if (this.introMsLeft <= 0) { return }
    this.introMsLeft = 0
    this.refreshFocus()
    this.bumpState()
  }

  /** Bascule pause/reprise (touche dédiée). */
  togglePause(): void {
    this.bumpState()
    if (this.screen === 'game') {
      this.sim?.pause()
    } else if (this.screen === 'paused') {
      this.sim?.resume()
    }
    this.refreshFocus()
  }

  /** Bascule l'affichage de la mini-carte (touche M / bouton Back/Select). Purement UI. */
  toggleMinimap(): void {
    this.minimapVisible = !this.minimapVisible
    this.bumpState()
  }

  /** Choisit une carte d'upgrade par index (API directe pour le seam). */
  chooseUpgrade(index: number): void {
    this.bumpState()
    this.sim?.chooseUpgrade(index)
    this.refreshFocus()
  }

  // --- helpers de debug (test-only — passe-plat vers Simulation pour le seam) ---

  /**
   * [Debug/seam] Octroie directement des armes/passifs à un joueur (1 par
   * défaut). Réservé aux tests et au seam de debug (`window.__GAME__`) —
   * jamais en jeu normal.
   */
  debugGrant(
    opts: { weapons?: { id: string; level: number }[]; passives?: { id: string; level: number }[] },
    playerId = 1
  ): void {
    this.bumpState()
    this.sim?.debugGrant(opts, playerId)
    this.refreshFocus()
  }

  /** [Debug/seam] Ajoute de l'XP au joueur 1 (force un level-up déterministe). */
  debugAddXp(amount: number, playerId = 1): void {
    this.bumpState()
    this.sim?.debugAddXp(amount, playerId)
    this.refreshFocus()
  }

  /**
   * Le rendu publie ici son bilan Carnage (il seul sait combien de flaques il a
   * posées). Appelé chaque frame pendant la run : le rapport de fin est figé une
   * fois, donc ce qui n'est pas remonté AVANT la mort est perdu.
   */
  reportCarnage(stats: { pools: number; criticals: number; surfaceM2: number }): void {
    this.carnageStats = stats
  }

  /** [Debug/seam] Bascule le Mode Carnage sans rejouer le Konami. */
  debugCarnage(on: boolean): void {
    this.bumpState()
    this.carnage = on
  }

  /**
   * [Debug/seam] Débloque le casque doré.
   *
   * Le Konami donne maintenant le Carnage : sans ce helper, toute la chaîne de
   * rendu du skin doré (`player_gold`, `walkTextureKey`…) deviendrait du code
   * mort intestable en attendant son nouveau déclencheur.
   */
  debugUnlockGold(): void {
    this.bumpState()
    this.goldSkin = true
  }

  /**
   * [Debug/seam] Simule « le joueur N presse VALIDER ».
   *
   * `confirm()` du seam est un appel système, jamais filtré — il ne peut donc pas
   * tester le verrou de propriété des cartes de level-up. Ce helper passe par le
   * même chemin que le routeur d'input (un ensemble d'ids), ce qui rend le verrou
   * vérifiable en e2e.
   */
  debugConfirmAs(playerId: number): void {
    this.confirm(new Set([playerId]))
  }

  /** [Debug/seam] Audition d'un SFX d'arme (procédural) : rejoue weaponFired(id) → zzfx. */
  debugPlayWeaponSfx(id: string): void {
    this.events.dispatchEvent(new WeaponFiredEvent(id))
  }

  /** [Debug/seam] Fait apparaître un coffre d'évolution sur la position d'un joueur (1 par défaut). */
  debugSpawnChestOnPlayer(playerId = 1): void {
    this.bumpState()
    this.sim?.debugSpawnChestOnPlayer(playerId)
    this.refreshFocus()
  }

  /** [Debug/seam] Fait apparaître immédiatement le boss du rôle demandé (`mid`/`final`). */
  debugSpawnBoss(role: 'mid' | 'final'): void {
    this.bumpState()
    this.sim?.debugSpawnBoss(role)
    this.refreshFocus()
  }

  /**
   * [Debug/seam] Fait apparaître `n` ennemis autour des joueurs (stress test horde).
   * `radius` optionnel (test-only) : spawn à ce rayon autour du joueur (à portée d'arme).
   */
  debugSpawnEnemies(n: number, radius?: number): void {
    this.bumpState()
    this.sim?.debugSpawnEnemies(n, radius)
  }

  /**
   * [Debug/seam] Met les PV de tous les joueurs à 0 → game-over au prochain pas.
   * Permet d'atteindre l'écran de mort de façon déterministe dans les tests e2e.
   * Réservé aux tests et au seam de debug — jamais appelé en jeu normal.
   */
  debugKillPlayer(playerId?: number): void {
    this.bumpState()
    this.sim?.debugKillPlayer(playerId)
  }

  /**
   * [Debug/seam] Libère + enrage l'otage le plus proche du joueur (le téléporte au
   * joueur). Indispensable pour tester la mécanique d'allié en headless (les otages
   * spawnent loin). Réservé aux tests et au seam — jamais en jeu normal.
   */
  debugEnragePrisoner(playerId = 1): void {
    this.bumpState()
    this.sim?.debugEnragePrisoner(playerId)
  }

  // --- état exposé ----------------------------------------------------------

  /**
   * Enregistre une action au titre pour détecter le code Konami. Renvoie true si
   * la séquence vient d'être complétée à cet appel (le débloquage doit consommer
   * la touche pour ne pas déclencher aussi l'item de menu focalisé).
   */
  /**
   * Alimente le code Konami. Renvoie vrai si le code vient d'être complété — auquel
   * cas `confirm()` consomme la touche (sinon le « A » final lancerait la partie).
   *
   * Le code BASCULE le Mode Carnage : le rejouer le désactive (brief §3.3). D'où
   * la disparition de la garde « une seule fois » qui existait pour le casque doré.
   *
   * ⚠️ Limite assumée : la saisie n'est possible qu'AU TITRE. Le buffer est
   * alimenté par les intents de menu (`nav`/`back`/`confirm`), qui n'existent pas
   * en jeu ; et sur l'écran de pause, le « B » de la séquence reprendrait la
   * partie. On active/désactive donc avant de lancer, pas en cours de run.
   */
  private recordCombo(action: ComboAction): boolean {
    if (this.screen !== 'title') {
      return false
    }
    this.comboBuffer.push(action)
    if (this.comboBuffer.length > KONAMI.length) {
      this.comboBuffer.shift()
    }
    if (this.comboBuffer.length === KONAMI.length && KONAMI.every((a, i) => this.comboBuffer[i] === a)) {
      this.carnage = !this.carnage
      this.comboBuffer = []
      return true
    }
    return false
  }

  getState(): AppViewState {
    this.refreshFocus()
    const base = this.sim?.getState() ?? emptyState(this.seed, this.selectedPhase)
    const screen = this.screen
    // Monnaie méta : à la fin d'un run (mort OU victoire), verse les pièces du run
    // au total persistant (localStorage), une seule fois. Réinitialisé au (re)start.
    if ((screen === 'gameover' || screen === 'victory') && !this._coinsBanked) {
      addMetaCoins(base.coins)
      this._coinsBanked = true
    }
    const phase = ORDERED_PHASES.find((p) => (p.id as string) === base.stageId)
    // Rapport de fin figé : UNE SEULE FOIS à l'entrée de l'écran de fin, pour les
    // DEUX issues. La victoire est un chantier LIVRÉ → progression 100 %, 0 s restante.
    if ((screen === 'gameover' || screen === 'victory') && this._runReport === null) {
      const victory = screen === 'victory'
      const stageDurationMs = FINAL_BOSS.atMs
      const elapsedMs = base.elapsedMs
      const progressRatio = victory ? 1 : Math.max(0, Math.min(elapsedMs / stageDurationMs, 1))
      const flawless = base.players.every((p) => p.alive)
      // Une arme évoluée remplace son id in-place et DÉFINITIVEMENT pour la run
      // (cf. tryEvolve) : l'id évolué présent dans le loadout est donc la preuve
      // durable de l'évolution. `justEvolved` ne conviendrait pas — il est
      // one-shot et remis à null au pas suivant.
      const evolvedAny = base.players.some((p) =>
        p.weapons.some((id) => EVOLUTIONS.some((e) => e.evolved === id))
      )
      const podiumPick = selectPodium(base.players.map((p) => ({ id: p.id, kills: p.kills })))
      this._runReport = {
        outcome: victory ? 'victory' : 'defeat',
        stageTitle: phase?.title ?? '—',
        elapsedMs,
        stageDurationMs,
        progressRatio,
        progressPercent: Math.floor(progressRatio * 100),
        remainingSeconds: victory
          ? 0
          : Math.max(0, Math.floor(stageDurationMs / 1000) - Math.floor(elapsedMs / 1000)),
        kills: base.score,
        // Score de CLASSEMENT (≠ kills) : figé ici avec le reste du rapport, donc
        // stable entre deux `getState()` — c'est lui qu'on compare au tableau.
        runScore: computeRunScore({
          kills: base.score,
          elapsedMs,
          level: base.players[0]?.level ?? 1,
          coins: base.coins,
          outcome: victory ? 'victory' : 'defeat'
        }),
        coins: base.coins,
        level: base.players[0]?.level ?? 1,
        perPlayer: base.players.map((p) => ({ id: p.id, kills: p.kills, level: p.level, alive: p.alive })),
        // `Math.random` AUTORISÉ ici (composition root, hors src/core) — le roll est figé
        // avec le rapport, donc la phrase ne change pas d'une frame à l'autre.
        quote: victory
          ? selectVictoryQuote({ roll: Math.random(), flawless })
          : selectDeathQuote({
              elapsedSeconds: Math.floor(elapsedMs / 1000),
              stageDurationSeconds: stageDurationMs / 1000,
              roll: Math.random()
            }),
        stars: computeStars({
          victory,
          evolvedAny,
          // Note COLLECTIVE : les prisonniers sont un compteur d'équipe.
          rescuedAll: base.rescue.rescued >= base.rescue.total
        }),
        evolvedAny,
        rescued: base.rescue.rescued,
        rescueTotal: base.rescue.total,
        podium:
          podiumPick === null
            ? null
            : {
                ...podiumPick,
                praise: selectPraiseQuote({ roll: Math.random() }),
                mock: selectMockQuote({ roll: Math.random() })
              },
        // Bilan Carnage : `null` si le mode n'a jamais été activé — le rapport
        // n'en souffle alors pas un mot, le secret reste un secret.
        carnage: this.carnageStats
      }
      // HI-SCORE de l'écran titre : meilleur score TOUS stages confondus. Écrit
      // ici, sous la même garde one-shot que le rapport (`getState` tourne à
      // 60 Hz) et seulement s'il bat l'ancien — `writeHiScore` n'a aucun garde-fou
      // et écrase à l'aveugle. Sans cet appel, la barre du titre était figée à
      // « 000000 » : `writeHiScore` n'avait AUCUN appelant en production.
      if (this._runReport.runScore > readHiScore()) {
        writeHiScore(this._runReport.runScore)
      }
    }
    // Succès : verse les compteurs de la run au profil, UNE SEULE FOIS (cf.
    // `_achievementsBanked` — `commitRun` n'est pas idempotent et `getState`
    // tourne à 60 Hz). Les ids nouvellement débloqués partent en ÉVÉNEMENT, pas
    // dans l'état : un one-shot porté par l'état serait consommé par le premier
    // `getState()` venu (le seam, typiquement) et le trophée ne s'afficherait
    // jamais (cf. [[achievementBridge]]).
    if ((screen === 'gameover' || screen === 'victory') && !this._achievementsBanked) {
      this._achievementsBanked = true
      for (const id of commitRun(this.runProgress(base, screen === 'victory'))) {
        this.events.dispatchEvent(new AchievementUnlockedEvent(id))
      }
    }
    return {
      ...base,
      scene: base.scene,
      players: base.players.map((p) => ({ ...p, inventory: buildInventory(p) })),
      screen,
      menu: this.menu(screen),
      goldSkin: this.goldSkin,
      carnage: this.carnage,
      runId: this.runId,
      introActive: this.introMsLeft > 0,
      introElapsedMs: Math.max(0, this.totalIntroMs - this.introMsLeft),
      stageTitle: phase?.title ?? '—',
      stageSubtitle: phase?.subtitle ?? '',
      stageOrder: phase?.order ?? 0,
      characterSelect: this.charSelectOpen
        ? { player: this.charSelectPlayer, total: this.selectedPlayers, charId: this.rosterIds()[this.charCursor] ?? DEFAULT_CHARACTER_ID }
        : null,
      // Saisie du prénom : les index d'alphabet sont résolus ICI en caractères —
      // l'overlay affiche, il n'interprète pas.
      nameEntry:
        this.nameEntryState === null
          ? null
          : {
              chars: this.nameEntryState.chars.map((i) => NAME_ENTRY_ALPHABET[i] ?? ' '),
              cursor: this.nameEntryState.cursor,
              name: nameOf(this.nameEntryState),
              score: this._runReport?.runScore ?? 0,
              stageTitle: this._runReport?.stageTitle ?? '—'
            },
      hiScores: this.hiScoreView === null ? null : { ...this.hiScoreView, entries: [...this.hiScoreView.entries] },
      achievements:
        this.achievementsView === null
          ? null
          : { ...this.achievementsView, entries: [...this.achievementsView.entries] },
      evolutions:
        this.evolutionsView === null
          ? null
          : { ...this.evolutionsView, entries: [...this.evolutionsView.entries] },
      minimapVisible: this.minimapVisible,
      chestSkipToken: this.chestSkipToken,
      justEvolvedWeaponName:
        base.justEvolved !== null
          ? (WEAPONS[base.justEvolved]?.name ?? base.justEvolved)
          : null,
      chestOpen:
        base.chestOpened !== null
          ? {
              isSuper: base.chestOpened.isSuper,
              results: base.chestOpened.results.map((r) => ({
                kind: r.kind,
                weaponId: r.weaponId !== '' ? r.weaponId : null,
                weaponName: r.weaponId !== '' ? (WEAPONS[r.weaponId]?.name ?? r.weaponId) : null,
                level: r.level ?? null
              }))
            }
          : null,
      runReport: screen === 'gameover' || screen === 'victory' ? this._runReport : null
    }
  }

  /**
   * Variante mise en cache de `getState()`, clée sur un numéro de frame : plusieurs
   * appels avec le même `frame` renvoient la MÊME référence (rendu/overlay/audio
   * mutualisent un seul `AppViewState`). `getState()` reste inchangé (toujours frais).
   */
  getStateForFrame(frame: number): AppViewState {
    if (frame === this.cachedFrame && this.cachedState !== null) {
      return this.cachedState
    }
    this.cachedState = this.getState()
    this.cachedFrame = frame
    return this.cachedState
  }

  renderToText(): string {
    const s = this.getState()
    if (s.menu !== null) {
      const items = s.menu.items
        .map((it, i) => (i === s.menu?.index ? `[${it.label}]` : it.label))
        .join('  ')
      return `écran=${s.screen}\n${items}`
    }
    return this.sim?.renderToText() ?? `écran=${s.screen}`
  }

  // --- interne --------------------------------------------------------------

  /** Écran courant, dérivé de l'état de la simulation (Options = surcouche prioritaire). */
  private get screen(): Screen {
    if (this.optionsOpen) {
      return 'options'
    }
    // Surcouches de fin de run (saisie du prénom → tableau) : elles s'empilent
    // AU-DESSUS du rapport, qui reste l'écran de fin (la sim est toujours en
    // `gameover`/`won` dessous). En sortir rend la main au rapport.
    if (this.hiScoreView !== null) {
      return 'hiscores'
    }
    // Surcouche du TITRE (jamais ouverte en run) : la remettre à `null` rend la
    // main au titre, `started` étant faux — aucun câblage de plus.
    if (this.achievementsView !== null) {
      return 'achievements'
    }
    // Surcouche de la PAUSE (contrairement aux succès) : s'ouvre pendant une run,
    // cette zone du getter s'évalue avant le test `!this.started` donc ça marche
    // sans câblage supplémentaire.
    if (this.evolutionsView !== null) {
      return 'evolutions'
    }
    if (this.nameEntryState !== null) {
      return 'nameEntry'
    }
    if (this.charSelectOpen && !this.started) {
      return 'characterSelect'
    }
    if (!this.started || this.sim === null) {
      return 'title'
    }
    const st = this.sim.getState()
    if (st.scene === 'gameover') {
      return 'gameover'
    }
    if (st.scene === 'won') {
      return 'victory'
    }
    if (st.scene === 'paused') {
      return 'paused'
    }
    if (st.pendingLevelUp !== null) {
      return 'upgrade'
    }
    return 'game'
  }

  /** Items de menu pour l'écran courant. */
  private menuItems(): MenuItemView[] {
    switch (this.screen) {
      case 'title':
        return this.titleItems()
      case 'characterSelect':
        return this.characterSelectItems()
      case 'paused':
        return PAUSE_ITEMS
      case 'gameover':
        return GAMEOVER_ITEMS
      case 'victory':
        return this.victoryItems()
      case 'upgrade':
        return this.upgradeItems()
      case 'options':
        return this.optionsItems()
      case 'nameEntry':
        return this.nameEntryItems()
      case 'hiscores':
        return HISCORES_ITEMS
      case 'achievements':
        return ACHIEVEMENTS_ITEMS
      case 'evolutions':
        return EVOLUTIONS_ITEMS
      default:
        return []
    }
  }

  /**
   * Item UNIQUE de l'écran de saisie : la grille de lettres n'est PAS une liste
   * de menu (elle se pilote par `nav`, cf. [[nameEntry]]) — le `FocusModel` est
   * donc trivial, et il n'y a rien à scroller. Le libellé porte le nom en cours
   * pour que `renderToText()` le donne au seam (jeu « à l'aveugle »).
   */
  private nameEntryItems(): MenuItemView[] {
    const name = this.nameEntryState === null ? '' : nameOf(this.nameEntryState)
    return [
      {
        id: 'nom',
        label: name,
        hint: 'Gauche/Droite : case · Haut/Bas : lettre · A : valider · B : effacer'
      }
    ]
  }

  /** Écran Options : volumes (◄/►) + mute + retour. */
  private optionsItems(): MenuItemView[] {
    const a = this.audioLevels
    const pct = (v: number): string => `${Math.round(v * 100)}%`
    return [
      { id: 'vol_master', label: `◄ Volume général : ${pct(a.master)} ►`, hint: 'Gauche/Droite pour régler' },
      { id: 'vol_music', label: `◄ Musique : ${pct(a.music)} ►`, hint: 'Gauche/Droite pour régler' },
      { id: 'vol_sfx', label: `◄ Effets : ${pct(a.sfx)} ►`, hint: 'Gauche/Droite pour régler' },
      { id: 'mute', label: `Son : ${a.muted ? 'COUPÉ' : 'activé'}`, hint: 'Valider pour basculer' },
      { id: 'vibrations', label: `Vibrations : ${this.vibrationsEnabled ? 'activées' : 'désactivées'}`, hint: 'Valider pour basculer' },
      { id: 'retour', label: 'Retour', hint: null }
    ]
  }

  /** Réglage vibrations courant (lu par le Rumbler, câblé dans main.ts). */
  getVibrations(): boolean {
    return this.vibrationsEnabled
  }

  /** Niveaux audio courants (lus par l'AudioDirector). */
  getAudioLevels(): AudioLevels {
    return { ...this.audioLevels }
  }

  private adjustVolume(kind: 'master' | 'music' | 'sfx', delta: number): void {
    this.audioLevels = { ...this.audioLevels, [kind]: clamp01(this.audioLevels[kind] + delta) }
    saveAudioSettings(this.audioLevels)
    this.events.dispatchEvent(new Event('audioSettings'))
    this.refreshFocus()
  }

  /** Émet un SFX d'UI (navigation/valider/annuler) — écouté par l'AudioDirector. */
  private emitUi(name: string): void {
    this.events.dispatchEvent(new Event(name))
  }

  /** Écran de victoire : passer au stage suivant (sauf dernier) ou revenir au titre. */
  private victoryItems(): MenuItemView[] {
    const i = ORDERED_PHASES.findIndex((p) => p.id === this.selectedPhase)
    const hasNext = i >= 0 && i < ORDERED_PHASES.length - 1
    const items: MenuItemView[] = []
    if (hasNext) {
      items.push({ id: 'stage_suivant', label: 'Stage suivant', hint: null })
    }
    items.push({ id: 'titre', label: 'Menu titre', hint: null })
    return items
  }

  /** Items du titre : Jouer, sélecteur de joueurs (◄/►), sélecteur de niveau (◄/►), Scores, Options. */
  private titleItems(): MenuItemView[] {
    const phase = ORDERED_PHASES.find((p) => p.id === this.selectedPhase)
    return [
      { id: 'jouer', label: 'Jouer', hint: null },
      { id: 'players', label: `◄ Joueurs : ${this.selectedPlayers} ►`, hint: 'Gauche/Droite pour changer' },
      { id: 'stage', label: `◄ Niveau ${phase?.order ?? 1}/10 : ${phase?.title ?? '—'} ►`, hint: 'Gauche/Droite pour changer' },
      // Placé JUSTE SOUS le sélecteur de niveau : le tableau affiché est celui du
      // niveau sélectionné ci-dessus (les classements sont par stage). L'adjacence
      // porte le lien — c'est ce qui dispense l'écran `hiscores` d'un 2e sélecteur.
      { id: 'scores', label: 'Scores', hint: 'Tableau du niveau sélectionné' },
      // Voisin de « Scores » : les deux consultent le palmarès du joueur. Les
      // succès, eux, sont GLOBAUX (aucun `stageId` dans le catalogue) — ils ne
      // dépendent pas du sélecteur de niveau juste au-dessus.
      { id: 'succes', label: 'Succès', hint: 'Trophées débloqués' },
      { id: 'options', label: 'Options', hint: null },
      { id: 'editeur', label: 'Éditeur de niveaux', hint: 'Créer / modifier un stage' }
    ]
  }

  /**
   * Ouvre le tableau des scores du niveau SÉLECTIONNÉ au titre, en consultation.
   *
   * Réutilise tel quel l'écran `hiscores` du flux de fin de run : `screen` le
   * dérive déjà de `hiScoreView`, et `back()`/« Retour » le remettent à `null` →
   * on retombe sur le titre (`started === false`) sans câblage supplémentaire.
   *
   * `rank: -1` = aucune ligne en surbrillance : on consulte, on ne vient pas de
   * s'inscrire. Le tableau peut être vide (profil neuf) — le panneau le dit.
   */
  private openHiScores(): void {
    const phase = ORDERED_PHASES.find((p) => p.id === this.selectedPhase)
    this.hiScoreView = {
      stageId: this.selectedPhase,
      stageTitle: phase?.title ?? '—',
      entries: readHiScores(this.selectedPhase),
      rank: -1
    }
  }

  /**
   * Compteurs de LA RUN qui vient de finir, prêts à être fusionnés au profil.
   *
   * Chaque champ suit la nature documentée dans `src/content/achievements.ts` —
   * les `MEILLEURE RUN` livrent la valeur BRUTE de la run (`mergeProgress` en
   * prendra le `max`), les `CUMUL PROFIL` livrent le delta de cette run (il sera
   * ADDITIONNÉ). Ne rien deviner ici : additionner un record débloquerait
   * « tenir 10 minutes » avec dix runs d'une minute.
   *
   * Aucune source plafonnée : `score` et `bossKills` sont des cumuls de `GameState`,
   * `rescue.rescued` un compteur de sim, coffres/évolutions des cumuls d'App
   * alimentés par des événements non bornés. Zéro `EnemyDiedEvent` (cf. l'en-tête
   * de `src/content/achievements.ts`).
   */
  private runProgress(base: GameState, victory: boolean): AchievementProgress {
    return {
      // CUMUL PROFIL — `score` EST le compteur de kills cumulé de la run.
      kills: base.score,
      bossKills: base.bossKills,
      chestsOpened: this.runChestsOpened,
      weaponEvolutions: this.runEvolutions,
      prisonersFreed: base.rescue.rescued,
      // Un chantier livré par run gagnée, zéro sinon.
      stagesCompleted: victory ? 1 : 0,
      // MEILLEURE RUN — valeurs brutes de CETTE run ; le profil en gardera le max.
      bestSurvivalMs: base.elapsedMs,
      bestLevel: base.players.reduce((max, p) => Math.max(max, p.level), 0)
    }
  }

  /**
   * Ouvre l'écran des succès (consultation depuis le titre) : croise le catalogue
   * avec le profil persisté. Figé à l'ouverture — le profil ne bouge pas pendant
   * qu'on le regarde, et on évite de relire `localStorage` à 60 Hz.
   *
   * Les succès VERROUILLÉS restent dans la liste (grisés) : le joueur doit voir
   * ce qu'il lui reste à faire (même doctrine que `starRow`).
   */
  private openAchievements(): void {
    const unlocked = readUnlocked()
    const entries = ACHIEVEMENTS.map((def) => ({
      id: def.id,
      label: def.label,
      description: def.description,
      icon: def.icon ?? null,
      unlocked: unlocked.has(def.id)
    }))
    this.achievementsView = {
      entries,
      unlockedCount: entries.filter((e) => e.unlocked).length
    }
  }

  /**
   * Ouvre l'écran « Évolutions d'armes » (pause) : croise le catalogue `EVOLUTIONS`
   * avec l'inventaire courant de TOUS les joueurs (union, cohérent avec un menu
   * pause global plutôt que par-joueur — prêt-N-joueurs). Ne liste que les
   * évolutions dont la forme de base OU évoluée est déjà possédée par au moins un
   * joueur — « armes déjà acquises », pas un almanach complet (le jeu n'a pas de
   * méta-progression). Figé à l'ouverture, comme les succès.
   */
  private openEvolutionsView(): void {
    const players = this.sim?.getState().players ?? []
    const entries: EvolutionEntryView[] = []
    for (const evo of EVOLUTIONS) {
      let owned: { id: string; level: number } | null = null
      for (const p of players) {
        const i = p.weapons.indexOf(evo.evolved)
        if (i >= 0) {
          owned = { id: evo.evolved, level: p.weaponLevels[i] ?? 1 }
          break
        }
      }
      if (owned === null) {
        for (const p of players) {
          const i = p.weapons.indexOf(evo.base)
          if (i >= 0) {
            owned = { id: evo.base, level: p.weaponLevels[i] ?? 1 }
            break
          }
        }
      }
      if (owned === null) {
        continue
      }
      entries.push({
        weaponId: owned.id,
        weaponName: WEAPONS[owned.id]?.name ?? owned.id,
        weaponLevel: owned.level,
        reqBaseLevel: evo.reqBaseLevel,
        evolvedName: WEAPONS[evo.evolved]?.name ?? evo.evolved,
        passiveId: evo.passive,
        passiveName: PASSIVES[evo.passive]?.name ?? evo.passive,
        evolved: owned.id === evo.evolved
      })
    }
    this.evolutionsView = {
      entries,
      evolvedCount: entries.filter((e) => e.evolved).length
    }
  }

  /** Liste des ids du roster de personnages, dans l'ordre stable déclaré. */
  private rosterIds(): readonly string[] {
    return CHARACTER_IDS
  }

  /** Item unique du carrousel de sélection de personnage (◄ Nom — Arme ►). */
  private characterSelectItems(): MenuItemView[] {
    const ids = this.rosterIds()
    const char = characterDef(ids[this.charCursor] ?? DEFAULT_CHARACTER_ID)
    const weaponName = WEAPONS[char.startingWeapon]?.name ?? char.startingWeapon
    return [
      { id: 'char', label: `◄ ${char.name} — ${weaponName} ►`, hint: 'Gauche/Droite • A: valider' }
    ]
  }

  /** Décale le curseur de roster de `step` (cycle) — carrousel de sélection de personnage. */
  private cycleCharacter(step: number): void {
    const ids = this.rosterIds()
    const n = ids.length
    if (n === 0) {
      return
    }
    this.charCursor = (((this.charCursor + step) % n) + n) % n
    this.refreshFocus()
  }

  /** Décale la phase sélectionnée de `step` (cycle) — sélecteur de niveau du titre. */
  private cycleStage(step = 1): void {
    const n = ORDERED_PHASES.length
    const i = ORDERED_PHASES.findIndex((p) => p.id === this.selectedPhase)
    const next = (((i + step) % n) + n) % n
    this.selectedPhase = ORDERED_PHASES[next]?.id ?? this.selectedPhase
    this.refreshFocus()
  }

  /** Change le nombre de joueurs sélectionné de `step`, borné à [1,4] (pas de cycle) — sélecteur du titre. */
  private cyclePlayers(step: number): void {
    this.selectedPlayers = Math.min(4, Math.max(1, this.selectedPlayers + step))
    this.refreshFocus()
  }

  private upgradeItems(): MenuItemView[] {
    const simState = this.sim?.getState() ?? null
    const pending = simState?.pendingLevelUp ?? null
    if (pending === null) {
      return []
    }
    // Résoudre les stats passifs du joueur concerné par le level-up.
    const player = simState?.players.find((p) => p.id === pending.playerId)
    const playerStats = aggregatePassives(player?.passives ?? [])
    return pending.choices.map((c) => {
      const item: MenuItemView = {
        id: c.id,
        label: c.name,
        hint: c.hint,
        description: c.description,
        currentLevel: c.currentLevel,
        maxLevel: c.maxLevel,
        kind: c.kind
      }
      if (c.kind === 'weapon-up') {
        const delta = describeWeaponLevelDelta(c.id, c.currentLevel, c.currentLevel + 1, playerStats)
        if (delta !== '') {
          item.delta = delta
        }
      }
      return item
    })
  }

  /** Stage de la run qui vient de finir (le classement est PAR stage). */
  private runStageId(): string {
    return this.sim?.getState().stageId ?? this.selectedPhase
  }

  /**
   * Ouvre la saisie du prénom si le score de la run entre au tableau du stage.
   * Renvoie `true` si l'écran s'est ouvert (l'appelant doit alors s'arrêter là).
   *
   * `_scoreHandled` est une garde one-shot par run : sans elle, chaque validation
   * sur l'écran de fin rouvrirait la saisie et permettrait d'inscrire la même run
   * autant de fois qu'on presse « A ».
   */
  private maybeStartNameEntry(): boolean {
    if (this._scoreHandled || this.nameEntryState !== null) {
      return false
    }
    const report = this._runReport
    if (report === null) {
      return false
    }
    if (!qualifies(this.runStageId(), report.runScore)) {
      this._scoreHandled = true // score trop faible : on ne re-teste pas à chaque « A »
      return false
    }
    this.nameEntryState = emptyNameEntry()
    this.refreshFocus()
    return true
  }

  /**
   * Valide le prénom saisi : inscrit la run au tableau du stage et affiche le
   * classement, ligne du joueur en surbrillance. `_scoreHandled` verrouille
   * l'inscription : re-presser « A » ne crée pas de doublon.
   *
   * Un nom laissé vide est accepté (l'arcade n'a jamais bloqué personne sur la
   * saisie) et retombe sur un libellé par défaut.
   */
  private submitName(): void {
    const state = this.nameEntryState
    const report = this._runReport
    if (state === null || report === null || this._scoreHandled) {
      return
    }
    const stageId = this.runStageId()
    const typed = nameOf(state)
    const entry: HiScoreEntry = {
      name: typed === '' ? 'ANONYME' : typed,
      score: report.runScore,
      kills: report.kills,
      elapsedMs: report.elapsedMs,
      level: report.level
    }
    const rank = insertHiScore(stageId, entry)
    this._scoreHandled = true
    this.nameEntryState = null
    this.hiScoreView = {
      stageId,
      stageTitle: report.stageTitle,
      entries: readHiScores(stageId),
      rank
    }
    this.refreshFocus()
  }

  private menu(screen: Screen): MenuView | null {
    const items = this.menuItems()
    if (items.length === 0) {
      return null
    }
    // Seul l'écran d'upgrade appartient à UN joueur ; les autres sont d'équipe.
    const playerId = screen === 'upgrade' ? this.sim?.getState().pendingLevelUp?.playerId : undefined
    return { screen, items, index: this.focus.index, ...(playerId === undefined ? {} : { playerId }) }
  }

  /** Recale le modèle de focus quand l'identité du menu change. */
  private refreshFocus(): void {
    const items = this.menuItems()
    const key = this.screen === 'upgrade' ? `upgrade:${items.map((i) => i.id).join(',')}` : this.screen
    if (key !== this.focusKey) {
      this.focus.setItems(items.map((i) => i.id))
      this.focusKey = key
    }
  }

  /** Exécute l'action d'un item de menu. */
  private activate(screen: Screen, id: string): void {
    this.emitUi(screen === 'upgrade' ? 'upgradePick' : 'menuConfirm')
    if (screen === 'options') {
      if (id === 'mute') {
        this.audioLevels = { ...this.audioLevels, muted: !this.audioLevels.muted }
        saveAudioSettings(this.audioLevels)
        this.events.dispatchEvent(new Event('audioSettings'))
      } else if (id === 'vibrations') {
        this.vibrationsEnabled = !this.vibrationsEnabled
        saveHaptics(this.vibrationsEnabled)
        // Le Rumbler (câblé dans main.ts) écoute cet événement et se (dés)active.
        this.events.dispatchEvent(new Event('inputSettings'))
      } else if (id === 'retour') {
        this.optionsOpen = false
      }
      this.refreshFocus()
      return
    }
    if (screen === 'paused') {
      if (id === 'reprendre') {
        this.sim?.resume()
      } else if (id === 'evolutions') {
        this.openEvolutionsView()
      } else if (id === 'options') {
        this.optionsOpen = true
      } else if (id === 'recommencer') {
        this.restart()
      } else if (id === 'quitter') {
        this.started = false
      }
      this.refreshFocus()
      return
    }
    if (screen === 'title') {
      if (id === 'jouer') {
        this.charSelectOpen = true
        this.charSelectPlayer = 1
        this.selectedCharacters = []
        this.charCursor = 0
      } else if (id === 'players') {
        this.cyclePlayers(1)
      } else if (id === 'stage') {
        this.cycleStage()
      } else if (id === 'scores') {
        this.openHiScores()
      } else if (id === 'succes') {
        this.openAchievements()
      } else if (id === 'options') {
        this.optionsOpen = true
      } else if (id === 'editeur') {
        // L'ouverture de l'éditeur est un effet de bord `window.location` (boot
        // séparé `?editor=true`) → l'App PURE se contente d'émettre ; `main.ts` réagit.
        this.events.dispatchEvent(new Event('launchEditor'))
      }
      this.refreshFocus()
      return
    }
    if (screen === 'characterSelect') {
      if (id === 'char') {
        const chosen = this.rosterIds()[this.charCursor] ?? DEFAULT_CHARACTER_ID
        this.selectedCharacters[this.charSelectPlayer - 1] = chosen
        if (this.charSelectPlayer < this.selectedPlayers) {
          this.charSelectPlayer++
          this.charCursor = 0
        } else {
          this.charSelectOpen = false
          this.start(modeForCount(this.selectedPlayers), this.selectedCharacters)
        }
      }
      this.refreshFocus()
      return
    }
    if (screen === 'nameEntry') {
      if (id === 'nom') {
        this.submitName()
      }
      this.refreshFocus()
      return
    }
    if (screen === 'hiscores') {
      if (id === 'retour') {
        this.hiScoreView = null // → retour au rapport de fin de run
      }
      this.refreshFocus()
      return
    }
    if (screen === 'achievements') {
      if (id === 'retour') {
        this.achievementsView = null // → retour au titre
      }
      this.refreshFocus()
      return
    }
    if (screen === 'evolutions') {
      if (id === 'retour') {
        this.evolutionsView = null // → retour à la pause
      }
      this.refreshFocus()
      return
    }
    if (screen === 'gameover') {
      // Avant de quitter le rapport : si le score entre au tableau, on passe par
      // la saisie du prénom (l'action demandée n'est PAS exécutée cette fois —
      // le joueur la re-validera au retour du tableau). Un score arcade ne se
      // perd pas parce qu'on a appuyé sur « Recommencer » un peu vite.
      if (this.maybeStartNameEntry()) {
        return
      }
      if (id === 'recommencer') {
        this.restart()
      } else if (id === 'titre') {
        this.started = false
      }
      this.refreshFocus()
      return
    }
    if (screen === 'victory') {
      if (this.maybeStartNameEntry()) {
        return
      }
      if (id === 'stage_suivant') {
        const i = ORDERED_PHASES.findIndex((p) => p.id === this.selectedPhase)
        const next = ORDERED_PHASES[i + 1]
        if (next !== undefined) {
          this.selectedPhase = next.id
        }
        this.start(this.mode)
      } else if (id === 'titre') {
        this.started = false
      }
      this.refreshFocus()
      return
    }
    if (screen === 'upgrade') {
      this.chooseUpgrade(this.focus.index)
    }
  }
}

/** État vide affiché à l'écran titre (aucune partie en cours). */
function emptyState(seed: number, stageId: ConstructionPhaseId): GameState {
  return {
    scene: 'title',
    seed,
    stageId,
    elapsedMs: 0,
    wave: 0,
    score: 0,
    bossKills: 0,
    coordSystem: 'origin top-left, +x right, +y down',
    players: [],
    enemies: [],
    projectiles: [],
    pickups: [],
    prisoners: [],
    allies: [],
    rescue: { total: 0, rescued: 0 },
    hazards: [],
    pendingLevelUp: null,
    pendingFormations: [],
    justEvolved: null,
    chestOpened: null,
    destructibles: [],
    coins: 0
  }
}

/**
 * Résout l'inventaire lisible (armes + passifs, noms + niveaux) d'un joueur à
 * partir des ids core (`weapons`/`weaponLevels` parallèles, `passives`). Garde
 * contre un id de contenu inconnu (replie sur l'id brut, jamais de `!`).
 */
function buildInventory(p: PlayerState): InventoryView {
  // Construire l'inventaire core pour calculer les statuts d'évolution (lecture seule).
  const invCore = {
    weapons: p.weapons.map((id, i) => ({ id, level: p.weaponLevels[i] ?? 1 })),
    passives: p.passives
  }
  const statuses = evolutionStatuses(invCore)

  const weapons = p.weapons.map((id, i) => {
    const def = WEAPONS[id]
    const entry: InventoryEntry = {
      id,
      name: def?.name ?? id,
      level: p.weaponLevels[i] ?? 1
    }
    if (def !== undefined) {
      entry.maxLevel = def.maxLevel
    }
    // Enrichir avec le statut d'évolution si une évolution existe pour cette arme.
    const status = statuses.find((s) => s.base === id)
    if (status !== undefined) {
      entry.evolveReady = status.ready
      if (status.ready) {
        entry.evolveHint = 'Prête à évoluer !'
      } else if (!status.hasPassive) {
        const passiveName = PASSIVES[status.passive]?.name ?? status.passive
        entry.evolveHint = `Passif manquant : ${passiveName}`
      } else {
        entry.evolveHint = 'Monte-la au max'
      }
    }
    return entry
  })
  const passives = p.passives.map(({ id, level }) => {
    const def = PASSIVES[id]
    const entry: InventoryEntry = {
      id,
      name: def?.name ?? id,
      level
    }
    if (def !== undefined) {
      entry.maxLevel = def.maxLevel
    }
    return entry
  })
  return { weapons, passives }
}
