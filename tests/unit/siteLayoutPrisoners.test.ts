/**
 * Otages POSABLES en éditeur (Volet 1) — routage compo → sim + gate procédural.
 *
 * Contrat : un élément embarqué portant `prisoner:{}` est routé par
 * `composedToSiteLayout` vers `SiteLayout.prisoners[]` (comme `destructible` vers
 * `destructibles[]`), et une compo renvoie TOUJOURS `prisoners` (même vide) — c'est
 * le signal « compo = vérité totale » qui coupe le scatter procédural côté sim.
 * Un stage SANS compo laisse `prisoners` absent → la sim retombe sur les 5 otages
 * procéduraux (RNG dédié), comportement historique inchangé.
 */
import { describe, it, expect } from 'vitest'
import { composedToSiteLayout, buildSiteLayout } from '@core/siteLayout'
import { emptyLayout, type StageLayout, type LayoutInstance } from '@content/stageLayout'
import { Simulation } from '@core/simulation'
import { WORLD, RESCUE } from '@content/config'
import { ConstructionPhaseId } from '@content/phases'

const OFF_X = WORLD.width / 2
const OFF_Y = WORLD.height / 2

function withInstances(insts: LayoutInstance[]): StageLayout {
  const l = emptyLayout('fondations')
  l.instances = insts
  return l
}

function inst(partial: Partial<LayoutInstance> & { prefab: string }): LayoutInstance {
  return { id: 'i', x: 0, y: 0, flipX: false, variant: 0, rotation: 0, locked: false, ...partial }
}

function prisonerInst(partial: Partial<LayoutInstance> & { prefab: string }): LayoutInstance {
  return inst({ elements: [{ assetKey: 'prisoner', dx: 0, dy: 0, scale: 0.62, collide: 'none', prisoner: {} }], ...partial })
}

describe('composedToSiteLayout — routage otage', () => {
  it('un élément prisoner est routé vers prisoners[] aux coords MONDE', () => {
    const out = composedToSiteLayout(withInstances([prisonerInst({ prefab: 'otage', x: 120, y: -420 })]))
    expect(out.prisoners).toEqual([{ x: OFF_X + 120, y: OFF_Y - 420 }])
  })

  it('l\'otage ne crée NI cluster/décor NI obstacle', () => {
    const out = composedToSiteLayout(withInstances([prisonerInst({ prefab: 'otage', x: 0, y: 0 })]))
    expect(out.clusters).toEqual([])
    expect(out.obstacles).toEqual([])
  })

  it('flipX miroir l\'offset de l\'otage', () => {
    const out = composedToSiteLayout(withInstances([
      inst({ prefab: 'otage', x: 0, y: 0, flipX: true, elements: [{ assetKey: 'prisoner', dx: 60, dy: 0, scale: 0.62, collide: 'none', prisoner: {} }] })
    ]))
    expect(out.prisoners?.[0]?.x).toBe(OFF_X - 60)
  })

  it('une compo renvoie TOUJOURS prisoners (vide si aucun otage posé)', () => {
    const out = composedToSiteLayout(emptyLayout('fondations'))
    expect(out.prisoners).toEqual([])
  })

  it('déterministe : mêmes entrées ⇒ même sortie', () => {
    const l = withInstances([prisonerInst({ prefab: 'otage', x: 10, y: 20 })])
    expect(composedToSiteLayout(l)).toEqual(composedToSiteLayout(l))
  })
})

describe('buildSiteLayout — gate compo vs procédural', () => {
  it('stage AVEC compo (terrain_vierge) → prisoners DÉFINI (compo = loi)', () => {
    const site = buildSiteLayout(42, WORLD.width, WORLD.height, ConstructionPhaseId.TERRAIN_VIERGE)
    expect(site.prisoners).toBeDefined()
  })

  it('stage SANS compo (terrassement) → prisoners ABSENT (fallback procédural)', () => {
    const site = buildSiteLayout(42, WORLD.width, WORLD.height, ConstructionPhaseId.TERRASSEMENT)
    expect(site.prisoners).toBeUndefined()
  })
})

describe('Simulation — otages : compo = loi, sinon procédural', () => {
  it('stage SANS compo → 5 otages procéduraux (comportement historique) + rescue.total=5', () => {
    const sim = new Simulation({ seed: 7, mode: 'solo', phaseId: ConstructionPhaseId.TERRASSEMENT })
    const st = sim.getState()
    expect(st.prisoners.length).toBe(RESCUE.count)
    expect(st.rescue.total).toBe(RESCUE.count)
  })

  it('stage AVEC compo → otages = ceux du layout, et rescue.total = leur nombre', () => {
    const sim = new Simulation({ seed: 7, mode: 'solo', phaseId: ConstructionPhaseId.TERRAIN_VIERGE })
    const st = sim.getState()
    const composed = buildSiteLayout(7, WORLD.width, WORLD.height, ConstructionPhaseId.TERRAIN_VIERGE)
    expect(st.prisoners.length).toBe(composed.prisoners?.length ?? -1)
    expect(st.rescue.total).toBe(st.prisoners.length)
  })
})
