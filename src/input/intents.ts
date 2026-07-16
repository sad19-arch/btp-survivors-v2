import type { App } from '@/app/app'
import type { Vec2 } from '@core/types'

/** Action ponctuelle (front montant) émise par un périphérique. */
export type NavAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' | 'minimap'

/** Entrées d'une frame : déplacement continu + actions ponctuelles. */
export interface FrameInput {
  move: Vec2
  pressed: NavAction[]
  /** Bouton d'action MAINTENU cette frame (pas un front) — ex. relever un coéquipier à terre. */
  action: boolean
}

/** Frame sans entrée — repère neutre réutilisable (merge, périphérique absent). */
export const EMPTY_FRAME: FrameInput = { move: { x: 0, y: 0 }, pressed: [], action: false }

/**
 * Route les entrées d'une frame par joueur vers l'App (logique pure, testable) :
 *  - chaque joueur déplace son propre personnage (ignoré hors jeu) ;
 *  - les actions ponctuelles de TOUS les joueurs pilotent la navigation des
 *    écrans partagés (menu unique, pas de notion de « joueur focus »).
 *
 * `confirm` fait exception : on transmet à l'App QUI a pressé, en un seul appel.
 * L'App s'en sert pour n'accepter que le propriétaire d'une carte de level-up.
 * On ne boucle pas par joueur — deux joueurs validant la même frame sur le titre
 * doivent déclencher UN seul confirm, pas deux.
 *
 * L'App décide contextuellement (en jeu, `nav/confirm` sont sans effet ;
 * `back` met en pause, etc.), ce qui garde ce routeur sans condition d'écran.
 */
export function routeInput(app: App, perPlayer: ReadonlyMap<number, FrameInput>): void {
  for (const [playerId, frame] of perPlayer) {
    app.setInput(playerId, { move: frame.move, attack: false, action: frame.action })
  }

  const actions = new Set<NavAction>()
  const confirmedBy = new Set<number>()
  for (const [playerId, frame] of perPlayer) {
    for (const action of frame.pressed) {
      actions.add(action)
      if (action === 'confirm') {
        confirmedBy.add(playerId)
      }
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
        app.confirm(confirmedBy)
        break
      case 'back':
        app.back()
        break
      case 'pause':
        app.togglePause()
        break
      case 'minimap':
        app.toggleMinimap()
        break
    }
  }
}
