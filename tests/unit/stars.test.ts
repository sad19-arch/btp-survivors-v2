import { describe, it, expect } from 'vitest'
import { computeStars, STAR_SLOTS } from '@content/stars'

describe('computeStars — notation de fin de stage', () => {
  it('0 étoile si le chantier n’est pas terminé, quoi qu’on ait fait d’autre', () => {
    expect(computeStars({ victory: false, evolvedAny: false, rescuedAll: false })).toBe(0)
    // Même une run parfaite en tout point ne rapporte rien si on n'a pas fini.
    expect(computeStars({ victory: false, evolvedAny: true, rescuedAll: true })).toBe(0)
  })

  it('1 étoile si terminé sans faire évoluer d’arme', () => {
    expect(computeStars({ victory: true, evolvedAny: false, rescuedAll: false })).toBe(1)
  })

  it('2 étoiles si terminé avec au moins une arme évoluée', () => {
    expect(computeStars({ victory: true, evolvedAny: true, rescuedAll: false })).toBe(2)
  })

  it('3 étoiles si terminé, arme évoluée ET les 5 prisonniers libérés', () => {
    expect(computeStars({ victory: true, evolvedAny: true, rescuedAll: true })).toBe(3)
  })

  it('est CUMULATIF STRICT : les 5 prisonniers sans évolution restent à 1', () => {
    // Le piège de conception : libérer tout le monde ne saute PAS le palier
    // « évolution ». Sans cette règle, on décrocherait les étoiles hautes en
    // ignorant complètement la boucle de puissance.
    expect(computeStars({ victory: true, evolvedAny: false, rescuedAll: true })).toBe(1)
  })

  it('expose 3 emplacements d’affichage', () => {
    expect(STAR_SLOTS).toBe(3)
  })
})
