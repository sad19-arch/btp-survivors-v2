import { describe, it, expect } from 'vitest'
import { pickUpgradeVoice } from '@/audio/audioDirector'
import { VOICE } from '@/audio/manifest'

describe('pickUpgradeVoice — sélection déterministe des voix de level-up', () => {
  it('retourne une clé du pool VOICE.upgrade', () => {
    for (let i = 0; i < 12; i++) {
      expect(VOICE.upgrade).toContain(pickUpgradeVoice(i))
    }
  })

  it('cycle sur tout le pool (count modulo taille) — variété d\'annonceur', () => {
    const pool = VOICE.upgrade
    for (let i = 0; i < pool.length * 2; i++) {
      expect(pickUpgradeVoice(i)).toBe(pool[i % pool.length])
    }
  })

  it('ne dépend pas de Math.random — même count → même résultat', () => {
    expect(pickUpgradeVoice(7)).toBe(pickUpgradeVoice(7))
  })

  it('distribue équitablement sur un multiple de la taille du pool', () => {
    const pool = VOICE.upgrade
    const n = pool.length * 4
    const results = Array.from({ length: n }, (_, i) => pickUpgradeVoice(i))
    for (const clip of pool) {
      expect(results.filter((k) => k === clip).length).toBe(4)
    }
  })

  it('le pool VOICE.upgrade inclut les voix classiques + les nouvelles (power-up/perfect/yeah)', () => {
    expect(VOICE.upgrade).toContain('voice_choose_your_destiny')
    expect(VOICE.upgrade).toContain('voice_keep_going')
    expect(VOICE.upgrade).toContain('voice_power_up')
    expect(VOICE.upgrade).toContain('voice_perfect')
    expect(VOICE.upgrade).toContain('voice_yeah')
  })
})
