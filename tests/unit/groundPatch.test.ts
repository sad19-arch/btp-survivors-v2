import { describe, it, expect } from 'vitest'
import { getStageCatalog, STAGE_LIST } from '@/editor/PrefabCatalog'
import { groundTilesForLayout } from '@render/ground'
import { composedToSiteLayout } from '@core/siteLayout'
import { parseLayout } from '@/editor/StageLayoutSchema'
import { STAGE_RENDER } from '@render/stages'
import { emptyLayout, type StageLayout, type LayoutInstance } from '@content/stageLayout'

/**
 * Section SOL — le stock existait, il dormait.
 *
 * Le jeu déclare 6 tuiles de sol par stage (60 au total) et les charge toutes,
 * mais `ground.ts` n'en rendait qu'UNE : la tuile de base du stage courant.
 * **50 étaient chargées puis jamais affichées.** Et la palette les excluait
 * explicitement (`if (a.role === 'ground') continue`) : impossible d'en poser.
 *
 * Ces tests verrouillent les deux acquis : les tuiles sont posables PARTOUT
 * (cross-stage), et une plaque survit au trajet éditeur → jeu.
 */

function withInstances(insts: LayoutInstance[]): StageLayout {
  const l = emptyLayout('fondations')
  l.instances = insts
  return l
}

function inst(partial: Partial<LayoutInstance> & { prefab: string }): LayoutInstance {
  return { id: 'i', x: 0, y: 0, flipX: false, variant: 0, rotation: 0, locked: false, ...partial }
}

describe('Palette « Sol » — les 60 tuiles, sur les 10 stages', () => {
  it('expose une section sol NON VIDE sur chaque stage', () => {
    // Une section vide est masquée par la palette → « disponible partout » se
    // vérifie stage par stage, pas sur le seul stage courant.
    for (const { id, label } of STAGE_LIST) {
      const cat = getStageCatalog(id)
      const sols = cat.entries.filter((e) => e.category === 'sol')
      expect(sols.length, `aucun sol sur ${label}`).toBeGreaterThan(0)
    }
  })

  it('expose les tuiles de TOUS les stages, pas seulement celles du stage courant', () => {
    // C'est la demande : « des textures de sol issues d'un autre stage ».
    const cat = getStageCatalog('terrain_vierge')
    const ids = new Set(cat.entries.filter((e) => e.category === 'sol').map((e) => e.id))
    const total = STAGE_LIST.reduce((n, s) => n + (STAGE_RENDER[s.id]?.ground.length ?? 0), 0)
    expect(total).toBe(60)
    expect(ids.size).toBe(60)
    // Un sol du stage 05 doit être posable depuis le stage 01.
    expect(ids.has('obj_ground_stage05_0')).toBe(true)
  })

  it('une entrée de sol est une PLAQUE répétée et non bloquante', () => {
    const cat = getStageCatalog('terrain_vierge')
    const sol = cat.entries.find((e) => e.id === 'obj_ground_stage05_0')
    const el = sol?.elements?.[0]
    expect(el?.tile).toEqual({ w: 256, h: 256 })
    // Un sol qui bloquerait le joueur changerait la sim : il ne doit RIEN bloquer.
    expect(sol?.kind).toBe('decor')
  })

  it('les libellés distinguent le stage d’origine', () => {
    // 60 entrées nommées « Sol » seraient indiscernables dans la palette.
    const cat = getStageCatalog('terrain_vierge')
    const labels = cat.entries.filter((e) => e.category === 'sol').map((e) => e.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels.some((l) => l.includes('05 · Gros œuvre'))).toBe(true)
  })
})

describe('Plaque de sol — survie du trajet éditeur → jeu', () => {
  it('composedToSiteLayout transporte `tile` jusqu’au cluster rendu', () => {
    const layout = withInstances([
      inst({
        prefab: 'x',
        elements: [{ assetKey: 'ground_stage05_0', dx: 0, dy: 0, scale: 1, collide: 'none', layer: 'ground', tile: { w: 512, h: 384 } }]
      })
    ])
    const site = composedToSiteLayout(layout)
    expect(site.clusters[0]?.elements?.[0]?.tile).toEqual({ w: 512, h: 384 })
    expect(site.clusters[0]?.elements?.[0]?.layer).toBe('ground')
  })

  it('une plaque n’ajoute AUCUN obstacle (la sim ne doit pas bouger)', () => {
    const layout = withInstances([
      inst({
        prefab: 'x',
        elements: [{ assetKey: 'ground_stage05_0', dx: 0, dy: 0, scale: 1, collide: 'none', layer: 'ground', tile: { w: 512, h: 512 } }]
      })
    ])
    expect(composedToSiteLayout(layout).obstacles).toEqual([])
  })

  it('parseLayout PRÉSERVE `tile` (sinon la plaque redevient une image étirée)', () => {
    const raw = JSON.stringify({
      version: 1, stage: 'fondations', worldSize: { width: 10240, height: 7680 },
      instances: [{
        id: 'a', prefab: 'x', x: 0, y: 0, flipX: false, variant: 0, rotation: 0, locked: false,
        elements: [{ assetKey: 'ground_stage05_0', dx: 0, dy: 0, scale: 1, collide: 'none', layer: 'ground', tile: { w: 256, h: 256 } }]
      }]
    })
    const res = parseLayout(raw, 'fondations')
    expect(res.ok).toBe(true)
    if (res.layout === undefined) { throw new Error('parseLayout n’a rien rendu') }
    expect(res.layout.instances[0]?.elements?.[0]?.tile).toEqual({ w: 256, h: 256 })
  })

  it('parseLayout PRÉSERVE `groundKey` (le sol de fond de la compo)', () => {
    const raw = JSON.stringify({
      version: 1, stage: 'terrain_vierge', worldSize: { width: 10240, height: 7680 },
      groundKey: 'ground_stage05_2', instances: []
    })
    const res = parseLayout(raw, 'terrain_vierge')
    expect(res.ok).toBe(true)
    if (res.layout === undefined) { throw new Error('parseLayout n’a rien rendu') }
    expect(res.layout.groundKey).toBe('ground_stage05_2')
  })
})

describe('groundTilesForLayout — le préchargement des sols étrangers', () => {
  it('réclame la tuile du fond global, même venue d’un autre stage', () => {
    // Le preload d'un stage ne charge que SES 6 tuiles : sans ça, le sol du 05
    // sur le 01 retomberait en silence sur le sol du 01.
    const l = emptyLayout('terrain_vierge')
    l.groundKey = 'ground_stage05_2'
    const tiles = groundTilesForLayout(l)
    expect(tiles.map((t) => t.key)).toEqual(['ground_stage05_2'])
    expect(tiles[0]?.file).toBe('stage05/ground/tile_2.png')
  })

  it('réclame les tuiles des plaques posées', () => {
    const l = withInstances([
      inst({ prefab: 'x', elements: [{ assetKey: 'ground_stage08_1', dx: 0, dy: 0, scale: 1, tile: { w: 256, h: 256 } }] })
    ])
    expect(groundTilesForLayout(l).map((t) => t.key)).toEqual(['ground_stage08_1'])
  })

  it('ignore les éléments SANS plaque (un prop n’est pas un sol)', () => {
    const l = withInstances([
      inst({ prefab: 'x', elements: [{ assetKey: 'un_prop', dx: 0, dy: 0, scale: 1 }] })
    ])
    expect(groundTilesForLayout(l)).toEqual([])
  })

  it('rend un tableau vide sans compo (jeu génératif)', () => {
    expect(groundTilesForLayout(null)).toEqual([])
  })
})
