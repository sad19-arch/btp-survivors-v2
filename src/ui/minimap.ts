import { h, clear } from './h'
import { playerColor } from '@content/players'
import { WORLD } from '@content/config'
import type { GameState } from '@core/types'

/** Mappe une position monde vers le panneau mini-carte (clampée). PURE. */
export function worldToMinimap(
  x: number,
  y: number,
  worldW: number,
  worldH: number,
  mapW: number,
  mapH: number
): { mx: number; my: number } {
  const mx = Math.max(0, Math.min(mapW, (x / worldW) * mapW))
  const my = Math.max(0, Math.min(mapH, (y / worldH) * mapH))
  return { mx, my }
}

/**
 * Dimensions (px) de l'aire de tracé — SOURCE UNIQUE : appliquées directement au
 * `.minimap__field` dans le constructeur, donc styles.ts n'a plus à les redéclarer
 * (fini le couplage implicite CSS ↔ JS).
 */
const FIELD_W = 200
const FIELD_H = 150

/**
 * Sous-ensemble de `GameState` consommé par la mini-carte (lecture seule). L'App
 * passe un `AppViewState` (qui étend `GameState`) — la mini-carte n'observe que
 * les champs positionnels, jamais la logique.
 */
type MinimapState = Pick<GameState, 'players' | 'prisoners' | 'enemies' | 'pickups' | 'rescue'>

/**
 * Panneau mini-carte (bas-gauche) : repère les prisonniers non libérés, le(s)
 * boss, les coffres et le(s) joueur(s) dans le monde entier, pour inciter à
 * explorer. Observer-only : reconstruit ses marqueurs depuis l'état exposé,
 * jamais de logique de jeu. Style DA 16-bit (panneau pixel, coins carrés).
 */
export class Minimap {
  readonly el: HTMLElement
  private readonly field: HTMLElement
  private readonly counter: HTMLElement

  constructor() {
    this.counter = h('div', { className: 'minimap__counter', text: 'Prisonniers 0/0' })
    this.field = h('div', { className: 'minimap__field' })
    // Dimensions pilotées par le JS (source unique FIELD_W/FIELD_H).
    this.field.style.width = `${FIELD_W}px`
    this.field.style.height = `${FIELD_H}px`
    this.el = h('div', { className: 'minimap' }, this.counter, this.field)
  }

  /** Reconstruit les marqueurs depuis l'état courant (appelé throttlé par l'overlay). */
  update(state: MinimapState): void {
    this.counter.textContent = `Prisonniers ${state.rescue.rescued}/${state.rescue.total}`
    clear(this.field)
    // Prisonniers non libérés (marqueur cage jaune) — classe stable pour l'e2e.
    for (const p of state.prisoners) {
      if (!p.freed) {
        this.field.append(this.dot(p.x, p.y, 'minimap__dot minimap__dot--prisoner'))
      }
    }
    // Coffres d'évolution (or).
    for (const pk of state.pickups) {
      if (pk.type === 'coffre') {
        this.field.append(this.dot(pk.x, pk.y, 'minimap__dot minimap__dot--coffre'))
      }
    }
    // Boss (rouge).
    for (const e of state.enemies) {
      if (e.isBoss) {
        this.field.append(this.dot(e.x, e.y, 'minimap__dot minimap__dot--boss'))
      }
    }
    // Joueur(s) vivants (chevron couleur joueur) — dessinés en dernier (dessus).
    for (const player of state.players) {
      if (player.alive) {
        const dot = this.dot(player.x, player.y, 'minimap__dot minimap__dot--player')
        dot.style.backgroundColor = playerColor(player.id).hex
        this.field.append(dot)
      }
    }
  }

  /** Affiche/masque le panneau (toggle mini-carte). */
  setVisible(visible: boolean): void {
    this.el.style.display = visible ? 'flex' : 'none'
  }

  /** Construit un marqueur positionné (absolu) via `worldToMinimap`. */
  private dot(x: number, y: number, className: string): HTMLElement {
    const { mx, my } = worldToMinimap(x, y, WORLD.width, WORLD.height, FIELD_W, FIELD_H)
    const el = h('div', { className })
    el.style.left = `${mx}px`
    el.style.top = `${my}px`
    return el
  }
}
