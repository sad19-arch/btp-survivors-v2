import { describe, it, expect } from 'vitest'
import { bossLevelHpMult, BOSS_HP_BY_PLAYER_LEVEL } from '@content/config'

describe('bossLevelHpMult (PV boss selon le niveau du joueur)', () => {
  it('renvoie 1 au niveau 1 (aucun bonus)', () => {
    expect(bossLevelHpMult(1)).toBe(1)
  })

  it('croît linéairement avec le niveau (pente k)', () => {
    expect(bossLevelHpMult(2)).toBeCloseTo(1 + BOSS_HP_BY_PLAYER_LEVEL.k, 10)
    expect(bossLevelHpMult(6)).toBeCloseTo(1 + 5 * BOSS_HP_BY_PLAYER_LEVEL.k, 10)
  })

  it('est borné par cap aux hauts niveaux', () => {
    const capLevel = 1 + BOSS_HP_BY_PLAYER_LEVEL.cap / BOSS_HP_BY_PLAYER_LEVEL.k
    expect(bossLevelHpMult(Math.ceil(capLevel) + 50)).toBe(BOSS_HP_BY_PLAYER_LEVEL.cap)
  })

  it('ne descend jamais sous 1 (niveaux <1 / non valides)', () => {
    expect(bossLevelHpMult(0)).toBe(1)
    expect(bossLevelHpMult(-5)).toBe(1)
  })

  it('est monotone croissant jusqu au plafond', () => {
    let prev = 0
    for (let lvl = 1; lvl <= 60; lvl++) {
      const v = bossLevelHpMult(lvl)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeLessThanOrEqual(BOSS_HP_BY_PLAYER_LEVEL.cap)
      prev = v
    }
  })
})
