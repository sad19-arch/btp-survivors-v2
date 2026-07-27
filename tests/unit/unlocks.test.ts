import { beforeEach, describe, expect, it } from 'vitest'
import { UNLOCKS } from '@content/unlocks'
import {
  UNLOCK_STORAGE_KEY,
  applyUnlockSignal,
  consumeTrialWeapon,
  freshUnlockProgress,
  isContentUnlocked,
  markContentTried,
  markUnlocksSeen,
  readUnlockProgress,
  unlockProgressValue
} from '@ui/unlocks'

const definition = (id: string) => {
  const found = UNLOCKS.find((unlock) => unlock.id === id)
  if (found === undefined) {
    throw new Error(`Déblocage absent : ${id}`)
  }
  return found
}

describe('profil de déblocages', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('une sauvegarde neuve ne verrouille que les trois récompenses prévues', () => {
    const state = readUnlockProgress()
    expect(state.unlockedContentIds).toEqual([])
    expect(isContentUnlocked(state, 'ouvrier')).toBe(true)
    expect(isContentUnlocked(state, 'cloueur')).toBe(true)
    expect(isContentUnlocked(state, 'charpentier')).toBe(false)
    expect(isContentUnlocked(state, 'bonbonne_chantier')).toBe(false)
    expect(isContentUnlocked(state, 'ouvriere')).toBe(false)
  })

  it('une ancienne sauvegarde sans clé de déblocages conserve les trois contenus', () => {
    localStorage.setItem('btp:achievements_v1', JSON.stringify({ unlocked: [], progress: {} }))
    const state = readUnlockProgress()
    expect(state.unlockedContentIds.sort()).toEqual(
      ['charpentier', 'bonbonne_chantier', 'ouvriere'].sort()
    )
    expect(state.triedContentIds.sort()).toEqual(state.unlockedContentIds.sort())
    expect(localStorage.getItem(UNLOCK_STORAGE_KEY)).not.toBeNull()
  })

  it('mauvaise évolution : aucun déblocage ; Cloueur : une seule récompense persistée', () => {
    const wrong = applyUnlockSignal(freshUnlockProgress(), 'weapon_evolved', 'scie')
    expect(wrong.newlyUnlockedIds).toEqual([])

    const first = applyUnlockSignal(wrong.state, 'weapon_evolved', 'cloueur')
    expect(first.newlyUnlockedIds).toEqual(['unlock_charpentier'])
    const duplicate = applyUnlockSignal(first.state, 'weapon_evolved', 'cloueur')
    expect(duplicate.newlyUnlockedIds).toEqual([])
    expect(readUnlockProgress().unlockedContentIds).toContain('charpentier')
  })

  it('cadence ×499 reste verrouillée ; ×500 ouvre la Bonbonne et arme une offre unique', () => {
    const below = applyUnlockSignal(freshUnlockProgress(), 'combo_reached', 499)
    expect(below.newlyUnlockedIds).toEqual([])
    const reached = applyUnlockSignal(below.state, 'combo_reached', 500)
    expect(reached.newlyUnlockedIds).toEqual(['unlock_bonbonne'])
    expect(reached.state.trialWeaponId).toBe('bonbonne_chantier')
    expect(unlockProgressValue(reached.state, definition('unlock_bonbonne'))).toBe(500)
    expect(consumeTrialWeapon(reached.state, 'bonbonne_chantier').trialWeaponId).toBeNull()
  })

  it('2 prisonniers puis 3 à la partie suivante donnent exactement 5/5, sans doublon au sixième', () => {
    const two = applyUnlockSignal(freshUnlockProgress(), 'prisoners_rescued_total', 2)
    expect(unlockProgressValue(two.state, definition('unlock_ouvriere'))).toBe(2)
    expect(readUnlockProgress().cumulativeProgress.prisoners_rescued_total).toBe(2)

    const three = applyUnlockSignal(readUnlockProgress(), 'prisoners_rescued_total', 3)
    expect(three.newlyUnlockedIds).toEqual(['unlock_ouvriere'])
    expect(three.state.unlockedContentIds).toContain('ouvriere')
    const sixth = applyUnlockSignal(three.state, 'prisoners_rescued_total', 1)
    expect(sixth.newlyUnlockedIds).toEqual([])
  })

  it('consulter conserve le badge Nouveau ; la première utilisation le retire et persiste', () => {
    const unlocked = applyUnlockSignal(freshUnlockProgress(), 'weapon_evolved', 'cloueur').state
    const seen = markUnlocksSeen(unlocked, ['unlock_charpentier'])
    expect(seen.triedContentIds).not.toContain('charpentier')
    const tried = markContentTried(seen, 'charpentier')
    expect(tried.triedContentIds).toContain('charpentier')
    expect(readUnlockProgress().triedContentIds).toContain('charpentier')
  })
})
