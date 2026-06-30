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
 * Route les entrées d'une frame vers l'App (logique pure, testable) :
 *  - le déplacement va toujours au joueur (ignoré hors jeu) ;
 *  - les actions ponctuelles pilotent la navigation des écrans.
 *
 * L'App décide contextuellement (en jeu, `nav/confirm` sont sans effet ;
 * `back` met en pause, etc.), ce qui garde ce routeur sans condition d'écran.
 */
export function routeInput(app: App, frame: FrameInput): void {
  app.setInput(1, { move: frame.move, attack: false })
  for (const action of frame.pressed) {
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
