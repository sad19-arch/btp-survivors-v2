/**
 * Tests Task 6 : flux `waveRng` isolé + helper `spawnGroup`.
 * Tests Task 8 : directeur de vagues (conservation de budget + déterminisme).
 *
 * Exigence clé : consommer `waveRng` (via spawnGroup) ne doit PAS décaler
 * le flux `rng` principal (spawn de vagues ordinaires → ennemis identiques).
 */
import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { Rng } from '@core/rng'
import { spawnGroup, spawnWave } from '@core/systems/spawn'
import { PHASES, ConstructionPhaseId, phasePoolIds } from '@content/phases'
import type { ConstructionPhase } from '@content/phases'
import type { WavePlacement } from '@core/types'
import { createWaveDirectorState, stepWaveDirector } from '@core/systems/waveDirector'
import { SPAWN_RAMP, spawnParamsAt } from '@content/spawnRamp'
import { EVENT_POOL_DEFAULT } from '@content/waveEvents'
import { SPAWN } from '@content/config'

function terrainVierge(): ConstructionPhase {
  const phase = PHASES[ConstructionPhaseId.TERRAIN_VIERGE]
  if (phase === undefined) {
    throw new Error('phase terrain_vierge manquante')
  }
  return phase
}

/** Snapshots le résultat d'une spawnWave (type@x,y) pour comparaison. */
function waveSnapshot(rng: Rng, phase: ConstructionPhase): string[] {
  const w = new World()
  spawnWave(w, rng, phase, { x: 800, y: 600 }, 5)
  return [...w.query('enemy', 'position')].map((e) => {
    const en = w.get(e, 'enemy')
    const pos = w.get(e, 'position')
    return `${en?.type}@${Math.round(pos?.x ?? 0)},${Math.round(pos?.y ?? 0)}`
  })
}

describe('waveRng — isolation du flux', () => {
  it('consommer waveRng ne décale pas le flux rng principal', () => {
    const phase = terrainVierge()
    const SEED = 42

    // Flux A : rng principal non perturbé
    const rngA = new Rng(SEED)
    const snapshotA = waveSnapshot(rngA, phase)

    // Flux B : on consomme le waveRng AVANT de faire la même spawnWave
    const rngB = new Rng(SEED)
    const waveRngB = new Rng((SEED ^ 0x5a1e) | 0)

    // Consommer waveRng via spawnGroup (simule ce que fait le directeur de vagues)
    const placements: WavePlacement[] = [
      { angle: 0, radius: 200, behavior: 'chase' },
      { angle: Math.PI / 2, radius: 200, behavior: 'zigzag' },
      { angle: Math.PI, radius: 200, behavior: 'circler' }
    ]
    const wB = new World()
    spawnGroup(wB, waveRngB, phase, { x: 400, y: 300 }, placements)

    // Le flux rngB doit produire exactement les mêmes ennemis que rngA
    const snapshotB = waveSnapshot(rngB, phase)
    expect(snapshotB).toEqual(snapshotA)
  })

  it('waveRng avec seed différente produit des snapshots différents de rng', () => {
    const phase = terrainVierge()
    const snap1 = waveSnapshot(new Rng(1), phase)
    const snap2 = waveSnapshot(new Rng(2), phase)
    // Vérifie que les seeds différentes donnent des résultats différents
    // (sanity check : la sim est bien déterministe, pas constante)
    expect(snap1).not.toEqual(snap2)
  })
})

describe('spawnGroup', () => {
  it('crée exactement N entités ennemies pour N placements', () => {
    const phase = terrainVierge()
    const w = new World()
    const rng = new Rng(7)

    const placements: WavePlacement[] = [
      { angle: 0, radius: 150, behavior: 'chase' },
      { angle: Math.PI / 3, radius: 150, behavior: 'zigzag' },
      { angle: (2 * Math.PI) / 3, radius: 200, behavior: 'sweep', bAngle: 1.0 }
    ]

    spawnGroup(w, rng, phase, { x: 500, y: 400 }, placements)

    const enemies = [...w.query('enemy', 'position', 'health')]
    expect(enemies).toHaveLength(3)
  })

  it('pose le bon behavior sur chaque ennemi', () => {
    const phase = terrainVierge()
    const w = new World()
    const rng = new Rng(13)

    const placements: WavePlacement[] = [
      { angle: 0, radius: 100, behavior: 'chase' },
      { angle: Math.PI / 2, radius: 100, behavior: 'zigzag' },
      { angle: Math.PI, radius: 100, behavior: 'circler' }
    ]

    spawnGroup(w, rng, phase, { x: 0, y: 0 }, placements)

    const behaviors: string[] = []
    for (const e of w.query('enemy')) {
      const comp = w.get(e, 'enemy')
      expect(comp).toBeDefined()
      if (comp !== undefined) {
        behaviors.push(comp.behavior ?? 'chase')
      }
    }
    // Les 3 behaviors doivent tous être présents (dans l'ordre d'itération)
    expect(behaviors).toContain('chase')
    expect(behaviors).toContain('zigzag')
    expect(behaviors).toContain('circler')
  })

  it('pose bAngle quand fourni dans le placement', () => {
    const phase = terrainVierge()
    const w = new World()
    const rng = new Rng(99)

    const expectedAngle = 2.5
    const placements: WavePlacement[] = [
      { angle: 0, radius: 100, behavior: 'sweep', bAngle: expectedAngle }
    ]

    spawnGroup(w, rng, phase, { x: 0, y: 0 }, placements)

    const enemies = [...w.query('enemy')]
    expect(enemies).toHaveLength(1)
    const first = enemies[0]
    if (first === undefined) {
      throw new Error('aucun ennemi spawné')
    }
    const comp = w.get(first, 'enemy')
    expect(comp).toBeDefined()
    if (comp === undefined) {
      throw new Error('composant enemy manquant')
    }
    expect(comp.bAngle).toBeCloseTo(expectedAngle, 5)
  })

  it('calcule la position via angle/radius par rapport au centre', () => {
    const phase = terrainVierge()
    const w = new World()
    const rng = new Rng(55)

    const center = { x: 400, y: 300 }
    const radius = 250
    const angle = Math.PI / 4 // 45°

    const placements: WavePlacement[] = [
      { angle, radius, behavior: 'chase' }
    ]

    spawnGroup(w, rng, phase, center, placements)

    const enemies = [...w.query('enemy', 'position')]
    expect(enemies).toHaveLength(1)
    const first = enemies[0]
    if (first === undefined) {
      throw new Error('aucun ennemi spawné')
    }
    const pos = w.get(first, 'position')
    expect(pos).toBeDefined()
    if (pos === undefined) {
      throw new Error('position manquante')
    }
    expect(pos.x).toBeCloseTo(center.x + Math.cos(angle) * radius, 3)
    expect(pos.y).toBeCloseTo(center.y + Math.sin(angle) * radius, 3)
  })

  it('est déterministe : même seed + mêmes placements → même résultat', () => {
    const phase = terrainVierge()
    const placements: WavePlacement[] = [
      { angle: 1.2, radius: 180, behavior: 'zigzag' },
      { angle: 2.4, radius: 180, behavior: 'chase' }
    ]

    const snapshot = (): string[] => {
      const w = new World()
      spawnGroup(w, new Rng(77), phase, { x: 200, y: 200 }, placements)
      return [...w.query('enemy', 'position')].map((e) => {
        const en = w.get(e, 'enemy')
        const pos = w.get(e, 'position')
        return `${en?.type}@${Math.round(pos?.x ?? 0)},${Math.round(pos?.y ?? 0)}@${en?.behavior}`
      })
    }

    expect(snapshot()).toEqual(snapshot())
  })

  it('ne spawne rien si la liste de placements est vide', () => {
    const phase = terrainVierge()
    const w = new World()
    const rng = new Rng(1)
    spawnGroup(w, rng, phase, { x: 0, y: 0 }, [])
    expect([...w.query('enemy')]).toHaveLength(0)
  })

  it('les types pondus appartiennent au pool de la phase', () => {
    const phase = terrainVierge()
    const pool = phasePoolIds(phase)
    const w = new World()
    const rng = new Rng(42)

    const placements: WavePlacement[] = Array.from({ length: 6 }, (_, i) => ({
      angle: (i * Math.PI * 2) / 6,
      radius: 200,
      behavior: 'chase' as const
    }))

    spawnGroup(w, rng, phase, { x: 800, y: 600 }, placements)

    for (const e of w.query('enemy')) {
      const comp = w.get(e, 'enemy')
      expect(comp).toBeDefined()
      if (comp !== undefined) {
        expect(pool).toContain(comp.type)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Task 8 — stepWaveDirector
// ---------------------------------------------------------------------------

describe('waveDirector — conservation du budget', () => {
  it('Σ placements ≈ Σ rampe plate (±15 %) sur 60 s à dt=16 ms', () => {
    const DURATION_MS = 60_000
    const DT_MS = 16
    const CENTER = { x: 800, y: 600 }

    // Budget attendu par la rampe plate.
    let expectedBudget = 0
    {
      let t = 0
      while (t < DURATION_MS) {
        const { intervalMs, countPerWave } = spawnParamsAt(SPAWN_RAMP, t)
        expectedBudget += (DT_MS / intervalMs) * countPerWave
        t += DT_MS
      }
    }

    // Budget émis par le directeur.
    const state = createWaveDirectorState()
    const rng = new Rng(42)
    let actualPlacements = 0
    let t = 0
    while (t < DURATION_MS) {
      const placements = stepWaveDirector(state, {
        dtMs: DT_MS,
        elapsedMs: t,
        center: CENTER,
        ramp: SPAWN_RAMP,
        events: EVENT_POOL_DEFAULT,
        ringRadius: SPAWN.ringRadius,
        rng
      })
      actualPlacements += placements.length
      t += DT_MS
    }

    const ratio = actualPlacements / expectedBudget
    // Tolérance ±15 % (borne haute) + résidualité basse ≈ 5 % :
    // le dernier événement peut rester en stock si son slot tombe en fin de fenêtre,
    // ce qui explique que le ratio réel mesure ~0.96 (< 1.0) sur 60 s à dt=16 ms.
    // Borne basse 0.85 = plancher défensif (~11 pts sous le réel 0.96) ;
    // si cette assertion saute, c'est une vraie fuite de budget à investiguer.
    expect(ratio).toBeGreaterThanOrEqual(0.85)
    expect(ratio).toBeLessThanOrEqual(1.15)
  })
})

describe('waveDirector — déterminisme', () => {
  it('même seed → même séquence de placements', () => {
    const DURATION_MS = 60_000
    const DT_MS = 16
    const CENTER = { x: 800, y: 600 }
    const SEED = 7

    const runDirector = (): string[] => {
      const state = createWaveDirectorState()
      const rng = new Rng(SEED)
      const log: string[] = []
      let t = 0
      while (t < DURATION_MS) {
        const placements = stepWaveDirector(state, {
          dtMs: DT_MS,
          elapsedMs: t,
          center: CENTER,
          ramp: SPAWN_RAMP,
          events: EVENT_POOL_DEFAULT,
          ringRadius: SPAWN.ringRadius,
          rng
        })
        if (placements.length > 0) {
          log.push(`t=${t}:count=${placements.length}:b0=${placements[0]?.behavior ?? '?'}`)
        }
        t += DT_MS
      }
      return log
    }

    const run1 = runDirector()
    const run2 = runDirector()
    expect(run1).toEqual(run2)
    // Sanity : au moins un spawn dans 60 s.
    expect(run1.length).toBeGreaterThan(0)
  })

  it('au moins un événement groupé (≥ countMin=4) sur 3 minutes', () => {
    const DURATION_MS = 180_000
    const DT_MS = 16
    const CENTER = { x: 800, y: 600 }

    const state = createWaveDirectorState()
    const rng = new Rng(42)
    let maxGroupSize = 0
    let t = 0
    while (t < DURATION_MS) {
      const placements = stepWaveDirector(state, {
        dtMs: DT_MS,
        elapsedMs: t,
        center: CENTER,
        ramp: SPAWN_RAMP,
        events: EVENT_POOL_DEFAULT,
        ringRadius: SPAWN.ringRadius,
        rng
      })
      if (placements.length > maxGroupSize) {
        maxGroupSize = placements.length
      }
      t += DT_MS
    }

    // Le plus gros événement doit être ≥ countMin du plus petit event (4 pour converge).
    expect(maxGroupSize).toBeGreaterThanOrEqual(4)
  })

  it("allowedFromSec respecté — aucun encircle avant 120 s", () => {
    const DURATION_MS = 119_000
    const DT_MS = 16
    const CENTER = { x: 800, y: 600 }

    const state = createWaveDirectorState()
    const rng = new Rng(99)
    let encircleFound = false
    let t = 0
    while (t < DURATION_MS) {
      const placements = stepWaveDirector(state, {
        dtMs: DT_MS,
        elapsedMs: t,
        center: CENTER,
        ramp: SPAWN_RAMP,
        events: EVENT_POOL_DEFAULT,
        ringRadius: SPAWN.ringRadius,
        rng
      })
      // encircle donne behavior 'circler' (placeEncircle).
      for (const p of placements) {
        if (p.behavior === 'circler') {
          encircleFound = true
        }
      }
      t += DT_MS
    }

    expect(encircleFound).toBe(false)
  })
})
