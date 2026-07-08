import { describe, it, expect } from 'vitest'
import { cardEnterStyle } from '@ui/cardEnter'

describe('cardEnterStyle (util pur, déterministe)', () => {
  it('elapsedMs < 0 → opacity 0 et translateY = risePx (pas encore entré)', () => {
    const st = cardEnterStyle(-1, 0)
    expect(st.opacity).toBeCloseTo(0, 6)
    expect(st.translateYpx).toBeCloseTo(14, 6) // risePx par défaut
  })

  it('elapsedMs très grand → opacity 1 et translateY 0 pour tout index', () => {
    for (const index of [0, 1, 2, 3]) {
      const st = cardEnterStyle(10_000, index)
      expect(st.opacity).toBeCloseTo(1, 6)
      expect(st.translateYpx).toBeCloseTo(0, 6)
    }
  })

  it('stagger : à elapsedMs intermédiaire, index 0 est plus avancé que index 3', () => {
    // staggerMs=70 par défaut — à 100 ms, index0 est à t=100, index3 à t=100-210=-110 (pas encore)
    const st0 = cardEnterStyle(100, 0)
    const st3 = cardEnterStyle(100, 3)
    expect(st0.opacity).toBeGreaterThan(st3.opacity)
    // index 3 pas encore entré → opacity 0
    expect(st3.opacity).toBeCloseTo(0, 6)
  })

  it('monotonie : opacity non-décroissante quand elapsedMs augmente (index 1)', () => {
    let prev = -1
    for (let ms = 0; ms <= 500; ms += 20) {
      const st = cardEnterStyle(ms, 1)
      expect(st.opacity).toBeGreaterThanOrEqual(prev)
      prev = st.opacity
    }
  })

  it('la progression est correcte avec un staggerMs personnalisé', () => {
    // staggerMs=100 : index1 démarre à elapsedMs=100
    const stBefore = cardEnterStyle(99, 1, { staggerMs: 100 })
    const stAfter = cardEnterStyle(200, 1, { staggerMs: 100 })
    expect(stBefore.opacity).toBeCloseTo(0, 6)
    expect(stAfter.opacity).toBeGreaterThan(0)
  })

  it('smoothstep : valeur intermédiaire correcte (t = enterMs/2)', () => {
    // À t = enterMs/2 = 90ms, raw=0.5, smoothstep=0.5*0.5*(3-1)=0.5
    const st = cardEnterStyle(90, 0, { enterMs: 180, staggerMs: 0 })
    expect(st.opacity).toBeCloseTo(0.5, 4)
    expect(st.translateYpx).toBeCloseTo(7, 4) // (1-0.5)*14 = 7
  })
})
