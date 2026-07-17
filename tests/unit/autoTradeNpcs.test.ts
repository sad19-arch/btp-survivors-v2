/**
 * Auto-placement des PNJ MÉTIER (kind:'trade') sur les stages SANS compo sauvée.
 *
 * Contexte : les feuilles métier (2 par stage, geste PixelLab 8 frames avec
 * l'objet du métier) n'étaient rendues QUE via `_addComposedNpcsAndPaths`,
 * atteignable seulement si `resolveComposedLayout(stage) !== null`. Le registre
 * des compos étant VIDE, ce chemin ne s'exécutait sur AUCUN stage : les 21
 * entrées `kind:'trade'` déclarées étaient orphelines (0 rendue).
 *
 * Ce planner est PUR (aucun Phaser) : il donne les ancres des métiers pour le
 * chemin de repli génératif.
 */
import { describe, it, expect } from 'vitest'
import { planAutoTradeNpcs } from '@render/workerBehavior'
import { STAGE_RENDER } from '@render/stages'

const W = 10240
const H = 7680

describe('planAutoTradeNpcs', () => {
  it('place un job npc_trade par feuille métier fournie', () => {
    const out = planAutoTradeNpcs(['npc_a', 'npc_b'], W, H, 42, 55)
    expect(out).toHaveLength(2)
    expect(out.map((o) => o.skin)).toEqual(['npc_a', 'npc_b'])
    expect(out.every((o) => o.role === 'npc_trade')).toBe(true)
  })

  it('est DÉTERMINISTE (même seed ⇒ mêmes positions)', () => {
    const a = planAutoTradeNpcs(['x', 'y'], W, H, 7, 55)
    const b = planAutoTradeNpcs(['x', 'y'], W, H, 7, 55)
    expect(a).toEqual(b)
  })

  it('change de placement avec la seed (pas de position codée en dur)', () => {
    const a = planAutoTradeNpcs(['x', 'y'], W, H, 1, 55)
    const b = planAutoTradeNpcs(['x', 'y'], W, H, 2, 55)
    expect(a).not.toEqual(b)
  })

  it('place les PNJ DANS le monde et hors du centre (zone de spawn joueur)', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const p of planAutoTradeNpcs(['x', 'y', 'z'], W, H, seed, 55)) {
        expect(p.x).toBeGreaterThan(0)
        expect(p.x).toBeLessThan(W)
        expect(p.y).toBeGreaterThan(0)
        expect(p.y).toBeLessThan(H)
        // Pas collé au joueur (qui démarre au centre du monde).
        const d = Math.hypot(p.x - W / 2, p.y - H / 2)
        expect(d).toBeGreaterThan(300)
      }
    }
  })

  it('ne superpose pas deux métiers (silhouettes distinctes)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const out = planAutoTradeNpcs(['x', 'y'], W, H, seed, 55)
      const [a, b] = out
      if (a === undefined || b === undefined) { throw new Error('attendu 2') }
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(120)
    }
  })

  it('liste vide ⇒ aucun job (stage sans feuille métier)', () => {
    expect(planAutoTradeNpcs([], W, H, 1, 55)).toEqual([])
  })
})

describe('DA — échelle des PNJ métier : une échelle par FAMILLE d’art', () => {
  /**
   * Ne PAS calibrer sur la boîte englobante de chaque feuille.
   *
   * La bbox mesure « humain + accessoires » et dépend de la POSE : le trépied du
   * géomètre, l'échelle de l'échafaudeur et le mur de parpaings du maçon la
   * gonflent, tandis qu'un ferrailleur ACCROUPI la réduit. Normaliser chaque
   * bbox à 99 px rendait donc le ferrailleur accroupi aussi grand qu'un joueur
   * debout (vérifié sur planche en contexte).
   *
   * Les feuilles partagent un gabarit PAR FAMILLE : une échelle par famille
   * aligne les métiers DEBOUT sur le joueur (~99 px) tout en conservant les
   * écarts VOULUS (accroupi plus petit, accessoire plus haut).
   */
  const TRADE_SCALE = 0.62 // *_trade : PixelLab v3, 256², debout
  const WORK_SCALE = 0.78 // *_work : gabarit plus petit

  it('chaque feuille métier porte l’échelle de SA famille', () => {
    for (const [id, r] of Object.entries(STAGE_RENDER)) {
      for (const a of (r.ambient ?? []).filter((x) => x.kind === 'trade')) {
        const expected = a.file.endsWith('_trade.png') ? TRADE_SCALE : WORK_SCALE
        expect(a.scale, `${id}/${a.key} (${a.file})`).toBe(expected)
      }
    }
  })

  it('aucune échelle nulle/absurde (PNJ invisible ou géant)', () => {
    for (const [, r] of Object.entries(STAGE_RENDER)) {
      for (const a of (r.ambient ?? []).filter((x) => x.kind === 'trade')) {
        expect(a.scale).toBeGreaterThan(0.4)
        expect(a.scale).toBeLessThan(1.2)
      }
    }
  })
})

describe('CIBLE UTILISATEUR : au moins 2 métiers animés par stage, sur les 10', () => {
  it('chaque stage déclare ≥2 feuilles kind:trade', () => {
    const stages = Object.entries(STAGE_RENDER)
    expect(stages).toHaveLength(10)
    for (const [id, r] of stages) {
      const trade = (r.ambient ?? []).filter((a) => a.kind === 'trade')
      expect(trade.length, `stage ${id}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('chaque stage produit ≥2 PNJ métier placés', () => {
    for (const [id, r] of Object.entries(STAGE_RENDER)) {
      const keys = (r.ambient ?? []).filter((a) => a.kind === 'trade').map((a) => a.key)
      const placed = planAutoTradeNpcs(keys, W, H, 123, 55)
      expect(placed.length, `stage ${id}`).toBeGreaterThanOrEqual(2)
    }
  })
})
