import { describe, it, expect } from 'vitest'
import { spawnCapAt, SPAWN, FINALE, FINAL_BOSS, stageCompletionPct } from '@content/config'

/**
 * Plafond d'ennemis variable dans le temps : 220 en régime normal, montée vers
 * 700 sur 19:30→20:00, tenu jusqu'au boss à 22:00. Le surcoût de la saturation
 * est ainsi CONFINÉ aux 2 dernières minutes.
 */
describe('spawnCapAt — plafond variable (finale saturée)', () => {
  it('reste à SPAWN.maxActive (220) tout le début de run', () => {
    expect(spawnCapAt(0)).toBe(SPAWN.maxActive)
    expect(spawnCapAt(600_000)).toBe(SPAWN.maxActive) // 10:00
    expect(spawnCapAt(FINALE.rampStartMs)).toBe(SPAWN.maxActive) // 19:30 (borne)
  })

  it('atteint SPAWN.maxActiveFinale (700) à 20:00 et le tient jusqu\'à 22:00', () => {
    expect(spawnCapAt(FINALE.fullMs)).toBe(SPAWN.maxActiveFinale) // 20:00
    expect(spawnCapAt(1_260_000)).toBe(SPAWN.maxActiveFinale) // 21:00
    expect(spawnCapAt(FINALE.endMs)).toBe(SPAWN.maxActiveFinale) // 22:00
    expect(spawnCapAt(9_999_999)).toBe(SPAWN.maxActiveFinale) // au-delà
  })

  it('monte de façon monotone sur la fenêtre 19:30→20:00', () => {
    const a = spawnCapAt(1_170_000) // 19:30
    const b = spawnCapAt(1_185_000) // 19:45
    const c = spawnCapAt(1_200_000) // 20:00
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(SPAWN.maxActive)
    expect(b).toBeLessThan(SPAWN.maxActiveFinale)
  })

  it('les valeurs de finale : 220 → 700', () => {
    expect(SPAWN.maxActive).toBe(220)
    expect(SPAWN.maxActiveFinale).toBe(700)
  })

  it('le boss final apparaît à 22:00 (après la finale)', () => {
    expect(FINAL_BOSS.atMs).toBe(1_320_000)
    expect(FINAL_BOSS.atMs).toBe(FINALE.endMs)
  })
})

describe('stageCompletionPct — avancement du chantier', () => {
  it('progresse de 0 vers 99 sur l\'arc, sans jamais atteindre 100 hors victoire', () => {
    expect(stageCompletionPct(0, false)).toBe(0)
    expect(stageCompletionPct(660_000, false)).toBe(50) // 11:00 = mi-arc
    expect(stageCompletionPct(FINAL_BOSS.atMs / 2, false)).toBe(50)
  })

  it('PLAFONNE à 99 à 22:00 et au-delà tant que le boss n\'est pas tué', () => {
    expect(stageCompletionPct(FINAL_BOSS.atMs, false)).toBe(99) // 22:00 pile
    expect(stageCompletionPct(FINAL_BOSS.atMs + 120_000, false)).toBe(99) // combat de boss
    expect(stageCompletionPct(9_999_999, false)).toBe(99)
  })

  it('100 UNIQUEMENT en victoire (boss tué) — jamais en défaite', () => {
    expect(stageCompletionPct(FINAL_BOSS.atMs, true)).toBe(100)
    expect(stageCompletionPct(0, true)).toBe(100) // victoire = livré, quel que soit t
    // Invariant clé : une défaite, même à/après 22:00, n'affiche jamais 100.
    expect(stageCompletionPct(FINAL_BOSS.atMs, false)).toBeLessThan(100)
  })
})
