import { describe, it, expect } from 'vitest'
import { parseLayout } from '@/editor/StageLayoutSchema'
import { PATH_LIMITS } from '@content/stageLayout'

/**
 * Les réglages d'un chemin doivent SURVIVRE à l'aller-retour sauvegarde →
 * chargement. `parseLayout` a déjà perdu `destructible`, `layer` et `tile` en
 * silence : un champ non recopié ici disparaît sans la moindre erreur.
 */

function layoutWith(path: Record<string, unknown>): string {
  return JSON.stringify({
    version: 1,
    stage: 'terrain_vierge',
    worldSize: { width: 10240, height: 7680 },
    paths: [{ id: 'p1', type: 'worker_path', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], ...path }]
  })
}

function firstPath(raw: string) {
  const res = parseLayout(raw, 'terrain_vierge')
  expect(res.ok).toBe(true)
  if (res.layout === undefined) { throw new Error("parseLayout n'a rien rendu") }
  const p = res.layout.paths[0]
  if (p === undefined) { throw new Error("chemin perdu au parse") }
  return p
}

describe('parseLayout — réglages de chemin PRÉSERVÉS', () => {
  it('préserve name / skin / count / speed / pauseMs / oneWay', () => {
    const p = firstPath(layoutWith({
      name: 'Livraison béton',
      skin: 'npc_ouvrier_zinedine',
      count: 3,
      speed: 120,
      pauseMs: 2000,
      oneWay: true
    }))
    expect(p.name).toBe('Livraison béton')
    expect(p.skin).toBe('npc_ouvrier_zinedine')
    expect(p.count).toBe(3)
    expect(p.speed).toBe(120)
    expect(p.pauseMs).toBe(2000)
    expect(p.oneWay).toBe(true)
  })

  it('un chemin SANS réglages reste sans réglages (défauts = comportement actuel)', () => {
    const p = firstPath(layoutWith({}))
    expect(p.name).toBeUndefined()
    expect(p.skin).toBeUndefined()
    expect(p.count).toBeUndefined()
    expect(p.speed).toBeUndefined()
    expect(p.pauseMs).toBeUndefined()
    expect(p.oneWay).toBeUndefined()
  })
})

describe('parseLayout — bornes CLAMPÉES, jamais rejetées', () => {
  it('clampe count hors bornes (une compo doit rester chargeable)', () => {
    expect(firstPath(layoutWith({ count: 99 })).count).toBe(PATH_LIMITS.count.max)
    expect(firstPath(layoutWith({ count: -3 })).count).toBe(PATH_LIMITS.count.min)
  })

  it('clampe la vitesse — 0 provoquerait une division par zéro dans tTrajet', () => {
    expect(firstPath(layoutWith({ speed: 0 })).speed).toBe(PATH_LIMITS.speed.min)
    expect(firstPath(layoutWith({ speed: 9999 })).speed).toBe(PATH_LIMITS.speed.max)
  })

  it('clampe la pause', () => {
    expect(firstPath(layoutWith({ pauseMs: -1 })).pauseMs).toBe(PATH_LIMITS.pauseMs.min)
    expect(firstPath(layoutWith({ pauseMs: 999999 })).pauseMs).toBe(PATH_LIMITS.pauseMs.max)
  })

  it('ignore les types aberrants au lieu de casser la compo', () => {
    const p = firstPath(layoutWith({ count: 'trois', speed: null, oneWay: 'oui', name: 42 }))
    expect(p.count).toBeUndefined()
    expect(p.speed).toBeUndefined()
    expect(p.oneWay).toBeUndefined()
    expect(p.name).toBeUndefined()
    // Le chemin lui-même survit.
    expect(p.points.length).toBe(2)
  })
})
