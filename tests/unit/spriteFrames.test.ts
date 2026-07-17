/**
 * Frames de marche adaptées au GABARIT RÉEL de la feuille.
 *
 * Contexte du bug : `walkFrame(row) = row*4 + col` suppose une feuille 4×4.
 * Or TOUTES les feuilles PNJ du jeu sont MONO-LIGNE (mesuré : porteur_work
 * = 6 frames, geometre_trade = 8, terrassier_work = 5). Dès qu'un PNJ marche
 * vers l'est (row 1), la formule demande les frames 4..7 — absentes d'une
 * feuille de 5 ou 6 frames → Phaser garde la frame précédente → PNJ FIGÉ.
 */
import { describe, it, expect } from 'vitest'
import { walkFrameOf, walkFrame, dirRow, SHEET_FRAMES } from '@render/sprites'

describe('walkFrameOf — feuilles mono-ligne vs 4×4', () => {
  it('feuille 4×4 (16 frames, ex. camion/joueur) : garde la ligne de direction', () => {
    // Est (row 1) → frames 4..7, comme walkFrame historique.
    for (const t of [0, 130, 260, 390]) {
      expect(walkFrameOf(16, dirRow(1, 0), t, 130)).toBe(walkFrame(dirRow(1, 0), t, 130))
    }
    // Nord (row 2) → 8..11.
    expect(walkFrameOf(16, dirRow(0, -1), 0, 130)).toBe(8)
  })

  it('feuille mono-ligne : ne sort JAMAIS de la feuille, quelle que soit la direction', () => {
    // Le cas qui figeait : 6 frames, marche vers l'est.
    for (const total of [4, 5, 6, 8, 12]) {
      for (const [vx, vy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (const t of [0, 100, 250, 999, 5000]) {
          const f = walkFrameOf(total, dirRow(vx, vy), t, 130)
          expect(f).toBeGreaterThanOrEqual(0)
          expect(f).toBeLessThan(total)
        }
      }
    }
  })

  it('feuille mono-ligne : le geste DÉFILE (pas figé) quand le temps avance', () => {
    const seen = new Set<number>()
    for (let t = 0; t < 6 * 130; t += 130) {
      seen.add(walkFrameOf(6, dirRow(1, 0), t, 130))
    }
    // 6 frames distinctes parcourues → animé, pas bloqué sur une seule.
    expect(seen.size).toBe(6)
  })

  it('la feuille mono-ligne du porteur (6 frames) vers l’est n’est plus hors bornes', () => {
    // walkFrame historique demandait 4..7 → 6 et 7 n'existent pas.
    const legacy = walkFrame(dirRow(1, 0), 2 * 130, 130)
    expect(legacy).toBeGreaterThanOrEqual(6) // reproduit le bug
    expect(walkFrameOf(6, dirRow(1, 0), 2 * 130, 130)).toBeLessThan(6)
  })

  it('SHEET_FRAMES reste la convention 4×4', () => {
    expect(SHEET_FRAMES).toBe(4)
  })
})
