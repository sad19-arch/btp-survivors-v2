import { describe, it, expect } from 'vitest'
import { planPathWalkers } from '@render/workerBehavior'
import { emptyLayout, type StageLayout, type LayoutPath } from '@content/stageLayout'

/**
 * Un chemin → N plans de marcheurs ÉTALÉS. Logique pure : `siteWorkers` ne fait
 * que créer les sprites correspondants.
 */

function withPath(p: Partial<LayoutPath>): StageLayout {
  const l = emptyLayout('terrain_vierge')
  l.paths = [{
    id: 'p1',
    type: 'worker_path',
    points: [{ x: -100, y: 0 }, { x: 100, y: 0 }],
    ...p
  }]
  return l
}

const W = 10240
const H = 7680

describe('planPathWalkers — défauts = comportement historique', () => {
  it('un chemin sans réglages → UN marcheur, sans pause, aller-retour', () => {
    const plans = planPathWalkers(withPath({}), W, H)
    expect(plans.length).toBe(1)
    expect(plans[0]?.pauseMs).toBe(0)
    expect(plans[0]?.oneWay).toBe(false)
    expect(plans[0]?.phaseMs).toBe(0)
  })

  it('vitesse par défaut selon le type : 74 ouvrier / 150 camion', () => {
    expect(planPathWalkers(withPath({}), W, H)[0]?.speed).toBe(74)
    expect(planPathWalkers(withPath({ type: 'truck_path' }), W, H)[0]?.speed).toBe(150)
  })

  it('convertit les points en coordonnées MONDE (origine = centre)', () => {
    const p = planPathWalkers(withPath({}), W, H)[0]
    expect(p?.points[0]?.x).toBe(W / 2 - 100)
    expect(p?.points[1]?.x).toBe(W / 2 + 100)
    expect(p?.points[0]?.y).toBe(H / 2)
  })
})

describe('planPathWalkers — N marcheurs étalés', () => {
  it('count: 3 → 3 plans, décalés d’un tiers de cycle', () => {
    // 200px @ 100px/s = 2s de trajet → cycle aller-retour = 4s = 4000ms.
    const plans = planPathWalkers(withPath({ count: 3, speed: 100 }), W, H)
    expect(plans.length).toBe(3)
    const phases = plans.map((p) => Math.round(p.phaseMs))
    expect(phases).toEqual([0, 1333, 2667])
  })

  it('l’étalement tient compte de la pause (le cycle s’allonge)', () => {
    // 2s de trajet + 1s de pause à chaque bout → cycle = 2*2 + 2*1 = 6s.
    const plans = planPathWalkers(withPath({ count: 2, speed: 100, pauseMs: 1000 }), W, H)
    expect(Math.round(plans[1]?.phaseMs ?? 0)).toBe(3000)
  })

  it('sens unique : le cycle est trajet + pause (pas de retour)', () => {
    // 2s de trajet + 1s d'absence → cycle = 3s ; 2 marcheurs → décalage 1,5s.
    const plans = planPathWalkers(withPath({ count: 2, speed: 100, pauseMs: 1000, oneWay: true }), W, H)
    expect(Math.round(plans[1]?.phaseMs ?? 0)).toBe(1500)
  })

  it('count: 0 → AUCUN marcheur (le chemin est un simple repère)', () => {
    expect(planPathWalkers(withPath({ count: 0 }), W, H).length).toBe(0)
  })

  it('un chemin de moins de 2 points est ignoré', () => {
    expect(planPathWalkers(withPath({ points: [{ x: 0, y: 0 }] }), W, H).length).toBe(0)
  })

  it('count hors bornes est CLAMPÉ (un layout brut peut contourner le parse)', () => {
    // `planPathWalkers` consomme aussi des layouts venus du registre committé,
    // qui ne passent pas forcément par parseLayout → il reborne lui-même.
    expect(planPathWalkers(withPath({ count: 99 }), W, H).length).toBe(8)
  })

  it('vitesse hors bornes clampée → jamais de division par zéro dans le cycle', () => {
    const p = planPathWalkers(withPath({ speed: 0 }), W, H)[0]
    expect(p?.speed).toBe(10)
    expect(Number.isFinite(p?.phaseMs ?? NaN)).toBe(true)
  })
})

describe('planPathWalkers — réglages transmis', () => {
  it('transmet skin / pause / sens unique tels quels', () => {
    const p = planPathWalkers(withPath({
      skin: 'npc_ouvrier_marius', pauseMs: 2500, oneWay: true
    }), W, H)[0]
    expect(p?.skin).toBe('npc_ouvrier_marius')
    expect(p?.pauseMs).toBe(2500)
    expect(p?.oneWay).toBe(true)
  })

  it('skin absent → null (le rendu choisira le défaut de la famille)', () => {
    expect(planPathWalkers(withPath({}), W, H)[0]?.skin).toBeNull()
  })

  it('skin vide → null (l’inspecteur remet « (défaut) » en chaîne vide)', () => {
    // `skin: ''` doit valoir « pas de skin », pas « texture nommée '' » : sinon
    // `textures.exists('')` échoue et le marcheur disparaît au lieu de retomber
    // sur le défaut de sa famille.
    expect(planPathWalkers(withPath({ skin: '' }), W, H)[0]?.skin).toBeNull()
  })

  it('reporte l’id et le type du chemin sur chaque marcheur', () => {
    const p = planPathWalkers(withPath({ type: 'truck_path', count: 2 }), W, H)
    expect(p[0]?.pathId).toBe('p1')
    expect(p[1]?.type).toBe('truck_path')
  })
})
