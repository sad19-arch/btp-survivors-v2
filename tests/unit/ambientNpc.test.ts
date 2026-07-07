import { describe, it, expect } from 'vitest'
import { pickPhrase, ambientOffset, shouldBubble, NAG_PHRASES } from '@render/ambientNpc'

describe('ambientNpc (pur)', () => {
  it('pickPhrase déterministe et dans le pool', () => {
    expect(pickPhrase(3)).toBe(pickPhrase(3))
    expect(NAG_PHRASES).toContain(pickPhrase(3))
  })
  it('pickPhrase reste dans le pool pour des seeds négatifs (seed PNJ = XOR pouvant déborder en négatif)', () => {
    for (const seed of [-1, -4, -7, -123456, -0x9e3779b9]) {
      expect(NAG_PHRASES).toContain(pickPhrase(seed))
    }
    // -1 mod 4 → dernière phrase (idiome `((s % n) + n) % n`), pas un index négatif.
    expect(pickPhrase(-1)).toBe(NAG_PHRASES[NAG_PHRASES.length - 1])
  })
  it('ambientOffset borné + déterministe', () => {
    for (const t of [0, 500, 1234, 99999]) {
      const o = ambientOffset(7, t, 'work')
      expect(Math.hypot(o.dx, o.dy)).toBeLessThanOrEqual(110 + 0.001)
      expect(ambientOffset(7, t, 'work')).toEqual(o)
    }
    const p = ambientOffset(7, 1234, 'patrol')
    expect(Math.hypot(p.dx, p.dy)).toBeLessThanOrEqual(120 + 0.001)
  })
  it("ambientOffset 'work' déambule avec amplitude ≥ 80 px sur sa période", () => {
    // Échantillonne sur 30 s (toutes les 200 ms) → au moins un échantillon ≥ 80 px
    let maxAmp = 0
    for (let ms = 0; ms <= 30_000; ms += 200) {
      const o = ambientOffset(42, ms, 'work')
      const amp = Math.hypot(o.dx, o.dy)
      if (amp > maxAmp) { maxAmp = amp }
    }
    expect(maxAmp).toBeGreaterThanOrEqual(80)
    // et toujours bornée
    expect(maxAmp).toBeLessThanOrEqual(110 + 0.001)
  })
  it('shouldBubble sous 150px', () => {
    expect(shouldBubble(120)).toBe(true)
    expect(shouldBubble(200)).toBe(false)
  })
})
