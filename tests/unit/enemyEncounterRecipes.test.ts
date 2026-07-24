import { describe, expect, it } from 'vitest'
import { Rng } from '@core/rng'
import { World } from '@core/world'
import { createWaveDirectorState, stepWaveDirector } from '@core/systems/waveDirector'
import { spawnGroup } from '@core/systems/spawn'
import { PHASES, ConstructionPhaseId } from '@content/phases'
import { SPAWN_RAMP } from '@content/spawnRamp'
import type { WaveEventDef } from '@content/waveEvents'
import { placeEvent } from '@content/waveEvents'

const SWARM_RECIPE: readonly WaveEventDef[] = [{
  kind: 'burst', weight: 1, countMin: 16, countMax: 16, allowedFromSec: 0,
  role: 'swarm', threatCost: 0.25
}]

describe('recettes de rencontre par rôle', () => {
  it('convertit quatre points de menace en une grappe de seize faibles', () => {
    const state = createWaveDirectorState()
    state.nextEventMs = 0
    state.budgetAcc = 4
    const rng = new Rng(42)
    const input = {
      dtMs: 16, elapsedMs: 1_000, center: { x: 0, y: 0 }, ramp: SPAWN_RAMP,
      events: SWARM_RECIPE, ringRadius: 600, rng
    }
    expect(stepWaveDirector(state, input)).toEqual([])
    const placements = stepWaveDirector(state, { ...input, elapsedMs: 2_000 })
    expect(placements).toHaveLength(16)
    expect(placements.every((p) => p.role === 'swarm')).toBe(true)
    expect(state.budgetAcc).toBeLessThan(0.1)
  })

  it('spawnGroup respecte le rôle au lieu de tirer dans tout le pool', () => {
    const phase = PHASES[ConstructionPhaseId.TERRAIN_VIERGE]
    expect(phase).toBeDefined()
    if (phase === undefined) {
      return
    }
    const world = new World()
    spawnGroup(world, new Rng(7), phase, { x: 1000, y: 1000 }, [
      { angle: 0, radius: 500, behavior: 'chase', role: 'swarm' },
      { angle: 1, radius: 500, behavior: 'chase', role: 'swarm' }
    ])
    const types = [...world.query('enemy')].map((e) => world.get(e, 'enemy')?.type)
    expect(types).toEqual(['motton', 'motton'])
  })

  it('une recette mixte répète une composition lisible', () => {
    const placements = placeEvent('pincer', 6, 600, new Rng(9), undefined, undefined, undefined, ['tank', 'base', 'base'])
    expect(placements.map((placement) => placement.role)).toEqual([
      'tank', 'base', 'base', 'tank', 'base', 'base'
    ])
  })
})
