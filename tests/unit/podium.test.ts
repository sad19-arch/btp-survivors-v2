import { describe, it, expect } from 'vitest'
import { selectPodium } from '@content/podium'
import { selectPraiseQuote, selectMockQuote, PRAISE_QUOTES, MOCK_QUOTES } from '@content/podiumQuotes'

describe('selectPodium — meilleur et pire tueur', () => {
  it('désigne le plus gros et le plus petit score', () => {
    const p = selectPodium([
      { id: 1, kills: 40 },
      { id: 2, kills: 120 },
      { id: 3, kills: 7 },
    ])
    expect(p).toEqual({ bestId: 2, worstId: 3 })
  })

  it('renvoie null en solo (le même joueur serait le meilleur ET le pire)', () => {
    expect(selectPodium([{ id: 1, kills: 99 }])).toBeNull()
    expect(selectPodium([])).toBeNull()
  })

  it('renvoie null si TOUT le monde est à égalité (personne à moquer)', () => {
    expect(
      selectPodium([
        { id: 1, kills: 50 },
        { id: 2, kills: 50 },
        { id: 3, kills: 50 },
      ])
    ).toBeNull()
  })

  it('départage les ex æquo par id croissant, quel que soit l’ordre du tableau', () => {
    const a = selectPodium([
      { id: 3, kills: 80 },
      { id: 1, kills: 80 },
      { id: 2, kills: 10 },
    ])
    // J1 et J3 sont à égalité en tête → J1 (id le plus petit) prend le trophée.
    expect(a?.bestId).toBe(1)
    expect(a?.worstId).toBe(2)

    // Même entrée, ordre inversé → même résultat (déterminisme).
    const b = selectPodium([
      { id: 2, kills: 10 },
      { id: 1, kills: 80 },
      { id: 3, kills: 80 },
    ])
    expect(b).toEqual(a)
  })

  it('ne mute pas le tableau reçu', () => {
    const entries = [
      { id: 1, kills: 5 },
      { id: 2, kills: 90 },
    ]
    selectPodium(entries)
    expect(entries[0]?.id).toBe(1)
    expect(entries[1]?.id).toBe(2)
  })

  it('gère 4 joueurs (co-op complet)', () => {
    const p = selectPodium([
      { id: 1, kills: 30 },
      { id: 2, kills: 31 },
      { id: 3, kills: 29 },
      { id: 4, kills: 32 },
    ])
    expect(p).toEqual({ bestId: 4, worstId: 3 })
  })
})

describe('podiumQuotes — sélection déterministe', () => {
  it('un même roll rend toujours la même phrase', () => {
    expect(selectPraiseQuote({ roll: 0.42 })).toBe(selectPraiseQuote({ roll: 0.42 }))
    expect(selectMockQuote({ roll: 0.42 })).toBe(selectMockQuote({ roll: 0.42 }))
  })

  it('borne les extrémités du roll sans déborder', () => {
    expect(selectPraiseQuote({ roll: 0 })).toBe(PRAISE_QUOTES[0])
    expect(selectPraiseQuote({ roll: 0.999 })).toBe(PRAISE_QUOTES[PRAISE_QUOTES.length - 1])
    // roll = 1 ne doit pas sortir du tableau (Math.floor(1 * n) === n)
    expect(selectMockQuote({ roll: 1 })).toBe(MOCK_QUOTES[MOCK_QUOTES.length - 1])
    expect(selectMockQuote({ roll: 0 })).toBe(MOCK_QUOTES[0])
  })

  it('ne rend jamais une phrase vide', () => {
    for (let i = 0; i <= 10; i++) {
      expect(selectPraiseQuote({ roll: i / 10 }).length).toBeGreaterThan(0)
      expect(selectMockQuote({ roll: i / 10 }).length).toBeGreaterThan(0)
    }
  })
})
