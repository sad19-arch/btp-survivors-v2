import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'

describe('getState — inventaire joueur exposé', () => {
  it('le joueur démarre avec cloueur niv.1 et 0 passif', () => {
    const players = new Simulation({ seed: 2, mode: 'solo' }).getState().players
    const p = players[0]
    if (p === undefined) {
      throw new Error('No player found')
    }
    expect(p.weapons).toEqual(['cloueur'])
    expect(p.weaponLevels).toEqual([1])
    expect(p.passives).toEqual([])
  })
})
