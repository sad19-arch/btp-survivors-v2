/**
 * Tests TDD pour CinemaStageImpl.
 *
 * Invariant CRITIQUE : cleanup zéro-fuite.
 * clearAll() doit détruire TOUS les acteurs, actorCount retombe à 0,
 * aucune accumulation sur des cycles actor+preview / clearAll répétés.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CinemaStageImpl } from '@render/scenes/cinemaStageImpl'
import type { CinemaActor, CinemaDeps } from '@render/scenes/cinemaStageImpl'
import type { Ease } from '@render/scenes/introSequencer'

// ---------------------------------------------------------------------------
// Fake CinemaActor — trace les destructions
// ---------------------------------------------------------------------------

interface FakeActor extends CinemaActor {
  destroyed: boolean
  key: string
  x: number
  y: number
  scale: number
}

function makeFakeActor(key: string, x: number, y: number, scale: number): FakeActor {
  return {
    destroyed: false,
    key,
    x,
    y,
    scale,
    setPosition() { /* no-op cosmétique */ },
    moveTo() { /* no-op cosmétique */ },
    play() { /* no-op cosmétique */ },
    destroy() { this.destroyed = true },
  }
}

// ---------------------------------------------------------------------------
// Fake CinemaDeps — journal + liste globale des acteurs créés
// ---------------------------------------------------------------------------

function makeFakeDeps(): { deps: CinemaDeps; log: string[]; created: FakeActor[] } {
  const log: string[] = []
  const created: FakeActor[] = []

  const deps: CinemaDeps = {
    camCut(cx, cy, zoom) { log.push(`camCut:${cx},${cy},${zoom}`) },
    camZoomTo(cx, cy, zoom, ms, ease) { log.push(`camZoomTo:${cx},${cy},${zoom},${ms},${ease}`) },
    camPunchIn(cx, cy, zoom, ms) { log.push(`camPunchIn:${cx},${cy},${zoom},${ms}`) },
    camWhipPan(cx, cy, ms) { log.push(`camWhipPan:${cx},${cy},${ms}`) },
    slowmo(scale, ms) { log.push(`slowmo:${scale},${ms}`) },
    banner(text) { log.push(`banner:${text}`) },
    voice(key) { log.push(`voice:${key}`) },
    sfx(key) { log.push(`sfx:${key}`) },
    flash() { log.push('flash') },
    shake(intensity) { log.push(`shake:${intensity}`) },
    makeActor(key, x, y, scale) {
      const a = makeFakeActor(key, x, y, scale)
      created.push(a)
      return a
    },
  }

  return { deps, log, created }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CinemaStageImpl', () => {
  let stage: CinemaStageImpl
  let log: string[]
  let created: FakeActor[]

  beforeEach(() => {
    const f = makeFakeDeps()
    stage = new CinemaStageImpl(f.deps)
    log = f.log
    created = f.created
  })

  // --- Cas 1 : passe-plats ---
  it('dispatche banner, flash et camPunchIn vers les deps (passe-plats)', () => {
    stage.banner('X')
    stage.flash()
    stage.camPunchIn(1, 2, 3, 120)

    expect(log).toContain('banner:X')
    expect(log).toContain('flash')
    expect(log).toContain('camPunchIn:1,2,3,120')
  })

  it('dispatche tous les autres passe-plats correctement', () => {
    stage.voice('vo_intro')
    stage.sfx('boom')
    stage.shake(0.8)
    stage.camCut(100, 200, 1.5)
    const ease: Ease = 'easeOut'
    stage.camZoomTo(50, 60, 2, 500, ease)
    stage.camWhipPan(300, 400, 200)
    stage.camSlowmo(0.3, 150)

    expect(log).toContain('voice:vo_intro')
    expect(log).toContain('sfx:boom')
    expect(log).toContain('shake:0.8')
    expect(log).toContain('camCut:100,200,1.5')
    expect(log).toContain('camZoomTo:50,60,2,500,easeOut')
    expect(log).toContain('camWhipPan:300,400,200')
    expect(log).toContain('slowmo:0.3,150')
  })

  // --- Cas 2 : acteurs comptés ---
  it('compte correctement un acteur nommé + 40 previews', () => {
    stage.actor('w', 'worker', 100, 200, 1.5)
    stage.preview('mob', 0, 0, 40)

    expect(stage.actorCount).toBe(41)
  })

  // --- Cas 3 : cleanup zéro-fuite ---
  it('clearAll() ramène actorCount à 0 et marque tous les fakes destroyed', () => {
    stage.actor('w', 'worker', 100, 200, 1.5)
    stage.preview('mob', 0, 0, 40)

    expect(stage.actorCount).toBe(41)
    expect(created).toHaveLength(41)

    stage.clearAll()

    expect(stage.actorCount).toBe(0)
    for (const a of created) {
      expect(a.destroyed).toBe(true)
    }
  })

  // --- Cas 4 : pas d'accumulation ---
  it('répéter (actor+preview puis clearAll) ×3 laisse actorCount à 0 et sans fuite', () => {
    for (let round = 0; round < 3; round++) {
      stage.actor('w', 'worker', 0, 0, 1)
      stage.preview('mob', 0, 0, 5)

      expect(stage.actorCount).toBe(6)

      stage.clearAll()

      expect(stage.actorCount).toBe(0)
    }

    // Tous les 18 acteurs créés doivent être destroyed
    expect(created).toHaveLength(18)
    for (const a of created) {
      expect(a.destroyed).toBe(true)
    }
  })

  // --- Cas 5 : remplacement d'id ---
  it("réassigner un id détruit l'ancien acteur (pas de fuite)", () => {
    stage.actor('w', 'spriteA', 0, 0, 1)
    const first = created[0]
    expect(first).toBeDefined()

    if (first === undefined) { throw new Error('first actor should exist') }
    expect(first.destroyed).toBe(false)

    stage.actor('w', 'spriteB', 10, 10, 2)

    expect(first.destroyed).toBe(true)
    expect(stage.actorCount).toBe(1)
    expect(created).toHaveLength(2)
  })

  // --- Cas 6 : preview déterministe ---
  it('deux stages produisent les mêmes positions pour preview (aucun random)', () => {
    const capturedA: Array<{ x: number; y: number }> = []
    const capturedB: Array<{ x: number; y: number }> = []

    const { deps: depsBase1 } = makeFakeDeps()
    const depsACap: CinemaDeps = {
      ...depsBase1,
      makeActor(key, x, y, scale) {
        capturedA.push({ x, y })
        return makeFakeActor(key, x, y, scale)
      },
    }

    const { deps: depsBase2 } = makeFakeDeps()
    const depsBCap: CinemaDeps = {
      ...depsBase2,
      makeActor(key, x, y, scale) {
        capturedB.push({ x, y })
        return makeFakeActor(key, x, y, scale)
      },
    }

    const stageA = new CinemaStageImpl(depsACap)
    const stageB = new CinemaStageImpl(depsBCap)

    stageA.preview('mob', 10, 10, 5)
    stageB.preview('mob', 10, 10, 5)

    expect(capturedA).toHaveLength(5)
    expect(capturedB).toHaveLength(5)

    for (let i = 0; i < 5; i++) {
      const a = capturedA[i]
      const b = capturedB[i]
      if (a === undefined || b === undefined) { throw new Error(`position ${i} manquante`) }
      expect(a.x).toBeCloseTo(b.x, 6)
      expect(a.y).toBeCloseTo(b.y, 6)
    }
  })

  // --- Cas bonus : move et play sont silencieux sur id inconnu ---
  it('move et play sur un id inconnu sont silencieux (no-op cosmétique)', () => {
    expect(() => {
      stage.move('unknown', 100, 200, 300)
      stage.play('unknown', 'walk')
    }).not.toThrow()
  })
})
