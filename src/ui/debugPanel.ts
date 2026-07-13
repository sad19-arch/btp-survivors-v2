/**
 * Panneau de DEBUG tactile (overlay DOM), ouvert par `?debug=1` (gated dev/test,
 * strippé de la prod — chargé dynamiquement par `main.ts`). Expose au DOIGT les
 * commandes de debug déjà offertes par le seam `window.__GAME__` (spawn boss /
 * coffre / ennemis, level-up, arsenal, game-over) — inutilisables à la console
 * sur mobile. N'importe PAS `App` (respecte le flux de dépendances) : dépend
 * d'une interface structurelle que `App` satisfait.
 *
 * Overlay observateur : n'écrit jamais dans la sim autrement que via ces
 * passe-plats de debug ; aucun impact déterministe en jeu normal.
 */
import { h } from './h'

/** Sous-ensemble des passe-plats de debug de l'App requis par le panneau. */
export interface DebugActions {
  debugSpawnBoss(role: 'mid' | 'final'): void
  debugSpawnChestOnPlayer(playerId?: number): void
  debugSpawnEnemies(n: number, radius?: number): void
  debugAddXp(amount: number): void
  debugKillPlayer(): void
  debugGrant(
    opts: { weapons?: { id: string; level: number }[]; passives?: { id: string; level: number }[] },
    playerId?: number
  ): void
}

export interface DebugPanelHandle {
  destroy(): void
}

const STYLE_ID = 'dbg-panel-style'

const CSS = `
#dbg-panel { position: fixed; left: 6px; top: 50%; transform: translateY(-50%);
  z-index: 99999; font-family: ui-monospace, Menlo, Consolas, monospace; }
#dbg-panel .dbg-tab { display: inline-block; background: #12141a; color: #f5b301;
  border: 2px solid #f5b301; padding: 6px 8px; font-weight: 800; font-size: 12px;
  letter-spacing: .12em; cursor: pointer; box-shadow: 3px 3px 0 rgba(0,0,0,.5);
  writing-mode: vertical-rl; text-orientation: mixed; user-select: none; }
#dbg-panel .dbg-body { display: none; margin-top: 4px; background: #12141a;
  border: 2px solid #333844; box-shadow: 3px 3px 0 rgba(0,0,0,.5); padding: 8px;
  max-height: 70vh; overflow-y: auto; }
#dbg-panel.dbg-open .dbg-body { display: flex; flex-direction: column; gap: 6px; }
#dbg-panel .dbg-hd { color: #a7abb4; font-size: 10px; letter-spacing: .16em;
  text-transform: uppercase; font-weight: 800; margin-bottom: 2px; }
#dbg-panel button.dbg-btn { display: block; width: 168px; text-align: left;
  background: #262a32; color: #f1efe8; border: 1.5px solid #3a3f4a; border-radius: 3px;
  padding: 10px 12px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
#dbg-panel button.dbg-btn:hover { border-color: #f5b301; }
#dbg-panel button.dbg-btn:active { transform: translate(1px,1px); }
#dbg-panel button.dbg-btn.danger { color: #ff9d8a; border-color: #6b3630; }
#dbg-panel button.dbg-btn.flash { background: #f5b301; color: #241a00; }
#dbg-panel button.dbg-btn:focus-visible { outline: 3px solid #f5b301; outline-offset: 2px; }
`

function injectStyle(): void {
  if (document.getElementById(STYLE_ID) !== null) {
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.append(style)
}

/** Arsenal de test : quelques armes de base au niveau max (puissance immédiate). */
const TEST_ARSENAL = [
  { id: 'cloueur', level: 8 },
  { id: 'scie', level: 8 },
  { id: 'marteau', level: 8 },
  { id: 'chalumeau', level: 8 }
]

/** Monte le panneau de debug dans `parent` (défaut : body). Renvoie un handle de démontage. */
export function mountDebugPanel(app: DebugActions, parent: HTMLElement = document.body): DebugPanelHandle {
  injectStyle()

  const flash = (btn: HTMLElement): void => {
    btn.classList.add('flash')
    window.setTimeout(() => btn.classList.remove('flash'), 130)
  }
  const action = (label: string, run: () => void, danger = false): HTMLElement => {
    const btn = h('button', {
      className: danger ? 'dbg-btn danger' : 'dbg-btn',
      text: label,
      attrs: { type: 'button' },
      onClick: () => { run(); flash(btn) }
    })
    return btn
  }

  const body = h('div', { className: 'dbg-body' },
    h('div', { className: 'dbg-hd', text: 'Spawns' }),
    action('Mini-boss', () => app.debugSpawnBoss('mid')),
    action('Boss final', () => app.debugSpawnBoss('final')),
    action('Coffre', () => app.debugSpawnChestOnPlayer(1)),
    action('+50 ennemis', () => app.debugSpawnEnemies(50)),
    h('div', { className: 'dbg-hd', text: 'Joueur' }),
    action('Level up (+500 XP)', () => app.debugAddXp(500)),
    action('Arsenal max', () => app.debugGrant({ weapons: TEST_ARSENAL }, 1)),
    action('Tuer le joueur', () => app.debugKillPlayer(), true)
  )

  const tab = h('div', {
    className: 'dbg-tab',
    text: 'DEBUG',
    onClick: () => panel.classList.toggle('dbg-open')
  })

  const panel = h('div', { className: 'dbg-panel', attrs: { id: 'dbg-panel' } }, tab, body)
  // Les clics/gestes sur le panneau ne doivent pas atteindre le canvas de jeu.
  const stop = (e: Event): void => e.stopPropagation()
  panel.addEventListener('pointerdown', stop)
  panel.addEventListener('pointerup', stop)

  parent.append(panel)

  return {
    destroy(): void {
      panel.remove()
    }
  }
}
