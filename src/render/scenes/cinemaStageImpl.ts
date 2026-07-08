/**
 * Implémentation testable de CinemaStage (acteurs cosmétiques + cleanup zéro-fuite).
 *
 * COSMÉTIQUE uniquement : aucun import @core, aucun world.*, aucun Phaser direct.
 * Toutes les opérations réelles sont déléguées aux CinemaDeps injectées.
 * Le vrai host Phaser est câblé en Task 5.
 *
 * Invariant CRITIQUE : clearAll() détruit tous les acteurs et previews,
 * actorCount retombe à 0, aucune accumulation sur load/clear répétés.
 */

import type { CinemaStage, Ease } from '@render/scenes/introSequencer'

// ---------------------------------------------------------------------------
// Interfaces d'injection (testables sans Phaser)
// ---------------------------------------------------------------------------

/** Un acteur cosmétique (sprite). Abstraction testable du GameObject Phaser. */
export interface CinemaActor {
  setPosition(x: number, y: number): void
  moveTo(x: number, y: number, ms: number): void
  play(anim: string): void
  destroy(): void
}

/** Dépendances injectées (le host Phaser réel est câblé en Task 5). */
export interface CinemaDeps {
  camCut(cx: number, cy: number, zoom: number): void
  camZoomTo(cx: number, cy: number, zoom: number, ms: number, ease: Ease): void
  camPunchIn(cx: number, cy: number, zoom: number, ms: number): void
  camWhipPan(cx: number, cy: number, ms: number): void
  slowmo(scale: number, ms: number): void
  banner(text: string): void
  voice(key: string): void
  sfx(key: string): void
  flash(): void
  shake(intensity: number): void
  /** Crée un sprite cosmétique et renvoie son handle. */
  makeActor(key: string, x: number, y: number, scale: number): CinemaActor
}

// ---------------------------------------------------------------------------
// Offsets de preview déterministes (spirale de Vogel — pas de random)
// Constante dorée de Fibonacci : ~2.399 radians ≈ 137.5°
// ---------------------------------------------------------------------------

function previewOffsetX(i: number): number {
  return Math.cos(i * 2.399) * i * 3
}

function previewOffsetY(i: number): number {
  return Math.sin(i * 2.399) * i * 3
}

// ---------------------------------------------------------------------------
// Implémentation
// ---------------------------------------------------------------------------

export class CinemaStageImpl implements CinemaStage {
  private readonly actors = new Map<string, CinemaActor>()
  private readonly previews: CinemaActor[] = []

  constructor(private readonly deps: CinemaDeps) {}

  // --- Passe-plats effets ---

  banner(text: string): void {
    this.deps.banner(text)
  }

  voice(key: string): void {
    this.deps.voice(key)
  }

  sfx(key: string): void {
    this.deps.sfx(key)
  }

  flash(): void {
    this.deps.flash()
  }

  shake(intensity: number): void {
    this.deps.shake(intensity)
  }

  // --- Passe-plats caméra ---

  camCut(cx: number, cy: number, zoom: number): void {
    this.deps.camCut(cx, cy, zoom)
  }

  camZoomTo(cx: number, cy: number, zoom: number, ms: number, ease: Ease): void {
    this.deps.camZoomTo(cx, cy, zoom, ms, ease)
  }

  camPunchIn(cx: number, cy: number, zoom: number, ms: number): void {
    this.deps.camPunchIn(cx, cy, zoom, ms)
  }

  camWhipPan(cx: number, cy: number, ms: number): void {
    this.deps.camWhipPan(cx, cy, ms)
  }

  camSlowmo(scale: number, ms: number): void {
    this.deps.slowmo(scale, ms)
  }

  // --- Acteurs cosmétiques ---

  actor(id: string, key: string, x: number, y: number, scale: number): void {
    // Si l'id existe déjà, détruire l'ancien d'abord (pas de fuite).
    const existing = this.actors.get(id)
    if (existing !== undefined) {
      existing.destroy()
    }
    const a = this.deps.makeActor(key, x, y, scale)
    this.actors.set(id, a)
  }

  preview(key: string, x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const px = x + previewOffsetX(i)
      const py = y + previewOffsetY(i)
      const a = this.deps.makeActor(key, px, py, 1)
      this.previews.push(a)
    }
  }

  move(id: string, x: number, y: number, ms: number): void {
    // no-op silencieux si id inconnu (cosmétique)
    this.actors.get(id)?.moveTo(x, y, ms)
  }

  play(id: string, anim: string): void {
    // no-op silencieux si id inconnu (cosmétique)
    this.actors.get(id)?.play(anim)
  }

  /**
   * Détruit tous les acteurs et previews.
   * INVARIANT CRITIQUE : actorCount === 0 après cet appel.
   * Aucune accumulation possible sur des cycles load/clearAll répétés.
   */
  clearAll(): void {
    for (const a of this.actors.values()) {
      a.destroy()
    }
    this.actors.clear()

    for (const p of this.previews) {
      p.destroy()
    }
    this.previews.length = 0
  }

  /**
   * Sonde : nombre total d'acteurs gérés (actors Map + previews tableau).
   * Utilisé par l'e2e Task 5 et les tests de non-accumulation.
   */
  get actorCount(): number {
    return this.actors.size + this.previews.length
  }
}
