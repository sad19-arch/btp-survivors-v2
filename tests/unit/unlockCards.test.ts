import { describe, expect, it } from 'vitest'
import { Rng } from '@core/rng'
import { eligibleCards, rollCards } from '@core/systems/cards'

const inventory = {
  weapons: [{ id: 'cloueur', level: 1 }],
  passives: []
}

describe('cartes et armes verrouillées', () => {
  it('retire la Bonbonne des découvertes tant qu’elle n’est pas disponible', () => {
    const available = new Set([
      'cloueur', 'scie', 'marteau', 'pied_de_biche', 'court_circuit', 'goudron',
      'boulons', 'cle_molette', 'extincteur', 'brouette', 'chalumeau'
    ])
    const cards = eligibleCards(inventory, available)
    expect(cards.some((card) => card.id === 'bonbonne_chantier')).toBe(false)
  })

  it('garantit la Bonbonne une fois sans perdre la montée d’arme ni créer de doublon', () => {
    const available = new Set([
      'cloueur', 'scie', 'marteau', 'pied_de_biche', 'court_circuit', 'goudron',
      'boulons', 'cle_molette', 'extincteur', 'brouette', 'chalumeau', 'bonbonne_chantier'
    ])
    for (let seed = 0; seed < 50; seed++) {
      const cards = rollCards(new Rng(seed), inventory, 3, {
        availableWeaponIds: available,
        guaranteedWeaponId: 'bonbonne_chantier'
      })
      expect(cards.some((card) => card.kind === 'weapon-new' && card.id === 'bonbonne_chantier')).toBe(true)
      expect(cards.some((card) => card.kind === 'weapon-up')).toBe(true)
      expect(new Set(cards.map((card) => `${card.kind}:${card.id}`)).size).toBe(cards.length)
    }
  })
})
