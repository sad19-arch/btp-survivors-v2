/**
 * Tests Task 10 -- Telegraphe des formations.
 *
 * Verifie que :
 *   1. Quand le directeur declenche une formation, state.upcoming est non nul
 *      (triggersInMs ~= TELEGRAPH_LEAD_MS), et AUCUN placement n'est emis ce pas-ci.
 *   2. ~0.8 s plus tard, les placements sont emis et upcoming se vide.
 *   3. Determinisme : meme seed -> memes annonces/instants.
 *   4. Le filet de fond (trickle) est IMMEDIAT : aucun upcoming ne le bloque.
 *
 * Pas de garde silencieuse : chaque assertion est explicite.
 */

import { describe, it, expect } from 'vitest'
import { Rng } from '@core/rng'
import { createWaveDirectorState, stepWaveDirector } from '@core/systems/waveDirector'
import { SPAWN_RAMP } from '@content/spawnRamp'
import { EVENT_POOL_DEFAULT } from '@content/waveEvents'
import { SPAWN, TELEGRAPH_LEAD_MS } from '@content/config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CENTER = { x: 800, y: 600 }

/**
 * Avance le directeur jusqu'au premier pas ou state.upcoming !== null.
 * Retourne { elapsedMs, triggersAtMs } ou leve une erreur apres limitMs.
 */
function advanceUntilAnnounced(
  limitMs = 20_000,
  dt = 16
): { elapsedMs: number; triggersAtMs: number } {
  const state = createWaveDirectorState()
  const rng = new Rng(42)

  for (let t = 0; t < limitMs; t += dt) {
    const placements = stepWaveDirector(state, {
      dtMs: dt,
      elapsedMs: t,
      center: CENTER,
      ramp: SPAWN_RAMP,
      events: EVENT_POOL_DEFAULT,
      ringRadius: SPAWN.ringRadius,
      rng
    })

    if (state.upcoming !== null) {
      // Ce pas-ci : formation annoncee, aucun placement.
      expect(placements, 'Formation annoncee ce pas -- aucun placement').toHaveLength(0)
      return { elapsedMs: t, triggersAtMs: state.upcoming.triggersAtMs }
    }
  }
  throw new Error(`Aucune formation annoncee avant ${limitMs} ms`)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('telegraphe des formations -- directeur en deux temps', () => {
  it('quand une formation est decidee, upcoming est non nul et aucun placement emis', () => {
    const { elapsedMs, triggersAtMs } = advanceUntilAnnounced()

    // triggersAtMs doit etre ~= elapsedMs + TELEGRAPH_LEAD_MS (+-1 pas = 16 ms).
    const delta = triggersAtMs - elapsedMs
    expect(delta, 'triggersAtMs - elapsedMs ~= TELEGRAPH_LEAD_MS').toBeGreaterThanOrEqual(
      TELEGRAPH_LEAD_MS - 16
    )
    expect(delta, 'triggersAtMs - elapsedMs ~= TELEGRAPH_LEAD_MS').toBeLessThanOrEqual(
      TELEGRAPH_LEAD_MS + 16
    )
  })

  it('0.8 s apres l annonce, les placements sont emis et upcoming se vide', () => {
    const state = createWaveDirectorState()
    const rng = new Rng(42)
    const dt = 16
    const limit = 20_000

    // Phase 1 : avancer jusqu'a l annonce.
    let announceMs = -1
    let triggersAtMs = -1

    for (let t = 0; t < limit && announceMs < 0; t += dt) {
      stepWaveDirector(state, {
        dtMs: dt,
        elapsedMs: t,
        center: CENTER,
        ramp: SPAWN_RAMP,
        events: EVENT_POOL_DEFAULT,
        ringRadius: SPAWN.ringRadius,
        rng
      })
      if (state.upcoming !== null) {
        announceMs = t
        triggersAtMs = state.upcoming.triggersAtMs
      }
    }
    expect(announceMs, 'une annonce doit etre faite').toBeGreaterThanOrEqual(0)

    // Phase 2 : avancer jusqu'a triggersAtMs (inclus).
    let spawnedPlacements: unknown[] = []
    for (let t = announceMs + dt; t <= triggersAtMs + dt * 2; t += dt) {
      const placements = stepWaveDirector(state, {
        dtMs: dt,
        elapsedMs: t,
        center: CENTER,
        ramp: SPAWN_RAMP,
        events: EVENT_POOL_DEFAULT,
        ringRadius: SPAWN.ringRadius,
        rng
      })
      if (placements.length > 0) {
        spawnedPlacements = placements
        break
      }
    }

    expect(spawnedPlacements.length, 'des placements doivent etre emis apres triggersAtMs').toBeGreaterThan(0)
    expect(state.upcoming, 'upcoming doit etre null apres le spawn').toBeNull()
  })

  it('determinisme : meme seed -> memes annonces et memes instants', () => {
    function runUntilAnnounced(seed: number): { elapsedMs: number; kind: string; triggersAtMs: number } {
      const state = createWaveDirectorState()
      const rng = new Rng(seed)
      const dt = 16

      for (let t = 0; t < 20_000; t += dt) {
        stepWaveDirector(state, {
          dtMs: dt,
          elapsedMs: t,
          center: CENTER,
          ramp: SPAWN_RAMP,
          events: EVENT_POOL_DEFAULT,
          ringRadius: SPAWN.ringRadius,
          rng
        })
        if (state.upcoming !== null) {
          return { elapsedMs: t, kind: state.upcoming.kind, triggersAtMs: state.upcoming.triggersAtMs }
        }
      }
      throw new Error('aucune annonce')
    }

    const run1 = runUntilAnnounced(42)
    const run2 = runUntilAnnounced(42)
    const run3 = runUntilAnnounced(99)

    expect(run1.elapsedMs).toBe(run2.elapsedMs)
    expect(run1.kind).toBe(run2.kind)
    expect(run1.triggersAtMs).toBe(run2.triggersAtMs)

    // Seed differente -> peut etre different. On verifie juste la coherence.
    expect(Number.isFinite(run3.elapsedMs)).toBe(true)
    expect(run3.kind).toBeTruthy()
  })

  it('le filet de fond (1 ennemi) est IMMEDIAT -- upcoming reste null', () => {
    // En debut de run, le budget est faible et nextEventMs loin.
    // Le filet de fond spawn sans annoncer (upcoming reste null).
    const state = createWaveDirectorState()
    const rng = new Rng(42)
    const dt = 16

    let trickleFound = false
    // On avance sur 5 s max -- le filet se declenche des que budgetAcc >= 1.
    for (let t = 0; t < 5_000 && !trickleFound; t += dt) {
      const placements = stepWaveDirector(state, {
        dtMs: dt,
        elapsedMs: t,
        center: CENTER,
        ramp: SPAWN_RAMP,
        events: EVENT_POOL_DEFAULT,
        ringRadius: SPAWN.ringRadius,
        rng
      })
      if (placements.length === 1 && state.upcoming === null) {
        trickleFound = true
      }
    }
    expect(trickleFound, 'un filet de fond doit apparaitre sans declencher upcoming').toBe(true)
  })

  it('triggersInMs de upcoming est dans [0, TELEGRAPH_LEAD_MS] apres l annonce', () => {
    // Test que l upcoming expose le bon triggersInMs (calc sans Simulation).
    // On utilise directement le directeur (coherent avec les autres tests).
    const state = createWaveDirectorState()
    const rng = new Rng(42)
    const dt = 16
    const limit = 20_000

    let foundAnnouncement = false

    for (let t = 0; t < limit && !foundAnnouncement; t += dt) {
      stepWaveDirector(state, {
        dtMs: dt,
        elapsedMs: t,
        center: CENTER,
        ramp: SPAWN_RAMP,
        events: EVENT_POOL_DEFAULT,
        ringRadius: SPAWN.ringRadius,
        rng
      })
      if (state.upcoming !== null) {
        foundAnnouncement = true
        const triggersInMs = Math.max(0, state.upcoming.triggersAtMs - t)
        expect(triggersInMs, 'triggersInMs >= 0').toBeGreaterThanOrEqual(0)
        expect(triggersInMs, 'triggersInMs <= TELEGRAPH_LEAD_MS').toBeLessThanOrEqual(TELEGRAPH_LEAD_MS + dt)
        expect(typeof state.upcoming.kind, 'kind doit etre string').toBe('string')
        expect(typeof state.upcoming.angle, 'angle doit etre number').toBe('number')
        expect(typeof state.upcoming.radius, 'radius doit etre number').toBe('number')
      }
    }

    expect(foundAnnouncement, 'upcoming doit devenir non nul dans les 20 s').toBe(true)
  })

  it('upcoming retombe a null apres le spawn (apres triggersAtMs)', () => {
    // Test que upcoming est null une fois l annonce consommee (spawn materialise).
    const state = createWaveDirectorState()
    const rng = new Rng(42)
    const dt = 16
    const limit = 20_000

    // Phase 1 : trouver l annonce.
    let announceMs = -1
    for (let t = 0; t < limit && announceMs < 0; t += dt) {
      stepWaveDirector(state, {
        dtMs: dt,
        elapsedMs: t,
        center: CENTER,
        ramp: SPAWN_RAMP,
        events: EVENT_POOL_DEFAULT,
        ringRadius: SPAWN.ringRadius,
        rng
      })
      if (state.upcoming !== null) {
        announceMs = t
      }
    }
    expect(announceMs, 'une annonce doit etre trouvee').toBeGreaterThanOrEqual(0)

    // Phase 2 : avancer jusqu'a spawner (max 2 s apres l annonce).
    let spawned = false
    for (let t = announceMs + dt; t <= announceMs + TELEGRAPH_LEAD_MS + 2 * dt; t += dt) {
      const placements = stepWaveDirector(state, {
        dtMs: dt,
        elapsedMs: t,
        center: CENTER,
        ramp: SPAWN_RAMP,
        events: EVENT_POOL_DEFAULT,
        ringRadius: SPAWN.ringRadius,
        rng
      })
      if (placements.length > 0 && state.upcoming === null) {
        spawned = true
        break
      }
    }
    expect(spawned, 'upcoming doit etre null apres le spawn').toBe(true)
  })
})
