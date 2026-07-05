import { describe, it, expect } from 'vitest'
import { pickUpgradeVoice } from '@/audio/audioDirector'
import { VOICE } from '@/audio/manifest'

describe('pickUpgradeVoice — sélection déterministe des voix de level-up', () => {
  it('retourne une clé du pool VOICE.upgrade', () => {
    for (let i = 0; i < 10; i++) {
      const key = pickUpgradeVoice(i)
      expect(VOICE.upgrade).toContain(key)
    }
  })

  it('alterne entre les deux clips selon la parité (pair → [0], impair → [1])', () => {
    const pool = VOICE.upgrade
    expect(pickUpgradeVoice(0)).toBe(pool[0]) // count 0 → index 0
    expect(pickUpgradeVoice(1)).toBe(pool[1]) // count 1 → index 1
    expect(pickUpgradeVoice(2)).toBe(pool[0]) // count 2 → index 0 (cycle)
    expect(pickUpgradeVoice(3)).toBe(pool[1]) // count 3 → index 1
  })

  it('ne dépend pas de Math.random — même count → même résultat', () => {
    const a = pickUpgradeVoice(7)
    const b = pickUpgradeVoice(7)
    expect(a).toBe(b)
  })

  it('produit une alternance sur 20 level-ups consécutifs (index croissants)', () => {
    const results = Array.from({ length: 20 }, (_, i) => pickUpgradeVoice(i))
    const pool = VOICE.upgrade
    // chaque clip doit apparaître exactement 10 fois sur 20 passages
    expect(results.filter((k) => k === pool[0]).length).toBe(10)
    expect(results.filter((k) => k === pool[1]).length).toBe(10)
  })

  it('le pool VOICE.upgrade contient exactement 2 clips distincts', () => {
    expect(VOICE.upgrade.length).toBe(2)
    expect(VOICE.upgrade[0]).toBe('voice_choose_your_destiny')
    expect(VOICE.upgrade[1]).toBe('voice_keep_going')
  })
})
