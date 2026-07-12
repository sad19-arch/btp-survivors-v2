import { describe, it, expect } from 'vitest'
import { PerfProbe } from '@render/perf/perfProbe'

describe('PerfProbe', () => {
  it('moyenne les durées mesurées par section (horloge injectée)', () => {
    const ticks = [0, 5, 100, 103] // begin,end pour 2 mesures : 5ms puis 3ms
    let i = 0
    const probe = new PerfProbe(() => ticks[i++] as number)
    probe.measure('sim', () => {})
    probe.measure('sim', () => {})
    expect(probe.snapshot().sections.sim).toBe(4) // (5+3)/2
  })

  it('expose les compteurs et une section vide vaut 0', () => {
    const probe = new PerfProbe(() => 0)
    probe.count('enemies', 217)
    expect(probe.snapshot().counts.enemies).toBe(217)
    expect(probe.snapshot().sections.sim).toBeUndefined()
  })
})
