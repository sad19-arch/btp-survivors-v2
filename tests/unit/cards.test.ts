import { describe, it, expect } from 'vitest'
import { Rng } from '@core/rng'
import { rollCards, eligibleCards } from '@core/systems/cards'
import { WEAPONS } from '@content/weapons'
import { PASSIVES } from '@content/passives'

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
  it('inventaire d\'armes vide → les cartes weapon-new couvrent exactement les 10 armes de base', () => {
    const cards = eligibleCards(inv([], []))
    const newIds = cards.filter(c => c.kind === 'weapon-new').map(c => c.id).sort()
    expect(newIds).toEqual(['boulons', 'brouette', 'cle_molette', 'cloueur', 'court_circuit', 'extincteur', 'goudron', 'marteau', 'pied_de_biche', 'scie'].sort())
  })

  describe('Card enrichie (description / currentLevel / maxLevel)', () => {
    it('weapon-up : description = WEAPONS[id].description, currentLevel=level, maxLevel=def.maxLevel', () => {
      const cards = eligibleCards(inv([{ id: 'cloueur', level: 3 }], []))
      const card = cards.find(c => c.kind === 'weapon-up' && c.id === 'cloueur')
      expect(card).toBeDefined()
      expect(card?.description).toBe(WEAPONS['cloueur']?.description)
      expect(card?.description).not.toBe('')
      expect(card?.currentLevel).toBe(3)
      expect(card?.maxLevel).toBe(WEAPONS['cloueur']?.maxLevel)
    })

    it('weapon-new : currentLevel=0, maxLevel=def.maxLevel, description non vide', () => {
      const cards = eligibleCards(inv([], []))
      const card = cards.find(c => c.kind === 'weapon-new' && c.id === 'scie')
      expect(card).toBeDefined()
      expect(card?.currentLevel).toBe(0)
      expect(card?.maxLevel).toBe(WEAPONS['scie']?.maxLevel)
      expect(card?.description).toBe(WEAPONS['scie']?.description)
      expect(card?.description).not.toBe('')
    })

    it('passive-up : description = PASSIVES[id].description, currentLevel=level, maxLevel=def.maxLevel', () => {
      const cards = eligibleCards(inv([], [{ id: 'outillage_renforce', level: 2 }]))
      const card = cards.find(c => c.kind === 'passive-up' && c.id === 'outillage_renforce')
      expect(card).toBeDefined()
      expect(card?.description).toBe(PASSIVES['outillage_renforce']?.description)
      expect(card?.description).not.toBe('')
      expect(card?.currentLevel).toBe(2)
      expect(card?.maxLevel).toBe(PASSIVES['outillage_renforce']?.maxLevel)
    })

    it('passive-new : currentLevel=0, description non vide', () => {
      const cards = eligibleCards(inv([], []))
      const card = cards.find(c => c.kind === 'passive-new' && c.id === 'air_comprime')
      expect(card).toBeDefined()
      expect(card?.currentLevel).toBe(0)
      expect(card?.description).toBe(PASSIVES['air_comprime']?.description)
      expect(card?.description).not.toBe('')
    })
  })
})
