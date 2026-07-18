import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readHiScores, qualifies, insertHiScore, type HiScoreEntry } from '@ui/hiscores'

/**
 * Tableaux de high scores PAR STAGE (localStorage `btp:hiscores_v1`) — top 20
 * trié par score décroissant, tri stable, robuste aux environnements sans
 * localStorage et au JSON corrompu. Teste le VRAI module (pas de logique
 * réimplémentée ici).
 */
function entry(overrides: Partial<HiScoreEntry> = {}): HiScoreEntry {
  return {
    name: 'AAA',
    score: 1000,
    kills: 10,
    elapsedMs: 60000,
    level: 5,
    ...overrides
  }
}

describe('hiscores (tableaux par stage, localStorage)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('insertion triée par score décroissant', () => {
    insertHiScore('terrain_vierge', entry({ name: 'BBB', score: 500 }))
    insertHiScore('terrain_vierge', entry({ name: 'CCC', score: 900 }))
    insertHiScore('terrain_vierge', entry({ name: 'AAA', score: 700 }))
    const list = readHiScores('terrain_vierge')
    expect(list.map(e => e.score)).toEqual([900, 700, 500])
  })

  it('plafond STRICT à 20 : 25 insertions ⇒ exactement 20 entrées, les 20 meilleures', () => {
    for (let i = 0; i < 25; i++) {
      insertHiScore('terrassement', entry({ name: `P${i}`, score: i }))
    }
    const list = readHiScores('terrassement')
    expect(list.length).toBe(20)
    // Scores 0..24 insérés → les 20 meilleurs sont 5..24, triés décroissant.
    const expectedScores = Array.from({ length: 20 }, (_, i) => 24 - i)
    expect(list.map(e => e.score)).toEqual(expectedScores)
  })

  it('un score non qualifiant est refusé et retourne -1 (sans modifier le classement)', () => {
    for (let i = 0; i < 20; i++) {
      insertHiScore('fondations', entry({ name: `P${i}`, score: 100 + i }))
    }
    const rank = insertHiScore('fondations', entry({ name: 'LOW', score: 1 }))
    expect(rank).toBe(-1)
    const list = readHiScores('fondations')
    expect(list.length).toBe(20)
    expect(list.some(e => e.name === 'LOW')).toBe(false)
  })

  it("name tronqué à 8 caractères et assaini (retours à la ligne / caractères de contrôle retirés)", () => {
    const rank = insertHiScore('reseaux_enterres', entry({ name: 'AB\nCD\tEFGH\x01IJ', score: 42 }))
    expect(rank).toBe(0)
    const list = readHiScores('reseaux_enterres')
    const name = list[0]?.name ?? ''
    expect(name.length).toBeLessThanOrEqual(8)
    expect(name).not.toMatch(/[\r\n\t]/)
    // eslint-disable-next-line no-control-regex -- vérifie explicitement l'absence de caractères de contrôle
    expect(/[\x00-\x1F\x7F]/.test(name)).toBe(false)
  })

  it('JSON corrompu en localStorage ⇒ liste vide, pas de crash', () => {
    localStorage.setItem('btp:hiscores_v1', '{{{')
    expect(() => readHiScores('gros_oeuvre')).not.toThrow()
    expect(readHiScores('gros_oeuvre')).toEqual([])
  })

  it('localStorage absent (headless/SSR) ⇒ repli silencieux, pas de crash', () => {
    vi.stubGlobal('localStorage', undefined)
    try {
      expect(() => insertHiScore('echafaudages', entry({ score: 10 }))).not.toThrow()
      expect(() => qualifies('echafaudages', 10)).not.toThrow()
      expect(() => readHiScores('echafaudages')).not.toThrow()
      expect(readHiScores('echafaudages')).toEqual([])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('le tri est STABLE : deux scores ÉGAUX ⇒ le premier arrivé reste devant', () => {
    insertHiScore('charpente_toiture', entry({ name: 'FIRST', score: 300 }))
    insertHiScore('charpente_toiture', entry({ name: 'SECOND', score: 300 }))
    const list = readHiScores('charpente_toiture')
    const names = list.filter(e => e.score === 300).map(e => e.name)
    expect(names).toEqual(['FIRST', 'SECOND'])
  })

  it('les stages sont indépendants (un score sur un stage n\'apparaît pas sur un autre)', () => {
    insertHiScore('terrain_vierge', entry({ name: 'TV', score: 111 }))
    expect(readHiScores('terrassement').some(e => e.name === 'TV')).toBe(false)
    expect(readHiScores('terrain_vierge').some(e => e.name === 'TV')).toBe(true)
  })
})
