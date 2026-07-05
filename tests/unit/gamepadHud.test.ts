import { describe, it, expect } from 'vitest'
import { gamepadHudModel, MAX_PADS } from '@ui/gamepadHud'

describe('gamepadHudModel', () => {
  it('aucune manette → 0/4, 4 slots éteints', () => {
    const m = gamepadHudModel([])
    expect(m.count).toBe(0)
    expect(m.slots).toEqual([false, false, false, false])
  })

  it('ignore les trous null et les manettes déconnectées (connected=false)', () => {
    const m = gamepadHudModel([{ connected: true }, null, { connected: false }, { connected: true }])
    expect(m.slots).toEqual([true, false, false, true])
    expect(m.count).toBe(2)
  })

  it('ne dépasse jamais MAX_PADS slots (manettes au-delà ignorées)', () => {
    const many = Array.from({ length: 8 }, () => ({ connected: true }))
    const m = gamepadHudModel(many)
    expect(m.slots.length).toBe(MAX_PADS)
    expect(m.count).toBe(MAX_PADS)
  })

  it('une seule manette au slot 1 → 1/4', () => {
    const m = gamepadHudModel([{ connected: true }])
    expect(m.slots).toEqual([true, false, false, false])
    expect(m.count).toBe(1)
  })
})
