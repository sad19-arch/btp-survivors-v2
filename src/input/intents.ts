import type { App } from '@/app/app'
import type { Vec2 } from '@core/types'

/** Action ponctuelle (front montant) émise par un périphérique. */
export type NavAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause'

/** Entrées d'une frame : déplacement continu + actions ponctuelles. */
export interface FrameInput {
  move: Vec2
  pressed: NavAction[]
}

/**
 * Route les entrées d'une frame par joueur vers l'App (logique pure, testable) :
 *  - chaque joueur déplace son propre personnage (ignoré hors jeu) ;
 *  - les actions ponctuelles de TOUS les joueurs pilotent la navigation des
 *    écrans partagés (menu unique, pas de notion de « joueur focus »).
 *
 * L'App décide contextuellement (en jeu, `nav/confirm` sont sans effet ;
 * `back` met en pause, etc.), ce qui garde ce routeur sans condition d'écran.
 */
export function routeInput(app: App, perPlayer: ReadonlyMap<number, FrameInput>): void {
  for (const [playerId, frame] of perPlayer) {
    app.setInput(playerId, { move: frame.move, attack: false })
  }

  const actions = new Set<NavAction>()
  for (const frame of perPlayer.values()) {
    for (const action of frame.pressed) {
      actions.add(action)
    }
  }
  for (const action of actions) {
    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        app.nav(action)
        break
      case 'confirm':
        app.confirm()
        break
      case 'back':
        app.back()
        break
      case 'pause':
        app.togglePause()
        break
    }
  }
}
