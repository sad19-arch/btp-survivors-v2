import { h } from '@ui/h'
import { PALETTE } from '@ui/palette'
import type { PerfSnapshot } from './perfProbe'

/**
 * Petit panneau de diagnostic perf (dev/`?perf=1`). DA 16-bit : panneau pixel,
 * bordure noire, palette imposée, aucun emoji. Observer-only : n'affiche que ce
 * que la sonde publie. Se met à jour au plus ~4×/s pour ne rien coûter.
 */
export class PerfOverlay {
  private readonly el: HTMLElement
  private readonly lines: HTMLElement
  private lastPaint = 0

  constructor(root: HTMLElement) {
    this.lines = h('pre', {})
    this.lines.setAttribute(
      'style',
      `margin:0;font-family:monospace;font-size:12px;line-height:1.35;color:${PALETTE.jauneSecurite};white-space:pre`
    )
    this.el = h('div', { className: 'perf-overlay' }, this.lines)
    this.el.setAttribute(
      'style',
      `position:absolute;top:8px;left:8px;z-index:90;padding:8px 10px;` +
        `background:${PALETTE.contour};border:3px solid ${PALETTE.jauneSecurite};` +
        `box-shadow:4px 4px 0 rgba(0,0,0,0.5);pointer-events:none`
    )
    root.append(this.el)
  }

  /** `now` optionnel pour tester le throttle sans horloge réelle. */
  update(snapshot: PerfSnapshot, fps: number, now: number = performance.now()): void {
    if (now - this.lastPaint < 250) {
      return
    }
    this.lastPaint = now
    const s = snapshot.sections
    const c = snapshot.counts
    const ms = (n: string): string => (s[n] ?? 0).toFixed(2).padStart(5)
    const cpu = (s.sim ?? 0) + (s.hordeSync ?? 0) + (s.playersSync ?? 0) + (s.phaserRender ?? 0)
    this.lines.textContent = [
      `FPS        ${String(Math.round(fps)).padStart(3)}`,
      `CPU/frame  ${cpu.toFixed(2).padStart(5)} ms`,
      `  sim      ${ms('sim')} ms`,
      `  horde    ${ms('hordeSync')} ms`,
      `  joueurs  ${ms('playersSync')} ms`,
      `  phaser   ${ms('phaserRender')} ms`,
      `ennemis    ${String(c.enemies ?? 0).padStart(4)}`,
      `objets     ${String(c.objects ?? 0).padStart(4)}`
    ].join('\n')
  }

  destroy(): void {
    this.el.remove()
  }
}
