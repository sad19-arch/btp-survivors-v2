/**
 * Tests de la musique dédiée par stage.
 *
 * Vérifie :
 * - Chacun des 10 phaseId retourne sa clé unique (terrain_vierge→music_stage_01, …)
 * - Boss présent → MUSIC.boss (prioritaire)
 * - Écrans titre/pause/victory/gameover → leurs clés dédiées
 * - MUSIC_FILES_STAGE contient exactement 10 entrées
 * - MUSIC_FILES_SHARED ne contient AUCUNE piste de stage (garde-fou anti-60MB boot)
 * Pas de garde silencieuse.
 */
import { describe, it, expect } from 'vitest'
import {
  musicForState,
  MUSIC,
  MUSIC_FILES_SHARED,
  MUSIC_FILES_STAGE
} from '@/audio/manifest'

const PHASE_TO_KEY: ReadonlyArray<readonly [string, string]> = [
  ['terrain_vierge', MUSIC.stage_01],
  ['terrassement', MUSIC.stage_02],
  ['fondations', MUSIC.stage_03],
  ['reseaux_enterres', MUSIC.stage_04],
  ['gros_oeuvre', MUSIC.stage_05],
  ['echafaudages', MUSIC.stage_06],
  ['charpente_toiture', MUSIC.stage_07],
  ['second_oeuvre', MUSIC.stage_08],
  ['finitions', MUSIC.stage_09],
  ['livraison_audit', MUSIC.stage_10]
]

describe('stageMusic — une musique dédiée par stage', () => {
  it('chacun des 10 phaseId retourne sa clé unique', () => {
    for (const [phaseId, expectedKey] of PHASE_TO_KEY) {
      const result = musicForState({ screen: 'game', stageId: phaseId, bossPresent: false, chestOpen: false })
      expect(result, `phase ${phaseId}`).toBe(expectedKey)
    }
  })

  it('toutes les clés de stage sont distinctes (pas de doublons)', () => {
    const keys = PHASE_TO_KEY.map(([phaseId]) =>
      musicForState({ screen: 'game', stageId: phaseId, bossPresent: false, chestOpen: false })
    )
    const unique = new Set(keys)
    expect(unique.size).toBe(PHASE_TO_KEY.length)
  })

  it('boss présent → MUSIC.boss (prioritaire sur la musique de stage)', () => {
    for (const [phaseId] of PHASE_TO_KEY) {
      const result = musicForState({ screen: 'game', stageId: phaseId, bossPresent: true, chestOpen: false })
      expect(result, `boss sur phase ${phaseId}`).toBe(MUSIC.boss)
    }
  })

  it('titre → MUSIC.title', () => {
    expect(musicForState({ screen: 'title', stageId: 'terrain_vierge', bossPresent: false, chestOpen: false })).toBe(MUSIC.title)
  })

  it('pause → MUSIC.menu', () => {
    expect(musicForState({ screen: 'paused', stageId: 'terrain_vierge', bossPresent: false, chestOpen: false })).toBe(MUSIC.menu)
  })

  it('victory → MUSIC.victory', () => {
    expect(musicForState({ screen: 'victory', stageId: 'terrain_vierge', bossPresent: false, chestOpen: false })).toBe(MUSIC.victory)
  })

  it('gameover → MUSIC.gameover', () => {
    expect(musicForState({ screen: 'gameover', stageId: 'terrain_vierge', bossPresent: false, chestOpen: false })).toBe(MUSIC.gameover)
  })

  it("l'upgrade garde la musique de stage courante", () => {
    expect(musicForState({ screen: 'upgrade', stageId: 'terrain_vierge', bossPresent: false, chestOpen: false })).toBe(MUSIC.stage_01)
    expect(musicForState({ screen: 'upgrade', stageId: 'livraison_audit', bossPresent: false, chestOpen: false })).toBe(MUSIC.stage_10)
  })

  it('coffre ouvert → MUSIC.chest, PRIORITAIRE même sur un boss présent (retour playtest)', () => {
    expect(
      musicForState({ screen: 'game', stageId: 'terrain_vierge', bossPresent: true, chestOpen: true })
    ).toBe(MUSIC.chest)
    expect(
      musicForState({ screen: 'upgrade', stageId: 'livraison_audit', bossPresent: false, chestOpen: true })
    ).toBe(MUSIC.chest)
  })
})

describe('stageMusic — garde-fous préchargement', () => {
  it('MUSIC_FILES_STAGE contient exactement 10 entrées', () => {
    expect(MUSIC_FILES_STAGE.length).toBe(10)
  })

  it('MUSIC_FILES_SHARED ne contient AUCUNE piste de stage (garde-fou anti-60MB au boot)', () => {
    const stageKeys = new Set(MUSIC_FILES_STAGE.map(([k]) => k))
    for (const [key] of MUSIC_FILES_SHARED) {
      expect(stageKeys.has(key), `${key} ne doit PAS être dans MUSIC_FILES_SHARED`).toBe(false)
    }
  })

  it('chaque piste de stage est référencée dans MUSIC_FILES_STAGE', () => {
    const stagedKeys = new Set(MUSIC_FILES_STAGE.map(([k]) => k))
    const stageMusics = [
      MUSIC.stage_01, MUSIC.stage_02, MUSIC.stage_03, MUSIC.stage_04, MUSIC.stage_05,
      MUSIC.stage_06, MUSIC.stage_07, MUSIC.stage_08, MUSIC.stage_09, MUSIC.stage_10
    ]
    for (const key of stageMusics) {
      expect(stagedKeys.has(key), `${key} manquant dans MUSIC_FILES_STAGE`).toBe(true)
    }
  })

  it('MUSIC_FILES_STAGE contient des chemins .mp3 valides (audio/music/stage_XX.mp3)', () => {
    for (const [key, url] of MUSIC_FILES_STAGE) {
      expect(url, `url de ${key}`).toMatch(/^audio\/music\/stage_\d{2}\.mp3$/)
    }
  })
})
