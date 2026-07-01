import { Simulation } from '@core/simulation'
import { AuraPulseEvent } from '@core/events'
import { FocusModel } from '@ui/focusModel'
import type { ConstructionPhaseId } from '@content/phases'
import type { GameMode, GameState, PlayerInput } from '@core/types'
import type { AppViewState, MenuItemView, MenuView, NavDir, Screen } from './appState'

export interface AppOptions {
  seed: number
  mode: GameMode
  autostart: boolean
  /** Phase/stage du chantier (défaut : terrain vierge). */
  phaseId?: ConstructionPhaseId
}

/** Items fixes des menus (hors cartes d'upgrade, dynamiques). */
const TITLE_ITEMS: MenuItemView[] = [
  { id: 'jouer', label: 'Jouer', hint: null },
  { id: 'options', label: 'Options', hint: null },
  { id: 'credits', label: 'Crédits', hint: null }
]
const PAUSE_ITEMS: MenuItemView[] = [
  { id: 'reprendre', label: 'Reprendre', hint: null },
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
  private readonly phaseId: ConstructionPhaseId | undefined
  private started = false
  private readonly focus = new FocusModel()
  private focusKey = ''

  constructor(opts: AppOptions) {
    this.seed = opts.seed
    this.mode = opts.mode
    this.phaseId = opts.phaseId
    if (opts.autostart) {
      this.start(opts.mode)
    }
  }

  // --- cycle de vie ---------------------------------------------------------

  /** Démarre une nouvelle partie (depuis le titre). */
  start(mode: GameMode = this.mode): void {
    this.mode = mode
    this.sim = new Simulation({ seed: this.seed, mode, phaseId: this.phaseId })
    // Relaie les événements de sim (ex. onde d'aura) vers l'App → rendu.
    this.sim.events.addEventListener('auraPulse', (e) => {
      const p = e as AuraPulseEvent
      this.events.dispatchEvent(new AuraPulseEvent(p.x, p.y, p.radius))
    })
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
    this.sim?.advanceTime(ms)
    this.refreshFocus()
  }

  setInput(playerId: number, input: PlayerInput): void {
    this.sim?.setInput(playerId, input)
  }

  // --- navigation manette/clavier ------------------------------------------

  /** Déplace le curseur dans le menu actif. */
  nav(dir: NavDir): void {
    this.refreshFocus()
    if (this.menuItems().length === 0) {
      return
    }
    const delta = dir === 'up' || dir === 'left' ? -1 : 1
    this.focus.move(delta)
  }

  /** Valide l'item focalisé du menu actif. */
  confirm(): void {
    this.refreshFocus()
    const id = this.focus.current()
    if (id === null) {
      return
    }
    this.activate(this.screen, id)
  }

  /** Retour / annulation, selon l'écran. */
  back(): void {
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

  // --- état exposé ----------------------------------------------------------

  getState(): AppViewState {
    this.refreshFocus()
    const base = this.sim?.getState() ?? emptyState(this.seed)
    const screen = this.screen
    return { ...base, scene: base.scene, screen, menu: this.menu(screen) }
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

  /** Écran courant, dérivé de l'état de la simulation. */
  private get screen(): Screen {
    if (!this.started || this.sim === null) {
      return 'title'
    }
    const st = this.sim.getState()
    if (st.scene === 'gameover') {
      return 'gameover'
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
        return TITLE_ITEMS
      case 'paused':
        return PAUSE_ITEMS
      case 'gameover':
        return GAMEOVER_ITEMS
      case 'upgrade':
        return this.upgradeItems()
      default:
        return []
    }
  }

  private upgradeItems(): MenuItemView[] {
    const pending = this.sim?.getState().pendingLevelUp ?? null
    if (pending === null) {
      return []
    }
    return pending.choices.map((c) => ({ id: c.id, label: c.name, hint: c.description }))
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
    if (screen === 'title') {
      if (id === 'jouer') {
        this.start(this.mode)
      }
      return
    }
    if (screen === 'paused') {
      if (id === 'reprendre') {
        this.sim?.resume()
      } else if (id === 'recommencer') {
        this.restart()
      } else if (id === 'quitter') {
        this.started = false
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
    if (screen === 'upgrade') {
      this.chooseUpgrade(this.focus.index)
    }
  }
}

/** État vide affiché à l'écran titre (aucune partie en cours). */
function emptyState(seed: number): GameState {
  return {
    scene: 'title',
    seed,
    stageId: 'terrain_vierge',
    elapsedMs: 0,
    wave: 0,
    score: 0,
    coordSystem: 'origin top-left, +x right, +y down',
    players: [],
    enemies: [],
    projectiles: [],
    pickups: [],
    pendingLevelUp: null
  }
}
