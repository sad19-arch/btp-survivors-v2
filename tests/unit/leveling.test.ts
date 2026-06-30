import { describe, it, expect } from 'vitest'
import { consumeLevelUp, initialProgress } from '@core/systems/leveling'
import { PROGRESSION } from '@content/config'

describe('consumeLevelUp', () => {
  it('ne monte pas de niveau sous le palier', () => {
    const p = initialProgress()
    p.xp = PROGRESSION.firstThreshold - 1
    expect(consumeLevelUp(p)).toBe(false)
    expect(p.level).toBe(1)
  })

  it('monte de niveau au palier, consomme l’XP et augmente le palier', () => {
    const p = initialProgress()
    p.xp = PROGRESSION.firstThreshold + 3
    expect(consumeLevelUp(p)).toBe(true)
    expect(p.level).toBe(2)
    expect(p.xp).toBe(3) // reste après consommation
    expect(p.nextThreshold).toBeGreaterThan(PROGRESSION.firstThreshold)
  })

  it('le premier palier vaut la config', () => {
    expect(initialProgress().nextThreshold).toBe(PROGRESSION.firstThreshold)
  })
})
