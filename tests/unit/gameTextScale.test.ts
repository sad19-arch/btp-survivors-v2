import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadGameTextLevel,
  saveGameTextLevel,
  nextGameTextLevel,
  gameTextScaleOf,
  gameTextLabelOf
} from '@/ui/gameTextScale'

/**
 * Réglage de taille des textes de jeu (persisté en localStorage). Pur/portable :
 * on vide le stockage entre chaque test.
 */
describe('gameTextScale', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('défaut = normal quand rien n\'est stocké', () => {
    expect(loadGameTextLevel()).toBe('normal')
  })

  it('round-trip save → load', () => {
    saveGameTextLevel('tres_grand')
    expect(loadGameTextLevel()).toBe('tres_grand')
    saveGameTextLevel('grand')
    expect(loadGameTextLevel()).toBe('grand')
  })

  it('JSON corrompu → normal (pas de crash)', () => {
    localStorage.setItem('btp_game_text_scale_v1', '{ pas du json')
    expect(loadGameTextLevel()).toBe('normal')
  })

  it('valeur inconnue → normal', () => {
    localStorage.setItem('btp_game_text_scale_v1', JSON.stringify({ level: 'gigantesque' }))
    expect(loadGameTextLevel()).toBe('normal')
  })

  it('nextGameTextLevel : cycle BORNÉ aux deux bouts (pas de bouclage)', () => {
    expect(nextGameTextLevel('normal', -1)).toBe('normal') // borné à gauche
    expect(nextGameTextLevel('normal', 1)).toBe('grand')
    expect(nextGameTextLevel('grand', 1)).toBe('tres_grand')
    expect(nextGameTextLevel('tres_grand', 1)).toBe('tres_grand') // borné à droite
    expect(nextGameTextLevel('tres_grand', -1)).toBe('grand')
  })

  it('facteurs d\'échelle = 1 / 1.5 / 2', () => {
    expect(gameTextScaleOf('normal')).toBe(1)
    expect(gameTextScaleOf('grand')).toBe(1.5)
    expect(gameTextScaleOf('tres_grand')).toBe(2)
  })

  it('libellés FR', () => {
    expect(gameTextLabelOf('normal')).toBe('Normal')
    expect(gameTextLabelOf('grand')).toBe('Grand')
    expect(gameTextLabelOf('tres_grand')).toBe('Très grand')
  })
})
