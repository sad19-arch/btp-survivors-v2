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
 *  - les actions ponctuelles conservent l'identité des joueurs qui les ont
 *    émises. Les écrans d'équipe restent partagés, mais l'App peut réserver un
 *    écran contextuel (level-up) à son propriétaire.
 *
 * On transmet à l'App QUI a pressé chaque direction/validation, en un seul appel
 * par action. On ne boucle pas par joueur — deux joueurs pressant la même action
 * sur un écran partagé doivent déclencher UN seul déplacement, pas deux.
 *
 * L'App décide contextuellement (en jeu, `nav/confirm` sont sans effet ;
 * `back` met en pause, etc.), ce qui garde ce routeur sans condition d'écran.
 */
export function routeInput(app: App, perPlayer: ReadonlyMap<number, FrameInput>): void {
  for (const [playerId, frame] of perPlayer) {
    app.setInput(playerId, { move: frame.move, attack: false, action: frame.action })
  }

  const actions = new Map<NavAction, Set<number>>()
  for (const [playerId, frame] of perPlayer) {
    for (const action of frame.pressed) {
      const players = actions.get(action) ?? new Set<number>()
      players.add(playerId)
      actions.set(action, players)
    }
  }
  for (const [action, byPlayers] of actions) {
    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        app.nav(action, byPlayers)
        break
      case 'confirm':
        app.confirm(byPlayers)
        break
      case 'back':
        app.back(byPlayers)
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
