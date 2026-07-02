import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { recomputePlayerStats } from '@core/systems/playerStats'
import { PLAYER_BASE } from '@content/config'

function makePlayer(w: World) {
  const e = w.spawn()
  w.add(e, 'health', { hp: PLAYER_BASE.hp, maxHp: PLAYER_BASE.hp })
  w.add(e, 'player', { playerId: 1, speed: PLAYER_BASE.speed, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: PLAYER_BASE.pickupRadius })
  w.add(e, 'passives', { list: [] })
  return e
}

describe('recomputePlayerStats', () => {
  it('sans passif → stats de base', () => {
    const w = new World(); const e = makePlayer(w)
    recomputePlayerStats(w, e)
    expect(w.get(e, 'player')!.speed).toBe(PLAYER_BASE.speed)
    expect(w.get(e, 'health')!.maxHp).toBe(PLAYER_BASE.hp)
  })
  it('Casque niv.5 → +50 % PV max, ratio conservé', () => {
    const w = new World(); const e = makePlayer(w)
    w.get(e, 'health')!.hp = PLAYER_BASE.hp / 2
    w.get(e, 'passives')!.list = [{ id: 'casque_homologue', level: 5 }]
    recomputePlayerStats(w, e)
    expect(w.get(e, 'health')!.maxHp).toBeCloseTo(PLAYER_BASE.hp * 1.5)
    expect(w.get(e, 'health')!.hp).toBeCloseTo(PLAYER_BASE.hp * 1.5 / 2)
  })
})
