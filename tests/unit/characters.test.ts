import { describe, it, expect } from 'vitest'
import { CHARACTERS, CHARACTER_IDS, DEFAULT_CHARACTER_ID, characterDef } from '@content/characters'
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

  it('CHARACTER_IDS (ordre du sélecteur) correspond EXACTEMENT aux clés de CHARACTERS', () => {
    // Invariant : un perso ajouté à CHARACTERS mais oublié dans CHARACTER_IDS
    // (ou l'inverse) disparaît du sélecteur — on le verrouille.
    expect([...CHARACTER_IDS].sort()).toEqual(Object.keys(CHARACTERS).sort())
    expect(CHARACTER_IDS.length).toBe(new Set(CHARACTER_IDS).size) // pas de doublon
  })

  it("le champ `id` de chaque personnage correspond à sa clé dans CHARACTERS", () => {
    for (const [key, character] of Object.entries(CHARACTERS)) {
      expect(character.id, `clé ${key}`).toBe(key)
    }
  })

  it('chaque personnage a une feuille de sprite non vide', () => {
    for (const character of Object.values(CHARACTERS)) {
      expect(character.sheet.length, character.id).toBeGreaterThan(0)
    }
  })

  it('les 10 startingWeapon sont TOUTES DISTINCTES (une arme unique par perso)', () => {
    const weapons = Object.values(CHARACTERS).map((c) => c.startingWeapon)
    expect(new Set(weapons).size, `armes = [${weapons.join(', ')}]`).toBe(weapons.length)
  })
})
