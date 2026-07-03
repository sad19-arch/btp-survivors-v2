import { describe, it, expect } from 'vitest'
import { CHARACTERS, DEFAULT_CHARACTER_ID, characterDef } from '@content/characters'
import { WEAPONS } from '@content/weapons'

/**
 * Garde-fou data-driven : le roster de personnages doit être non vide et
 * chaque arme de départ doit exister réellement dans WEAPONS. Le fallback
 * `characterDef` doit toujours renvoyer un CharacterDef défini.
 */
describe('Personnages — cohérence du contenu', () => {
  it('CHARACTERS est non vide', () => {
    expect(Object.keys(CHARACTERS).length).toBeGreaterThan(0)
  })

  it('chaque startingWeapon référencé par un personnage existe dans WEAPONS', () => {
    for (const character of Object.values(CHARACTERS)) {
      expect(WEAPONS[character.startingWeapon], `${character.id} → ${character.startingWeapon}`).toBeDefined()
    }
  })

  it('DEFAULT_CHARACTER_ID mappe vers un personnage réel', () => {
    expect(CHARACTERS[DEFAULT_CHARACTER_ID]).toBeDefined()
  })

  it("characterDef('ouvrier') a le cloueur comme arme de départ", () => {
    expect(characterDef('ouvrier').startingWeapon).toBe('cloueur')
  })

  it('characterDef(inconnu) retombe sur le personnage par défaut', () => {
    const fallback = characterDef('unknown-xyz')
    expect(fallback.id).toBe('ouvrier')
    expect(fallback.id).toBe(DEFAULT_CHARACTER_ID)
  })
})
