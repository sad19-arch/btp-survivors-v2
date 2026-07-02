import { describe, it, expect } from 'vitest'
import { Rng } from '@core/rng'
import { rollCards, eligibleCards } from '@core/systems/cards'

const inv = (w: {id:string;level:number}[], p: {id:string;level:number}[]) => ({ weapons: w, passives: p })

describe('cartes de level-up (pur)', () => {
  it('inventaire d\'armes plein (6) → aucune carte weapon-new', () => {
    const full = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, level: 1 }))
    // ids bidon ignorés par eligibleCards pour le level-up ; on teste juste l'absence de new
    const cards = eligibleCards(inv(full, []))
    expect(cards.some(c => c.kind === 'weapon-new')).toBe(false)
  })
  it('arme au max exclue des cartes weapon-up', () => {
    const cards = eligibleCards(inv([{ id: 'cloueur', level: 8 }], []))
    expect(cards.some(c => c.kind === 'weapon-up' && c.id === 'cloueur')).toBe(false)
  })
  it('rollCards renvoie ≤ count cartes distinctes et déterministes', () => {
    const a = rollCards(new Rng(7), inv([{ id: 'cloueur', level: 1 }], []), 4)
    const b = rollCards(new Rng(7), inv([{ id: 'cloueur', level: 1 }], []), 4)
    expect(a).toEqual(b)
    expect(new Set(a.map(c => c.kind + c.id)).size).toBe(a.length)
    expect(a.length).toBeLessThanOrEqual(4)
  })
})
