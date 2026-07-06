import { describe, it, expect } from 'vitest'
import { pickPhrase, ambientOffset, shouldBubble, NAG_PHRASES } from '@render/ambientNpc'

describe('ambientNpc (pur)', () => {
  it('pickPhrase déterministe et dans le pool', () => {
    expect(pickPhrase(3)).toBe(pickPhrase(3))
    expect(NAG_PHRASES).toContain(pickPhrase(3))
  })
  it('ambientOffset borné + déterministe', () => {
    for (const t of [0, 500, 1234, 99999]) {
      const o = ambientOffset(7, t, 'work')
      expect(Math.hypot(o.dx, o.dy)).toBeLessThanOrEqual(24 + 0.001)
      expect(ambientOffset(7, t, 'work')).toEqual(o)
    }
    const p = ambientOffset(7, 1234, 'patrol')
    expect(Math.hypot(p.dx, p.dy)).toBeLessThanOrEqual(120 + 0.001)
  })
  it('shouldBubble sous 150px', () => {
    expect(shouldBubble(120)).toBe(true)
    expect(shouldBubble(200)).toBe(false)
  })
})
