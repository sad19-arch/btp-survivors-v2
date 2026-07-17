/**
 * Séquenceur de commandes d'intro de stage (render-only, déterministe).
 *
 * Aucun import Phaser — la façade `CinemaStage` abstrait le rendu réel.
 * Aucun acteur du `World` — tout est cosmétique.
 * Aucun `Math.random` / `Date.now` / `new Date`.
 *
 * MODÈLE DE TIMELINE :
 *   Seul `wait(ms)` fait avancer l'horloge.
 *   Toute autre commande se déclenche à la valeur courante du curseur (fire-at-cursor).
 *   Les durées d'anim (`zoomTo.ms`, `move.ms`, …) sont dispatchées à la façade
 *   et gérées côté stage (concurremment) — elles ne bloquent PAS la timeline.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Ease = 'linear' | 'easeOut' | 'snap'

export type IntroCommand =
  | { kind: 'wait'; ms: number }
  | { kind: 'banner'; text: string }
  | { kind: 'voice'; key: string }
  | { kind: 'sfx'; key: string }
  | { kind: 'flash' }
  | { kind: 'shake'; intensity: number }
  | { kind: 'cut'; cx: number; cy: number; zoom: number }
  | { kind: 'zoomTo'; cx: number; cy: number; zoom: number; ms: number; ease?: Ease }
  | { kind: 'punchIn'; cx: number; cy: number; zoom: number; ms: number }
  | { kind: 'whipPan'; cx: number; cy: number; ms: number }
  | { kind: 'slowmo'; scale: number; ms: number }
  | { kind: 'actor'; id: string; key: string; x: number; y: number; scale?: number }
  | { kind: 'preview'; key: string; x: number; y: number; count: number }
  | { kind: 'move'; id: string; x: number; y: number; ms: number }
  | { kind: 'play'; id: string; anim: string }

// ---------------------------------------------------------------------------
// Façade abstraite (implémentée par le module Phaser, ou par un fake en test)
// ---------------------------------------------------------------------------

export interface CinemaStage {
  banner(text: string): void
  voice(key: string): void
  sfx(key: string): void
  flash(): void
  shake(intensity: number): void
  camCut(cx: number, cy: number, zoom: number): void
  camZoomTo(cx: number, cy: number, zoom: number, ms: number, ease: Ease): void
  camPunchIn(cx: number, cy: number, zoom: number, ms: number): void
  camWhipPan(cx: number, cy: number, ms: number): void
  camSlowmo(scale: number, ms: number): void
  actor(id: string, key: string, x: number, y: number, scale: number): void
  preview(key: string, x: number, y: number, count: number): void
  move(id: string, x: number, y: number, ms: number): void
  play(id: string, anim: string): void
  clearAll(): void
}

// ---------------------------------------------------------------------------
// Entrée interne pré-calculée (commande + timestamp de déclenchement)
// ---------------------------------------------------------------------------

interface ScheduledCommand {
  atMs: number
  cmd: IntroCommand
}

// ---------------------------------------------------------------------------
// Dispatch d'une commande vers la façade
// ---------------------------------------------------------------------------

function dispatch(stage: CinemaStage, cmd: IntroCommand): void {
  switch (cmd.kind) {
    case 'wait':
      // Pas de dispatch — marqueur temporel uniquement.
      break
    case 'banner':
      stage.banner(cmd.text)
      break
    case 'voice':
      stage.voice(cmd.key)
      break
    case 'sfx':
      stage.sfx(cmd.key)
      break
    case 'flash':
      stage.flash()
      break
    case 'shake':
      stage.shake(cmd.intensity)
      break
    case 'cut':
      stage.camCut(cmd.cx, cmd.cy, cmd.zoom)
      break
    case 'zoomTo':
      stage.camZoomTo(cmd.cx, cmd.cy, cmd.zoom, cmd.ms, cmd.ease ?? 'easeOut')
      break
    case 'punchIn':
      stage.camPunchIn(cmd.cx, cmd.cy, cmd.zoom, cmd.ms)
      break
    case 'whipPan':
      stage.camWhipPan(cmd.cx, cmd.cy, cmd.ms)
      break
    case 'slowmo':
      stage.camSlowmo(cmd.scale, cmd.ms)
      break
    case 'actor':
      stage.actor(cmd.id, cmd.key, cmd.x, cmd.y, cmd.scale ?? 1)
      break
    case 'preview':
      stage.preview(cmd.key, cmd.x, cmd.y, cmd.count)
      break
    case 'move':
      stage.move(cmd.id, cmd.x, cmd.y, cmd.ms)
      break
    case 'play':
      stage.play(cmd.id, cmd.anim)
      break
  }
}

// ---------------------------------------------------------------------------
// Séquenceur principal
// ---------------------------------------------------------------------------

/**
 * Joue une liste de `IntroCommand` dans le temps en les dispatchant à
 * `CinemaStage`. Aucun Phaser, aucun acteur du World.
 */
export class IntroSequencer {
  private scheduled: ScheduledCommand[] = []
  /** Index de la prochaine commande à jouer (curseur monotone). */
  private cursor = 0
  private _done = false

  constructor(private readonly stage: CinemaStage) {}

  /**
   * Pré-calcule la timeline et remet le curseur à 0.
   *
   * Algorithme : on accumule `clockMs` chaque fois qu'on rencontre un `wait`.
   * Toutes les autres commandes reçoivent `atMs = clockMs` courant.
   * Les `wait` sont inclus dans la liste schedulée avec `atMs` avant l'avance,
   * mais leur dispatch est no-op — cela simplifie le curseur monotone.
   */
  load(script: readonly IntroCommand[]): void {
    this.scheduled = []
    this.cursor = 0
    this._done = false

    let clockMs = 0
    for (const cmd of script) {
      this.scheduled.push({ atMs: clockMs, cmd })
      if (cmd.kind === 'wait') {
        clockMs += cmd.ms
      }
    }
  }

  /**
   * Joue toutes les commandes dont `atMs <= elapsedMs` pas encore jouées,
   * dans l'ordre. Curseur monotone (jamais de rejeu).
   */
  update(elapsedMs: number): void {
    if (this._done) { return }

    while (this.cursor < this.scheduled.length) {
      const entry = this.scheduled[this.cursor]
      if (entry === undefined) { break }
      if (entry.atMs > elapsedMs) { break }
      dispatch(this.stage, entry.cmd)
      this.cursor++
    }

    if (this.cursor >= this.scheduled.length) {
      this._done = true
    }
  }

  /**
   * Joue instantanément toutes les commandes restantes (dans l'ordre),
   * puis marque `done`. Pose l'état final : dernier banner/cut/actor appliqués.
   */
  skip(): void {
    while (this.cursor < this.scheduled.length) {
      const entry = this.scheduled[this.cursor]
      if (entry === undefined) { break }
      dispatch(this.stage, entry.cmd)
      this.cursor++
    }
    this._done = true
  }

  /** Vrai quand toutes les commandes sont jouées OU après `skip()`. */
  get done(): boolean {
    return this._done
  }

  /** Appelle `this.stage.clearAll()` et remet à zéro. */
  dispose(): void {
    this.stage.clearAll()
    this.scheduled = []
    this.cursor = 0
    this._done = false
  }
}

// ---------------------------------------------------------------------------
// Utilitaire
// ---------------------------------------------------------------------------

/**
 * Calcule la durée totale d'un script en millisecondes.
 * = somme des `ms` de toutes les commandes `wait`.
 */
export function scriptDurationMs(script: readonly IntroCommand[]): number {
  let total = 0
  for (const cmd of script) {
    if (cmd.kind === 'wait') {
      total += cmd.ms
    }
  }
  return total
}
