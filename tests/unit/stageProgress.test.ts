import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConstructionPhaseId } from '@content/phases'
import {
  STAGE_PROGRESS_STORAGE_KEY,
  commitStageStars,
  isStageUnlocked,
  nextUnlockedStage,
  readStageProgress,
  resetStageProgress,
  type StageProgress
} from '@ui/stageProgress'

const terrain = ConstructionPhaseId.TERRAIN_VIERGE
const terrassement = ConstructionPhaseId.TERRASSEMENT
const fondations = ConstructionPhaseId.FONDATIONS
const livraison = ConstructionPhaseId.LIVRAISON_AUDIT

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('stage progress — accès séquentiels', () => {
  it('un profil vierge ouvre seulement le terrain vierge', () => {
    const progress = readStageProgress()

    expect(isStageUnlocked(progress, terrain)).toBe(true)
    expect(isStageUnlocked(progress, terrassement)).toBe(false)
    expect(isStageUnlocked(progress, fondations)).toBe(false)
  })

  it.each([0, 1, 2] as const)('%i étoiles ne débloquent pas le stage suivant', (stars) => {
    const progress = commitStageStars(terrain, stars)

    expect(isStageUnlocked(progress, terrassement)).toBe(false)
  })

  it('trois étoiles débloquent exactement le stage suivant', () => {
    const progress = commitStageStars(terrain, 3)

    expect(isStageUnlocked(progress, terrassement)).toBe(true)
    expect(isStageUnlocked(progress, fondations)).toBe(false)
    expect(nextUnlockedStage(progress, terrain)).toBe(terrassement)
  })

  it('refuse de sauter une étape avec un profil clairsemé', () => {
    const sparse: StageProgress = { [fondations]: 3 }

    expect(isStageUnlocked(sparse, terrassement)).toBe(false)
    expect(isStageUnlocked(sparse, fondations)).toBe(false)
  })

  it('ne donne jamais de successeur au dernier stage', () => {
    const complete: StageProgress = {
      [terrain]: 3,
      [terrassement]: 3,
      [fondations]: 3,
      [ConstructionPhaseId.RESEAUX_ENTERRES]: 3,
      [ConstructionPhaseId.GROS_OEUVRE]: 3,
      [ConstructionPhaseId.ECHAFAUDAGES]: 3,
      [ConstructionPhaseId.CHARPENTE_TOITURE]: 3,
      [ConstructionPhaseId.SECOND_OEUVRE]: 3,
      [ConstructionPhaseId.FINITIONS]: 3,
      [livraison]: 3
    }

    expect(nextUnlockedStage(complete, livraison)).toBeNull()
  })
})

describe('stage progress — persistance défensive', () => {
  it('garde le meilleur résultat, est idempotent et survit à une relecture', () => {
    expect(commitStageStars(terrain, 3)).toEqual({ [terrain]: 3 })
    expect(commitStageStars(terrain, 1)).toEqual({ [terrain]: 3 })
    expect(readStageProgress()).toEqual({ [terrain]: 3 })
  })

  it('garde trois étoiles et le stage suivant ouvert après une replay moins bonne', () => {
    const completed = commitStageStars(terrain, 3)
    const replayed = commitStageStars(terrain, 1, completed)

    expect(replayed).toEqual({ [terrain]: 3 })
    expect(nextUnlockedStage(replayed, terrain)).toBe(terrassement)
  })

  it('fusionne un snapshot courant périmé avec le stockage plus récent avant le résultat', () => {
    const staleCurrent: StageProgress = { [terrain]: 3, [terrassement]: 1 }
    localStorage.setItem(STAGE_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 1,
      bestStars: { [terrain]: 2, [terrassement]: 3 }
    }))

    const merged = commitStageStars(fondations, 2, staleCurrent)

    expect(merged).toEqual({ [terrain]: 3, [terrassement]: 3, [fondations]: 2 })
    expect(readStageProgress()).toEqual(merged)
  })

  it('n’écrit pas le stockage lorsqu’aucune note ne progresse', () => {
    localStorage.setItem(STAGE_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 1,
      bestStars: { [terrain]: 3 }
    }))
    const setItem = vi.spyOn(localStorage, 'setItem')

    expect(commitStageStars(terrain, 1, { [terrain]: 3 })).toEqual({ [terrain]: 3 })
    expect(setItem.mock.calls.filter(([key]) => key === STAGE_PROGRESS_STORAGE_KEY)).toHaveLength(0)
    setItem.mockRestore()
  })

  it('conserve les entrées valides et ignore JSON, versions, ids et notes invalides', () => {
    localStorage.setItem(STAGE_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 1,
      bestStars: {
        [terrain]: 3,
        inconnue: 3,
        [terrassement]: 2.5,
        [fondations]: 4,
        [ConstructionPhaseId.RESEAUX_ENTERRES]: 0
      }
    }))
    expect(readStageProgress()).toEqual({ [terrain]: 3, [ConstructionPhaseId.RESEAUX_ENTERRES]: 0 })

    localStorage.setItem(STAGE_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 2, bestStars: { [terrain]: 3 } }))
    expect(readStageProgress()).toEqual({})

    localStorage.setItem(STAGE_PROGRESS_STORAGE_KEY, '{')
    expect(readStageProgress()).toEqual({})
  })

  it('reste silencieux si le stockage est absent ou lève une erreur', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined })
    expect(() => commitStageStars(terrain, 3)).not.toThrow()
    expect(readStageProgress()).toEqual({})

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => { throw new Error('blocked') },
        setItem: () => { throw new Error('blocked') },
        removeItem: () => { throw new Error('blocked') }
      }
    })
    expect(() => commitStageStars(terrain, 3)).not.toThrow()
    expect(readStageProgress()).toEqual({})

    if (descriptor !== undefined) {
      Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('efface explicitement le profil', () => {
    commitStageStars(terrain, 3)
    resetStageProgress()
    expect(readStageProgress()).toEqual({})
  })
})
