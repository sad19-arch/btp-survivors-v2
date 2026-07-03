import { Simulation } from '@core/simulation'
import {
  AuraPulseEvent,
  PrisonerFreedEvent,
  EnemyKilledEvent,
  PlayerHurtEvent,
  LevelUpEvent,
  WeaponFiredEvent,
  PickupCollectedEvent,
  BossSpawnedEvent,
  EvolvedEvent
} from '@core/events'
import { FocusModel } from '@ui/focusModel'
import { ConstructionPhaseId, ORDERED_PHASES } from '@content/phases'
import { INTRO } from '@content/config'
import { loadAudioSettings, saveAudioSettings, clamp01, type AudioLevels } from '@/audio/settings'
import type { GameMode, GameState, PlayerInput } from '@core/types'
import type { AppViewState, MenuItemView, MenuView, NavDir, Screen } from './appState'

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
  { id: 'options', label: 'Options', hint: null },
  { id: 'recommencer', label: 'Recommencer', hint: null },
  { id: 'quitter', label: 'Quitter', hint: null }
]
const GAMEOVER_ITEMS: MenuItemView[] = [
  { id: 'recommencer', label: 'Recommencer', hint: null },
  { id: 'titre', label: 'Menu titre', hint: null }
]

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
  private started = false
  private readonly focus = new FocusModel()
  private focusKey = ''
  /** Skin doré débloqué via le code Konami (cosmétique, mémoire de session). */
  private goldSkin = false
  /** Historique des dernières actions au titre, pour détecter le code Konami. */
  private comboBuffer: ComboAction[] = []
  /** Intro activée (vrai joueur) ; désactivée en test/e2e/capture. */
  private readonly introEnabled: boolean
  /** Temps restant de gel pour l'intro de run, en ms (0 = pas d'intro en cours). */
  private introMsLeft = 0
  /** Écran Options ouvert (surcouche au-dessus du titre / pause). */
  private optionsOpen = false
  /** Niveaux audio (possédés ici pour l'UI Options ; l'AudioDirector les lit). */
  private audioLevels: AudioLevels = loadAudioSettings()

  constructor(opts: AppOptions) {
    this.seed = opts.seed
    this.mode = opts.mode
    this.selectedPhase = opts.phaseId ?? ConstructionPhaseId.TERRAIN_VIERGE
    this.introEnabled = opts.intro ?? false
    if (opts.autostart) {
      this.start(opts.mode)
    }
  }

  // --- cycle de vie ---------------------------------------------------------

  /** Démarre une nouvelle partie (depuis le titre). */
  start(mode: GameMode = this.mode): void {
    this.mode = mode
    this.sim = new Simulation({ seed: this.seed, mode, phaseId: this.selectedPhase })
    // Relaie les événements de sim (ex. onde d'aura, libération) vers l'App → rendu.
    this.sim.events.addEventListener('auraPulse', (e) => {
      const p = e as AuraPulseEvent
      this.events.dispatchEvent(new AuraPulseEvent(p.x, p.y, p.radius))
    })
    this.sim.events.addEventListener('prisonerFreed', (e) => {
      const p = e as PrisonerFreedEvent
      this.events.dispatchEvent(new PrisonerFreedEvent(p.x, p.y))
    })
    // Relais des événements sémantiques audio (sim → App → AudioDirector).
    this.sim.events.addEventListener('enemyKilled', (e) => {
      this.events.dispatchEvent(new EnemyKilledEvent((e as EnemyKilledEvent).count))
    })
    this.sim.events.addEventListener('playerHurt', () => { this.events.dispatchEvent(new PlayerHurtEvent()) })
    this.sim.events.addEventListener('levelUp', () => { this.events.dispatchEvent(new LevelUpEvent()) })
    this.sim.events.addEventListener('weaponFired', (e) => {
      this.events.dispatchEvent(new WeaponFiredEvent((e as WeaponFiredEvent).kind))
    })
    this.sim.events.addEventListener('pickupCollected', (e) => {
      this.events.dispatchEvent(new PickupCollectedEvent((e as PickupCollectedEvent).kind))
    })
    this.sim.events.addEventListener('bossSpawned', () => { this.events.dispatchEvent(new BossSpawnedEvent()) })
    this.sim.events.addEventListener('evolved', (e) => {
      this.events.dispatchEvent(new EvolvedEvent((e as EvolvedEvent).weaponId))
    })
    this.introMsLeft = this.introEnabled ? INTRO.durationMs : 0
    this.started = true
    this.refreshFocus()
  }

  /** Change la seed ; relance la partie en cours le cas échéant. */
  setSeed(seed: number): void {
    this.seed = seed
    if (this.started) {
      this.start(this.mode)
    }
  }

  /** Relance une partie neuve (même seed). */
  restart(): void {
    this.start(this.mode)
  }

  /** Avance le temps logique (sans effet hors écran de jeu). */
  advanceTime(ms: number): void {
    // Intro de run : on consomme le temps SANS faire avancer la sim (gel cosmétique).
    if (this.introMsLeft > 0) {
      this.introMsLeft = Math.max(0, this.introMsLeft - ms)
      this.refreshFocus()
      return
    }
    this.sim?.advanceTime(ms)
    this.refreshFocus()
  }

  setInput(playerId: number, input: PlayerInput): void {
    this.sim?.setInput(playerId, input)
  }

  // --- navigation manette/clavier ------------------------------------------

  /** Déplace le curseur dans le menu actif. */
  nav(dir: NavDir): void {
    this.recordCombo(dir)
    this.refreshFocus()
    if (this.menuItems().length === 0) {
      return
    }
    // Sélecteur de niveau au titre : gauche/droite changent la phase (pas le focus).
    if (this.screen === 'title' && this.focus.current() === 'stage' && (dir === 'left' || dir === 'right')) {
      this.cycleStage(dir === 'right' ? 1 : -1)
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
    this.refreshFocus()
    const items = this.menuItems()
    if (items[index] === undefined) {
      return
    }
    this.focus.setIndex(index)
    this.activate(this.screen, items[index].id)
  }

  /** Valide l'item focalisé du menu actif. */
  confirm(): void {
    // Au titre, la touche « valider » peut compléter le code Konami : on la consomme alors.
    if (this.recordCombo('confirm')) {
      return
    }
    this.refreshFocus()
    const id = this.focus.current()
    if (id === null) {
      return
    }
    this.activate(this.screen, id)
  }

  /** Retour / annulation, selon l'écran. */
  back(): void {
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
      default:
        break // titre / upgrade : pas de retour
    }
    this.emitUi('menuBack')
    this.refreshFocus()
  }

  /** Met en pause (depuis le jeu). */
  pause(): void {
    this.sim?.pause()
    this.refreshFocus()
  }

  /** Reprend (depuis la pause). */
  resume(): void {
    this.sim?.resume()
    this.refreshFocus()
  }

  /** Bascule pause/reprise (touche dédiée). */
  togglePause(): void {
    if (this.screen === 'game') {
      this.sim?.pause()
    } else if (this.screen === 'paused') {
      this.sim?.resume()
    }
    this.refreshFocus()
  }

  /** Choisit une carte d'upgrade par index (API directe pour le seam). */
  chooseUpgrade(index: number): void {
    this.sim?.chooseUpgrade(index)
    this.refreshFocus()
  }

  // --- helpers de debug (test-only — passe-plat vers Simulation pour le seam) ---

  /**
   * [Debug/seam] Octroie directement des armes/passifs au joueur 1. Réservé
   * aux tests et au seam de debug (`window.__GAME__`) — jamais en jeu normal.
   */
  debugGrant(opts: { weapons?: { id: string; level: number }[]; passives?: { id: string; level: number }[] }): void {
    this.sim?.debugGrant(opts)
    this.refreshFocus()
  }

  /** [Debug/seam] Ajoute de l'XP au joueur 1 (force un level-up déterministe). */
  debugAddXp(amount: number): void {
    this.sim?.debugAddXp(amount)
    this.refreshFocus()
  }

  /** [Debug/seam] Fait apparaître un coffre d'évolution sur la position du joueur 1. */
  debugSpawnChestOnPlayer(): void {
    this.sim?.debugSpawnChestOnPlayer()
    this.refreshFocus()
  }

  /** [Debug/seam] Fait apparaître immédiatement le boss du rôle demandé (`mid`/`final`). */
  debugSpawnBoss(role: 'mid' | 'final'): void {
    this.sim?.debugSpawnBoss(role)
    this.refreshFocus()
  }

  // --- état exposé ----------------------------------------------------------

  /**
   * Enregistre une action au titre pour détecter le code Konami. Renvoie true si
   * la séquence vient d'être complétée à cet appel (le débloquage doit consommer
   * la touche pour ne pas déclencher aussi l'item de menu focalisé).
   */
  private recordCombo(action: ComboAction): boolean {
    if (this.screen !== 'title' || this.goldSkin) {
      return false
    }
    this.comboBuffer.push(action)
    if (this.comboBuffer.length > KONAMI.length) {
      this.comboBuffer.shift()
    }
    if (this.comboBuffer.length === KONAMI.length && KONAMI.every((a, i) => this.comboBuffer[i] === a)) {
      this.goldSkin = true
      this.comboBuffer = []
      return true
    }
    return false
  }

  getState(): AppViewState {
    this.refreshFocus()
    const base = this.sim?.getState() ?? emptyState(this.seed, this.selectedPhase)
    const screen = this.screen
    const phase = ORDERED_PHASES.find((p) => (p.id as string) === base.stageId)
    return {
      ...base,
      scene: base.scene,
      screen,
      menu: this.menu(screen),
      goldSkin: this.goldSkin,
      introActive: this.introMsLeft > 0,
      stageTitle: phase?.title ?? '—',
      stageSubtitle: phase?.subtitle ?? '',
      stageOrder: phase?.order ?? 0
    }
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
      default:
        return []
    }
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
      { id: 'retour', label: 'Retour', hint: null }
    ]
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

  /** Items du titre : Jouer, sélecteur de niveau (◄/►), Options, Crédits. */
  private titleItems(): MenuItemView[] {
    const phase = ORDERED_PHASES.find((p) => p.id === this.selectedPhase)
    return [
      { id: 'jouer', label: 'Jouer', hint: null },
      { id: 'stage', label: `◄ Niveau ${phase?.order ?? 1}/10 : ${phase?.title ?? '—'} ►`, hint: 'Gauche/Droite pour changer' },
      { id: 'options', label: 'Options', hint: null },
      { id: 'credits', label: 'Crédits', hint: null }
    ]
  }

  /** Décale la phase sélectionnée de `step` (cycle) — sélecteur de niveau du titre. */
  private cycleStage(step = 1): void {
    const n = ORDERED_PHASES.length
    const i = ORDERED_PHASES.findIndex((p) => p.id === this.selectedPhase)
    const next = (((i + step) % n) + n) % n
    this.selectedPhase = ORDERED_PHASES[next]?.id ?? this.selectedPhase
    this.refreshFocus()
  }

  private upgradeItems(): MenuItemView[] {
    const pending = this.sim?.getState().pendingLevelUp ?? null
    if (pending === null) {
      return []
    }
    return pending.choices.map((c) => ({ id: c.id, label: c.name, hint: c.hint }))
  }

  private menu(screen: Screen): MenuView | null {
    const items = this.menuItems()
    if (items.length === 0) {
      return null
    }
    return { screen, items, index: this.focus.index }
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
      } else if (id === 'retour') {
        this.optionsOpen = false
      }
      this.refreshFocus()
      return
    }
    if (screen === 'paused') {
      if (id === 'reprendre') {
        this.sim?.resume()
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
        this.start(this.mode)
      } else if (id === 'stage') {
        this.cycleStage()
      } else if (id === 'options') {
        this.optionsOpen = true
      }
      this.refreshFocus()
      return
    }
    if (screen === 'gameover') {
      if (id === 'recommencer') {
        this.restart()
      } else if (id === 'titre') {
        this.started = false
      }
      this.refreshFocus()
      return
    }
    if (screen === 'victory') {
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
    coordSystem: 'origin top-left, +x right, +y down',
    players: [],
    enemies: [],
    projectiles: [],
    pickups: [],
    prisoners: [],
    pendingLevelUp: null
  }
}
