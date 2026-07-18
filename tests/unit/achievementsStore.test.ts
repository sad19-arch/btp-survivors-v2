import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readUnlocked,
  readProgress,
  commitRun,
  mergeProgress,
  resetAchievements,
  EMPTY_PROGRESS
} from '@ui/achievements'
import type { AchievementProgress } from '@content/achievements'

/**
 * Persistance des succès (localStorage `btp:achievements_v1`) — fusion des
 * compteurs SELON LEUR NATURE (cumuls additionnés / records maximisés), ids
 * inconnus ignorés, robustesse au JSON corrompu et à l'absence de localStorage.
 * Teste le VRAI module (aucune logique réimplémentée ici).
 */
function run(overrides: Partial<AchievementProgress> = {}): AchievementProgress {
  return { ...EMPTY_PROGRESS, ...overrides }
}

const ONE_MINUTE_MS = 60_000

describe('achievements — persistance du profil', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('⚠️ LE PIÈGE : records de run — MAX, jamais somme', () => {
    it("deux runs d'1 min ⇒ bestSurvivalMs reste 60000 (PAS 120000)", () => {
      const oneMinute = run({ bestSurvivalMs: ONE_MINUTE_MS })
      const merged = mergeProgress(mergeProgress(EMPTY_PROGRESS, oneMinute), oneMinute)
      expect(merged.bestSurvivalMs).toBe(ONE_MINUTE_MS)
      expect(merged.bestSurvivalMs).not.toBe(2 * ONE_MINUTE_MS)
    })

    it('deux runs niveau 5 ⇒ bestLevel reste 5 (PAS 10)', () => {
      const level5 = run({ bestLevel: 5 })
      const merged = mergeProgress(mergeProgress(EMPTY_PROGRESS, level5), level5)
      expect(merged.bestLevel).toBe(5)
      expect(merged.bestLevel).not.toBe(10)
    })

    it("le succès « tenir 10 minutes » NE se débloque PAS avec dix runs d'une minute", () => {
      for (let i = 0; i < 10; i++) {
        commitRun(run({ bestSurvivalMs: ONE_MINUTE_MS }))
      }
      expect(readProgress().bestSurvivalMs).toBe(ONE_MINUTE_MS)
      expect(readUnlocked().has('survie_10min')).toBe(false)
    })

    it('… mais UNE run de 10 minutes le débloque bien', () => {
      const newly = commitRun(run({ bestSurvivalMs: 10 * ONE_MINUTE_MS }))
      expect(newly).toContain('survie_10min')
      expect(readUnlocked().has('survie_10min')).toBe(true)
    })

    it('un record ne RÉGRESSE pas : une run plus faible après un record garde le max', () => {
      commitRun(run({ bestSurvivalMs: 5 * ONE_MINUTE_MS, bestLevel: 12 }))
      commitRun(run({ bestSurvivalMs: ONE_MINUTE_MS, bestLevel: 2 }))
      const p = readProgress()
      expect(p.bestSurvivalMs).toBe(5 * ONE_MINUTE_MS)
      expect(p.bestLevel).toBe(12)
    })
  })

  describe('cumuls de profil : ils s’additionnent', () => {
    it('deux runs de 50 kills ⇒ 100 kills', () => {
      commitRun(run({ kills: 50 }))
      commitRun(run({ kills: 50 }))
      expect(readProgress().kills).toBe(100)
    })

    it('tous les cumuls s’additionnent (boss, coffres, évolutions, prisonniers, chantiers)', () => {
      const r = run({
        bossKills: 1,
        chestsOpened: 2,
        weaponEvolutions: 3,
        prisonersFreed: 4,
        stagesCompleted: 1
      })
      commitRun(r)
      commitRun(r)
      const p = readProgress()
      expect(p.bossKills).toBe(2)
      expect(p.chestsOpened).toBe(4)
      expect(p.weaponEvolutions).toBe(6)
      expect(p.prisonersFreed).toBe(8)
      expect(p.stagesCompleted).toBe(2)
    })

    it('un cumul franchit son seuil À TRAVERS les runs (2 × 50 kills ⇒ « kills_100 »)', () => {
      const first = commitRun(run({ kills: 50 }))
      expect(first).not.toContain('kills_100')
      const second = commitRun(run({ kills: 50 }))
      expect(second).toContain('kills_100')
    })
  })

  describe('commitRun — retour des NOUVEAUX succès seulement', () => {
    it('ne retourne JAMAIS un succès déjà débloqué (sinon le toast se rejoue en boucle)', () => {
      const first = commitRun(run({ bossKills: 1 }))
      expect(first).toContain('premier_boss')
      const second = commitRun(run({ bossKills: 1 }))
      expect(second).not.toContain('premier_boss')
    })

    it('une run sans rien de neuf retourne un tableau vide', () => {
      commitRun(run({ bossKills: 1 }))
      expect(commitRun(run())).toEqual([])
    })

    it('les succès déjà acquis restent persistés après une run vide', () => {
      commitRun(run({ chestsOpened: 1 }))
      commitRun(run())
      expect(readUnlocked().has('coffre_ouvert')).toBe(true)
    })

    it('NON IDEMPOTENT (documenté) : re-committer la même run redouble les cumuls', () => {
      const r = run({ kills: 10 })
      commitRun(r)
      commitRun(r)
      // Comportement ASSUMÉ : un appel = une run terminée. Ce test verrouille le
      // contrat documenté pour qu'un futur refactor ne le change pas en silence.
      expect(readProgress().kills).toBe(20)
    })

    it('ne mute pas l’objet `run` passé par l’appelant', () => {
      const r = run({ kills: 7, bestLevel: 3 })
      const snapshot = { ...r }
      commitRun(r)
      expect(r).toEqual(snapshot)
    })
  })

  describe('robustesse du stockage', () => {
    it('JSON corrompu ⇒ état vide, pas de crash', () => {
      localStorage.setItem('btp:achievements_v1', '{{{')
      expect(() => readProgress()).not.toThrow()
      expect(readProgress()).toEqual(EMPTY_PROGRESS)
      expect([...readUnlocked()]).toEqual([])
    })

    it('un id INCONNU au chargement est IGNORÉ, pas fatal', () => {
      localStorage.setItem(
        'btp:achievements_v1',
        JSON.stringify({
          unlocked: ['premier_boss', 'succes_supprime_du_catalogue', 42, null],
          progress: EMPTY_PROGRESS
        })
      )
      const unlocked = readUnlocked()
      expect(unlocked.has('premier_boss')).toBe(true)
      expect(unlocked.has('succes_supprime_du_catalogue')).toBe(false)
      expect(unlocked.size).toBe(1)
    })

    it('champs de progression absents / du mauvais type ⇒ 0, pas de NaN', () => {
      localStorage.setItem(
        'btp:achievements_v1',
        JSON.stringify({ unlocked: [], progress: { kills: 'beaucoup', bossKills: -5, bestLevel: null } })
      )
      const p = readProgress()
      expect(p.kills).toBe(0)
      expect(p.bossKills).toBe(0)
      expect(p.bestLevel).toBe(0)
      expect(Object.values(p).every((v) => Number.isFinite(v))).toBe(true)
    })

    it('clé absente ⇒ profil vierge', () => {
      expect(readProgress()).toEqual(EMPTY_PROGRESS)
      expect(readUnlocked().size).toBe(0)
    })

    it('localStorage absent (headless/SSR) ⇒ repli silencieux, pas de crash', () => {
      vi.stubGlobal('localStorage', undefined)
      try {
        expect(() => readProgress()).not.toThrow()
        expect(() => readUnlocked()).not.toThrow()
        expect(() => commitRun(run({ kills: 10 }))).not.toThrow()
        expect(() => resetAchievements()).not.toThrow()
        expect(readProgress()).toEqual(EMPTY_PROGRESS)
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('le profil survit à un rechargement (persistance réelle, pas un cache mémoire)', () => {
      commitRun(run({ kills: 120, bestLevel: 9 }))
      // readProgress() relit le stockage à chaque appel : pas d'état en module.
      const p = readProgress()
      expect(p.kills).toBe(120)
      expect(p.bestLevel).toBe(9)
      expect(readUnlocked().has('kills_100')).toBe(true)
    })

    it('resetAchievements efface tout', () => {
      commitRun(run({ kills: 500, bossKills: 1 }))
      resetAchievements()
      expect(readProgress()).toEqual(EMPTY_PROGRESS)
      expect(readUnlocked().size).toBe(0)
    })
  })
})
