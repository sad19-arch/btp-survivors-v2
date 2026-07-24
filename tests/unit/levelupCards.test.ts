import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'

describe('level-up par cartes (sim)', () => {
  it('monter de niveau propose des cartes et le choix les applique', () => {
    const sim = new Simulation({ seed: 5, mode: 'solo' })
    sim.debugAddXp(25)
    let sawChoices = false
    for (let t = 0; t < 1000; t += 100) {
      sim.advanceTime(100)
      const st = sim.getState()
      if (st.pendingLevelUp) {
        expect(st.pendingLevelUp.choices.length).toBeGreaterThan(0)
        expect(typeof st.pendingLevelUp.choices[0]?.name).toBe('string')
        sawChoices = true
        sim.chooseUpgrade(0)
        break
      }
    }
    expect(sawChoices).toBe(true)
  })
})
