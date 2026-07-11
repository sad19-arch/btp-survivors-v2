import { describe, it, expect } from 'vitest'
import { planNpcJobs } from '@render/workerBehavior'
import { emptyLayout } from '@content/stageLayout'

describe('planNpcJobs (compo → PNJ posés uniquement)', () => {
  it('1 npc métier posé → 1 job npc_trade, coords monde', () => {
    const l = emptyLayout('terrain_vierge')
    l.npcs = [{ id: 'n1', skin: 'npc_stage01', kind: 'trade', x: 100, y: -50 }]
    const jobs = planNpcJobs(l, 10240, 7680)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toEqual({ role: 'npc_trade', x: 5220, y: 3790, skin: 'npc_stage01' })
  })
  it('un ouvrier → npc_worker', () => {
    const l = emptyLayout('terrain_vierge')
    l.npcs = [{ id: 'w', skin: 'npc_stage01_ouvrier_a', kind: 'worker', x: 0, y: 0 }]
    expect(planNpcJobs(l, 10240, 7680)[0]?.role).toBe('npc_worker')
  })
  it('compo sans npc → 0 job (aucun auto)', () => {
    expect(planNpcJobs(emptyLayout('terrain_vierge'), 10240, 7680)).toEqual([])
  })
})
