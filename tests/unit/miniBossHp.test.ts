import { describe, it, expect } from 'vitest'
import { ENEMIES, MINI_BOSS_ID } from '@content/enemies'

describe('Mini-boss HP calibration', () => {
  it('le contremaître a des PV ≥ 1800 (survivre au burst initial des armes buffées)', () => {
    const boss = ENEMIES[MINI_BOSS_ID]
    if (boss === undefined) {
      throw new Error('contremaitre introuvable')
    }
    expect(boss.hp).toBeGreaterThanOrEqual(1800)
  })
})
