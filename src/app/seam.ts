import type { Simulation } from '@core/simulation'
import type { GameState, PlayerInput } from '@core/types'

/**
 * Contrat du « seam » de test exposé sur `window.__GAME__`.
 * Permet à une IA / Playwright de piloter le vrai jeu sans regarder les pixels.
 */
export interface GameSeam {
  /** true quand une partie est jouable. */
  ready: boolean
  getState(): GameState
  renderToText(): string
  /** Avance le temps logique de façon déterministe (pas de sleep réel). */
  advanceTime(ms: number): void
  setInput(playerId: number, input: PlayerInput): void
  setSeed(seed: number): void
  events: EventTarget
}

declare global {
  interface Window {
    __GAME__?: GameSeam
  }
}

/** Construit l'objet seam délégant à la simulation (ready piloté par la scène). */
export function createSeam(sim: Simulation): GameSeam {
  return {
    ready: false,
    getState: () => sim.getState(),
    renderToText: () => sim.renderToText(),
    advanceTime: (ms: number) => {
      sim.advanceTime(ms)
    },
    setInput: (playerId: number, input: PlayerInput) => {
      sim.setInput(playerId, input)
    },
    setSeed: (seed: number) => {
      sim.setSeed(seed)
    },
    events: sim.events
  }
}

/** Publie le seam sur `window` (à n'appeler qu'en dev/test). */
export function installSeam(seam: GameSeam): void {
  window.__GAME__ = seam
}
