import type { App } from './app'
import type { AppViewState, NavDir } from './appState'
import type { GameMode, PlayerInput } from '@core/types'
import type { PerfSnapshot } from '@render/perf/perfProbe'

/**
 * Contrat du « seam » de test exposé sur `window.__GAME__`.
 * Permet à une IA / Playwright de piloter le vrai jeu (jusqu'à traverser tous
 * les écrans) sans regarder les pixels ni brancher de manette physique.
 */
export interface GameSeam {
  /** true quand l'app est prête (scène montée). */
  ready: boolean
  getState(): AppViewState
  renderToText(): string
  /** Avance le temps logique de façon déterministe (pas de sleep réel). */
  advanceTime(ms: number): void
  setInput(playerId: number, input: PlayerInput): void
  setSeed(seed: number): void
  // --- navigation des écrans (manette/clavier simulés) ---
  nav(dir: NavDir): void
  confirm(): void
  back(): void
  start(mode?: GameMode): void
  pause(): void
  resume(): void
  restart(): void
  /** Bascule l'affichage de la mini-carte (équivalent touche M / bouton Back manette). */
  toggleMinimap(): void
  chooseUpgrade(index: number): void
  events: EventTarget
  // --- helpers de debug (test-only : fast-forward pour Playwright/e2e) ---
  /** [Debug] Octroie directement des armes/passifs à un joueur (1 par défaut). */
  debugGrant(
    opts: { weapons?: { id: string; level: number }[]; passives?: { id: string; level: number }[] },
    playerId?: number
  ): void
  /** [Debug] Bascule le Mode Carnage (secret Konami) sans rejouer la séquence. */
  debugCarnage(on: boolean): void
  /** [Debug] Débloque le casque doré (son déclencheur de jeu est en attente). */
  debugUnlockGold(): void
  /** [Debug] Ajoute de l'XP à un joueur (1 par défaut) — force un level-up déterministe. */
  debugAddXp(amount: number, playerId?: number): void
  /**
   * [Debug] Simule « le joueur N presse VALIDER », via le même chemin que le
   * routeur d'input. `confirm()` est un appel système jamais filtré : lui seul ne
   * permet donc pas de tester le verrou de propriété des cartes de level-up.
   */
  debugConfirmAs(playerId: number): void
  /** [Debug] Fait apparaître un coffre d'évolution sur la position d'un joueur (1 par défaut). */
  debugSpawnChestOnPlayer(playerId?: number): void
  /** [Debug] Fait apparaître immédiatement le boss du rôle demandé (`mid`/`final`). */
  debugSpawnBoss(role: 'mid' | 'final'): void
  /**
   * [Debug] Fait apparaître `n` ennemis autour des joueurs (stress test horde).
   * `radius` optionnel (test-only) : spawn sur un anneau de ce rayon autour du
   * joueur (à l'écran, à portée d'arme) au lieu de l'anneau lointain hors-écran.
   */
  debugSpawnEnemies(n: number, radius?: number): void
  /**
   * [Debug] Met des joueurs à terre (PV = 0). Sans argument : TOUS → game-over.
   * Avec `playerId` : ce joueur SEUL (permet de tester la relève co-op, qui exige
   * un coéquipier vivant).
   */
  debugKillPlayer(playerId?: number): void
  /** [Debug] Audition d'un SFX d'arme (procédural) par ID d'arme. */
  debugPlayWeaponSfx(id: string): void
  /**
   * [Debug] Sonde de rendu (posée par la GameScene) : pour chaque joueur, la clé de
   * texture de son sprite, ou `null` si c'est un cercle de repli (feuille absente).
   * Permet de tester que le bon SKIN est rendu — invisible au `getState`, qui ignore
   * le rendu. Absente tant que la scène n'est pas montée / en mode allégé.
   */
  debugRenderInfo?(): { id: number; texture: string | null }[]
  /**
   * [Debug] Sonde du feedback de coup (posée par la GameScene) : compteur des chiffres
   * de dégâts actifs et total cumulé depuis la création du pool, et cap par frame.
   * Permet de valider en e2e que les coups déclenchent bien des chiffres flottants
   * et que le cap borne les émissions en horde AOE. Absente en mode allégé.
   */
  debugFeedbackInfo?(): { active: number; spawnedTotal: number; maxPerFrame: number }
  /**
   * [Debug] Sonde du streaming de décor (posée par la GameScene) : nombre de chunks
   * de décor actuellement chargés et nombre total d'objets de décor actifs.
   * Permet de valider en e2e que le nombre d'objets reste borné quelle que soit
   * la distance parcourue. Absente tant que la scène n'est pas montée.
   */
  debugDecorInfo?(): { loadedChunks: number; decorObjects: number }
  /**
   * [Debug/B4] Positions actuelles (monde) de chaque PNJ d'ambiance du stage courant.
   * Absente en mode allégé ou tant que la scène n'est pas montée.
   */
  debugAmbientNpcs?(): { x: number; y: number }[]
  /**
   * [Debug/B4] Nombre de bulles de râlerie actuellement affichées (≤ MAX_AMBIENT_BUBBLES).
   * Absente en mode allégé ou tant que la scène n'est pas montée.
   */
  debugActiveBubbles?(): number
  /**
   * [Debug/T5] Nombre de sprites de clusters de terrain actifs.
   * Permet de valider en e2e que les clusters sont bien dessinés (> 0 pour terrassement)
   * et que le count reste borné après restart (pas de fuite). Absente tant que la scène
   * n'est pas montée.
   */
  debugSiteInfo?(): { spriteCount: number }
  /**
   * [Debug/T6] Nombre d'ouvriers navetteurs actuellement affichés.
   * Permet de valider en e2e que les ouvriers sont bien présents sur les stages
   * avec clusters (> 0 pour terrassement) et absents sur terrain_vierge (= 0).
   * Absente tant que la scène n'est pas montée.
   */
  debugWorkers?(): {
    count: number
    workers: { role: string; texture: string; x: number; y: number }[]
  }
  /** Fige la caméra en vue d'ensemble (outil de revue visuelle, render-only). */
  debugCameraOverview?(zoom: number, cx: number, cy: number): void
  /**
   * [Debug/Perf] Snapshot du profileur de temps de frame render-side (posé par la
   * GameScene) : durées moyennes par section (`sim`, `hordeSync`, `playersSync`…)
   * et compteurs instantanés (`enemies`, `objects`). `null` si la scène n'est pas
   * montée. Test/overlay only — n'affecte jamais la simulation.
   */
  debugPerfProfile?(): PerfSnapshot | null
  /**
   * [Debug/Carnage] Sonde DIRECTE du `CarnageRenderer` (posée par la GameScene).
   *
   * Elle existe parce que sans elle un test ne peut que DEVINER — et devinait faux
   * sur les trois points à la fois :
   *
   * - `active` : `debugCarnage(on)` n'écrit que l'état de l'App ; le renderer ne
   *   l'apprend qu'au prochain `update()` (rAF). Un test qui enchaîne le toggle et
   *   un massacre SYNCHRONE (un `page.evaluate` ne laisse jamais passer de frame)
   *   joue à pile ou face avec le tick rAF — d'où un test intermittent.
   *   `active` rend l'attente OBSERVABLE au lieu d'espérée.
   * - `alive` : le compteur perf `bloodPools` n'est publié qu'en fin d'`update()`,
   *   il a donc toujours une frame de retard. Ici, c'est la valeur réelle.
   * - `cap` : dépend de la plateforme (140 tactile / 320 desktop). Un test qui code
   *   le chiffre en dur teste le mauvais plafond sur l'autre plateforme.
   *
   * `null` si la scène n'est pas montée ou en mode allégé (`lite` : pas d'assets
   * de sang chargés, donc aucune flaque possible).
   */
  debugCarnageInfo?(): { active: boolean; alive: number; cap: number } | null
}

declare global {
  interface Window {
    __GAME__?: GameSeam
  }
}

/** Construit l'objet seam délégant à l'App (ready piloté par la scène). */
export function createSeam(app: App): GameSeam {
  return {
    ready: false,
    getState: () => app.getState(),
    renderToText: () => app.renderToText(),
    advanceTime: (ms: number) => {
      app.advanceTime(ms)
    },
    setInput: (playerId: number, input: PlayerInput) => {
      app.setInput(playerId, input)
    },
    setSeed: (seed: number) => {
      app.setSeed(seed)
    },
    nav: (dir: NavDir) => {
      app.nav(dir)
    },
    confirm: () => {
      app.confirm()
    },
    back: () => {
      app.back()
    },
    start: (mode?: GameMode) => {
      app.start(mode)
    },
    pause: () => {
      app.pause()
    },
    resume: () => {
      app.resume()
    },
    restart: () => {
      app.restart()
    },
    toggleMinimap: () => {
      app.toggleMinimap()
    },
    chooseUpgrade: (index: number) => {
      app.chooseUpgrade(index)
    },
    events: app.events,
    // --- helpers de debug (test-only) ---
    debugGrant: (opts, playerId = 1) => {
      app.debugGrant(opts, playerId)
    },
    debugCarnage: (on: boolean) => {
      app.debugCarnage(on)
    },
    debugUnlockGold: () => {
      app.debugUnlockGold()
    },
    debugAddXp: (amount: number, playerId = 1) => {
      app.debugAddXp(amount, playerId)
    },
    debugConfirmAs: (playerId: number) => {
      app.debugConfirmAs(playerId)
    },
    debugSpawnChestOnPlayer: (playerId = 1) => {
      app.debugSpawnChestOnPlayer(playerId)
    },
    debugSpawnBoss: (role: 'mid' | 'final') => {
      app.debugSpawnBoss(role)
    },
    debugSpawnEnemies: (n: number, radius?: number) => {
      app.debugSpawnEnemies(n, radius)
    },
    debugKillPlayer: (playerId?: number) => {
      app.debugKillPlayer(playerId)
    },
    debugPlayWeaponSfx: (id: string) => {
      app.debugPlayWeaponSfx(id)
    }
  }
}

/** Publie le seam sur `window` (à n'appeler qu'en dev/test). */
export function installSeam(seam: GameSeam): void {
  window.__GAME__ = seam
}
