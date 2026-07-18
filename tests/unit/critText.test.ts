import { describe, it, expect } from 'vitest'
import { shouldCritText, CRIT_TEXT_NORMAL_CHANCE } from '@render/scenes/critTextRenderer'

/**
 * Sélecteur PUR du texte de coup critique (le seul morceau testable sans Phaser).
 * Règle : boss et élites TOUJOURS marqués ; un ennemi normal ne l'est qu'au tirage
 * `roll < CRIT_TEXT_NORMAL_CHANCE`.
 */
describe('shouldCritText — quand souligner une mort', () => {
  it('un boss est TOUJOURS marqué, même avec un roll élevé', () => {
    expect(shouldCritText({ isElite: false, bossRole: 'mid' }, 0.99)).toBe(true)
    expect(shouldCritText({ isElite: false, bossRole: 'final' }, 0.99)).toBe(true)
  })

  it('une élite est TOUJOURS marquée, même avec un roll élevé', () => {
    expect(shouldCritText({ isElite: true, bossRole: undefined }, 0.99)).toBe(true)
  })

  it('un ennemi normal n\'est marqué qu\'en dessous du seuil', () => {
    expect(shouldCritText({ isElite: false, bossRole: undefined }, 0)).toBe(true)
    expect(shouldCritText({ isElite: false, bossRole: undefined }, CRIT_TEXT_NORMAL_CHANCE - 0.001)).toBe(true)
  })

  it('un ennemi normal au-dessus (ou pile) au seuil n\'est PAS marqué', () => {
    expect(shouldCritText({ isElite: false, bossRole: undefined }, CRIT_TEXT_NORMAL_CHANCE)).toBe(false)
    expect(shouldCritText({ isElite: false, bossRole: undefined }, 0.99)).toBe(false)
  })

  it('le seuil normal reste discret (la horde ne doit pas spammer l\'écran)', () => {
    expect(CRIT_TEXT_NORMAL_CHANCE).toBeGreaterThan(0)
    expect(CRIT_TEXT_NORMAL_CHANCE).toBeLessThanOrEqual(0.05)
  })
})
