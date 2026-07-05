import { describe, it, expect } from 'vitest'
import { canPlayXpDing } from '@/audio/audioDirector'

describe('canPlayXpDing — throttle du ding de gemme XP (B4)', () => {
  const THROTTLE = 50

  it('autorise le premier ding (jamais joué → lastMs = -Infinity)', () => {
    expect(canPlayXpDing(-Infinity, 1000, THROTTLE)).toBe(true)
  })

  it('bloque si le délai est insuffisant (< throttle)', () => {
    expect(canPlayXpDing(1000, 1000 + THROTTLE - 1, THROTTLE)).toBe(false)
  })

  it('autorise si exactement le délai throttle est écoulé', () => {
    expect(canPlayXpDing(1000, 1000 + THROTTLE, THROTTLE)).toBe(true)
  })

  it('autorise si plus que le délai throttle est écoulé', () => {
    expect(canPlayXpDing(1000, 1000 + THROTTLE * 3, THROTTLE)).toBe(true)
  })

  it('bloque consécutivement si tous les dings sont trop proches', () => {
    let last = 0
    let played = 0
    // Simule 20 tentatives de ding toutes les 10ms sur 200ms (throttle 50ms).
    for (let now = 0; now <= 200; now += 10) {
      if (canPlayXpDing(last, now, THROTTLE)) {
        played++
        last = now
      }
    }
    // 200ms / 50ms = 4 dings max (à 0, 50, 100, 150, 200 = 5 si on compte 0)
    expect(played).toBeLessThanOrEqual(5)
    expect(played).toBeGreaterThanOrEqual(4)
  })
})
