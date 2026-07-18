import { describe, it, expect } from 'vitest'
import {
  NAME_ENTRY_LENGTH,
  NAME_ENTRY_ALPHABET,
  emptyNameEntry,
  moveCursor,
  cycleChar,
  clearChar,
  nameOf
} from '@/app/nameEntry'

describe('nameEntry', () => {
  it('emptyNameEntry produit un état valide dont nameOf() est vide', () => {
    const s = emptyNameEntry()
    expect(s.chars.length).toBe(NAME_ENTRY_LENGTH)
    expect(s.cursor).toBe(0)
    expect(nameOf(s)).toBe('')
  })

  it('a toujours exactement 8 cases, quelles que soient les opérations', () => {
    let s = emptyNameEntry()
    s = cycleChar(s, 1)
    s = moveCursor(s, 1)
    s = cycleChar(s, -1)
    s = clearChar(s)
    expect(s.chars.length).toBe(8)
  })

  describe('cycleChar (boucle aux deux bouts)', () => {
    it('depuis la première lettre de l\'alphabet, vers le bas ⇒ dernière lettre', () => {
      const s = emptyNameEntry() // case 0 = index 0 (espace, premier de l'alphabet)
      const next = cycleChar(s, -1)
      expect(next.chars[0]).toBe(NAME_ENTRY_ALPHABET.length - 1)
    })

    it('depuis la dernière lettre de l\'alphabet, vers le haut ⇒ première lettre', () => {
      let s = emptyNameEntry()
      s = cycleChar(s, -1) // va sur le dernier caractère de l'alphabet
      const next = cycleChar(s, 1)
      expect(next.chars[0]).toBe(0)
    })

    it('cycle normalement au milieu de l\'alphabet (sans boucler)', () => {
      const s = emptyNameEntry()
      const next = cycleChar(s, 1)
      expect(next.chars[0]).toBe(1)
    })

    it('ne modifie que la case du curseur', () => {
      let s = emptyNameEntry()
      s = moveCursor(s, 1) // curseur sur la case 1
      const next = cycleChar(s, 1)
      expect(next.chars[1]).toBe(1)
      expect(next.chars[0]).toBe(0)
    })
  })

  describe('moveCursor (borné, ne boucle PAS)', () => {
    it('à la case 0, -1 ne bouge pas', () => {
      const s = emptyNameEntry()
      expect(s.cursor).toBe(0)
      const next = moveCursor(s, -1)
      expect(next.cursor).toBe(0)
    })

    it('à la dernière case (7), +1 ne bouge pas', () => {
      let s = emptyNameEntry()
      for (let i = 0; i < 10; i++) {
        s = moveCursor(s, 1)
      }
      expect(s.cursor).toBe(NAME_ENTRY_LENGTH - 1)
      const next = moveCursor(s, 1)
      expect(next.cursor).toBe(NAME_ENTRY_LENGTH - 1)
    })

    it('avance et recule normalement entre les deux bornes', () => {
      let s = emptyNameEntry()
      s = moveCursor(s, 1)
      s = moveCursor(s, 1)
      expect(s.cursor).toBe(2)
      s = moveCursor(s, -1)
      expect(s.cursor).toBe(1)
    })
  })

  describe('clearChar', () => {
    it('remet la case courante à vide sans déplacer le curseur', () => {
      let s = emptyNameEntry()
      s = moveCursor(s, 1)
      s = moveCursor(s, 1) // curseur sur la case 2
      s = cycleChar(s, 1)
      s = cycleChar(s, 1)
      s = cycleChar(s, 1)
      s = cycleChar(s, 1)
      s = cycleChar(s, 1) // case 2 → 5 crans depuis l'espace
      expect(s.chars[2]).not.toBe(0)
      const next = clearChar(s)
      expect(next.chars[2]).toBe(0)
      expect(next.cursor).toBe(2)
      expect(nameOf(next)).toBe('')
    })
  })

  describe('nameOf', () => {
    it('assemble les lettres des 8 cases', () => {
      let s = emptyNameEntry()
      // Fabrique "AB" dans les deux premières cases (A = index 1, B = index 2).
      s = cycleChar(s, 1) // case 0 → 'A'
      s = moveCursor(s, 1)
      s = cycleChar(s, 1)
      s = cycleChar(s, 1) // case 1 → 'B'
      expect(nameOf(s)).toBe('AB')
    })

    it('trim les espaces de tête/fin', () => {
      let s = emptyNameEntry()
      s = moveCursor(s, 1)
      s = cycleChar(s, 1) // case 1 → 'A', cases 0 et 2-7 restent espace
      expect(nameOf(s)).toBe('A')
    })

    it('ne dépasse jamais 8 caractères', () => {
      const s = emptyNameEntry()
      expect(nameOf(s).length).toBeLessThanOrEqual(NAME_ENTRY_LENGTH)
    })

    it('n\'est jamais undefined', () => {
      const s = emptyNameEntry()
      expect(nameOf(s)).not.toBeUndefined()
      expect(typeof nameOf(s)).toBe('string')
    })
  })

  describe('pureté (aucune fonction ne mute son entrée)', () => {
    it('moveCursor ne modifie pas l\'état reçu', () => {
      const s = emptyNameEntry()
      const before = { chars: [...s.chars], cursor: s.cursor }
      moveCursor(s, 1)
      expect(s).toEqual(before)
    })

    it('cycleChar ne modifie pas l\'état reçu (ni son tableau chars)', () => {
      const s = emptyNameEntry()
      const before = { chars: [...s.chars], cursor: s.cursor }
      cycleChar(s, 1)
      expect(s).toEqual(before)
    })

    it('clearChar ne modifie pas l\'état reçu', () => {
      let s = emptyNameEntry()
      s = cycleChar(s, 1)
      s = cycleChar(s, 1)
      s = cycleChar(s, 1)
      const before = { chars: [...s.chars], cursor: s.cursor }
      clearChar(s)
      expect(s).toEqual(before)
    })

    it('deux états retournés successivement ne partagent pas le même tableau chars', () => {
      const s = emptyNameEntry()
      const a = cycleChar(s, 1)
      const b = cycleChar(a, 1)
      expect(a.chars).not.toBe(b.chars)
      expect(a.chars[0]).toBe(1) // `a` inchangé par la mutation de `b`
    })
  })
})
