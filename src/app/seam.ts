import type { App } from './app'
import type { AppViewState, NavDir } from './appState'
import type { GameMode, PlayerInput } from '@core/types'

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
  chooseUpgrade(index: number): void
  events: EventTarget
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
    chooseUpgrade: (index: number) => {
      app.chooseUpgrade(index)
    },
    events: app.events
  }
}

/** Publie le seam sur `window` (à n'appeler qu'en dev/test). */
export function installSeam(seam: GameSeam): void {
  window.__GAME__ = seam
}
