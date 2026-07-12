import { h, clear } from './h'
import { playerColor } from '@content/players'
import { WORLD } from '@content/config'
import type { GameState, PlayerState } from '@core/types'

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
const FIELD_DESKTOP = { w: 200, h: 150 } as const
/** Version compacte mobile (ratio 4:3 conservé) — cf. Minimap.setCompact. */
const FIELD_MOBILE = { w: 120, h: 90 } as const

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
  /**
   * Mémorise le dernier angle (radians) par joueur pour conserver l'orientation
   * quand vx===0 && vy===0 (joueur immobile). Clé = playerId.
   */
  private readonly lastAngle = new Map<number, number>()
  private fieldW: number = FIELD_DESKTOP.w
  private fieldH: number = FIELD_DESKTOP.h

  constructor() {
    this.counter = h('div', { className: 'minimap__counter', text: 'Prisonniers 0/0' })
    this.field = h('div', { className: 'minimap__field' })
    // Dimensions pilotées par le JS (source unique). setCompact() les réduit sur mobile.
    this.field.style.width = `${this.fieldW}px`
    this.field.style.height = `${this.fieldH}px`
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
    // Joueur(s) vivants — chevron orienté, couleur par joueur — dessinés en dernier (dessus).
    for (const player of state.players) {
      if (player.alive) {
        this.field.append(this.playerChevron(player))
      }
    }
  }

  /** Affiche/masque le panneau (toggle mini-carte). */
  setVisible(visible: boolean): void {
    this.el.style.display = visible ? 'flex' : 'none'
  }

  /** Passe le champ en taille compacte (mobile) ou desktop. Appelé au boot + au resize par l'overlay. */
  setCompact(compact: boolean): void {
    const dim = compact ? FIELD_MOBILE : FIELD_DESKTOP
    this.fieldW = dim.w
    this.fieldH = dim.h
    this.field.style.width = `${this.fieldW}px`
    this.field.style.height = `${this.fieldH}px`
  }

  /**
   * Construit un chevron orienté selon la direction du joueur.
   *
   * Forme : triangle CSS (bordures) pointant vers le haut par défaut, tourné
   * par `transform: rotate(angle)` calculé depuis `atan2(vy, vx)`.
   * Le triangle CSS (bordures) pointe vers le HAUT (−90° / −π/2 dans le repère
   * atan2 standard où 0 = droite) donc on ajoute −π/2 pour que l'angle 0 rad
   * (→ droite) corresponde à un chevron pointant vers la droite.
   *
   * Si vx===0 && vy===0 (joueur immobile), on conserve le dernier angle connu
   * (ou 0 rad — vers le haut — si aucun historique).
   *
   * Coloré par `playerColor(player.id).hex`.
   */
  private playerChevron(player: PlayerState): HTMLElement {
    const { mx, my } = worldToMinimap(player.x, player.y, WORLD.width, WORLD.height, this.fieldW, this.fieldH)
    const color = playerColor(player.id).hex

    // Calcul de l'angle d'orientation.
    let angle: number
    if (player.vx !== 0 || player.vy !== 0) {
      // atan2(vy, vx) donne l'angle depuis l'axe +x (droite).
      // Le triangle CSS pointe vers le HAUT (−π/2 dans ce repère) par défaut,
      // donc on décale de +π/2 pour que l'angle corresponde à la direction réelle.
      angle = Math.atan2(player.vy, player.vx) + Math.PI / 2
      this.lastAngle.set(player.id, angle)
    } else {
      // Immobile : dernier angle connu ou 0 (chevron vers le haut).
      angle = this.lastAngle.get(player.id) ?? 0
    }

    const deg = (angle * 180) / Math.PI

    // Wrapper positionné (centré sur mx, my) — classe stable pour les tests.
    const wrapper = h('div', { className: 'minimap__player' })
    wrapper.style.left = `${mx}px`
    wrapper.style.top = `${my}px`
    wrapper.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`

    // Triangle CSS : bordures colorées simulant un chevron (triangle plein).
    // La couleur du joueur est appliquée sur borderBottomColor
    // (le triangle pointe vers le haut quand deg=0).
    const chevron = h('div', { className: 'minimap__player__chevron' })
    chevron.style.borderBottomColor = color

    wrapper.append(chevron)
    return wrapper
  }

  /** Construit un marqueur positionné (absolu) via `worldToMinimap`. */
  private dot(x: number, y: number, className: string): HTMLElement {
    const { mx, my } = worldToMinimap(x, y, WORLD.width, WORLD.height, this.fieldW, this.fieldH)
    const el = h('div', { className })
    el.style.left = `${mx}px`
    el.style.top = `${my}px`
    return el
  }
}
