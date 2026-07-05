import { describe, it, expect } from 'vitest'
import { PLAYER_COLORS, playerColor } from '@content/players'

describe('playerColor', () => {
  it('renvoie la couleur dédiée pour les joueurs 1 à 4, toutes distinctes', () => {
    const hexes = [1, 2, 3, 4].map((id) => playerColor(id).hex)
    expect(new Set(hexes).size).toBe(4)
    expect(playerColor(1)).toBe(PLAYER_COLORS[1])
    expect(playerColor(4)).toBe(PLAYER_COLORS[4])
  })

  it('replie sur le joueur 1 pour un id hors table', () => {
    expect(playerColor(5)).toBe(PLAYER_COLORS[1])
    expect(playerColor(0)).toBe(PLAYER_COLORS[1])
  })
})
