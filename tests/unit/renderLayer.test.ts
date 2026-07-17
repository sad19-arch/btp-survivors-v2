import { describe, it, expect } from 'vitest'
import { composedToSiteLayout } from '@core/siteLayout'
import { CLUSTERS } from '@content/clusters'
import { parseLayout } from '@/editor/StageLayoutSchema'
import { emptyLayout, type StageLayout, type LayoutInstance } from '@content/stageLayout'

/**
 * `RenderLayer` — la couche d'affichage d'un élément de décor.
 *
 * Le rendu déduisait la profondeur d'un MATCH DE SOUS-CHAÎNE sur la clé d'asset
 * (`road_*` / `decal_*`). `piste_strip` est un décal qui ne commence par aucun des
 * deux : il s'affichait à hauteur de prop, en bande de terre flottant au-dessus du
 * sol. Le kit de routes à venir (`route_*`) aurait hérité du même piège.
 *
 * Ces tests verrouillent le CHEMIN DE LA DONNÉE, pas le rendu : c'est là que la
 * couche se perd en silence (exactement comme `destructible` l'a été).
 */

function withInstances(insts: LayoutInstance[]): StageLayout {
  const l = emptyLayout('fondations')
  l.instances = insts
  return l
}

function inst(partial: Partial<LayoutInstance> & { prefab: string }): LayoutInstance {
  return { id: 'i', x: 0, y: 0, flipX: false, variant: 0, rotation: 0, locked: false, ...partial }
}

describe('RenderLayer — le contenu déclare sa couche', () => {
  it('les bandes plates (route / piste) sont déclarées « decal »', () => {
    // Sans ça, `piste_strip` retombe sur la déduction par préfixe → hauteur de prop.
    const route = CLUSTERS.cluster_route?.elements.find((e) => e.assetKey === 'road_strip')
    expect(route?.layer).toBe('decal')

    const piste = CLUSTERS.scene_mixer_waiting?.elements.find((e) => e.assetKey === 'piste_strip')
    expect(piste?.layer).toBe('decal')
  })

  it('aucun asset plat connu ne compte encore sur son préfixe', () => {
    // Filet pour l'avenir : tout élément dont la clé désigne une bande au sol doit
    // porter `layer`, quel que soit son préfixe.
    const FLAT = /^(road_|piste_|route_)/
    for (const [defId, def] of Object.entries(CLUSTERS)) {
      for (const el of def.elements) {
        if (FLAT.test(el.assetKey)) {
          expect(el.layer, `${defId} → ${el.assetKey} doit déclarer sa couche`).toBe('decal')
        }
      }
    }
  })
})

describe('RenderLayer — la couche survit au trajet donnée → jeu', () => {
  it('composedToSiteLayout transporte `layer` jusqu’au cluster rendu', () => {
    const layout = withInstances([
      inst({
        prefab: 'x',
        elements: [{ assetKey: 'route_asphalte_droite', dx: 0, dy: 0, scale: 1, collide: 'none', layer: 'decal' }]
      })
    ])
    const site = composedToSiteLayout(layout)
    expect(site.clusters[0]?.elements?.[0]?.layer).toBe('decal')
  })

  it('transporte `layer` AUSSI sur un élément bloquant (les deux branches)', () => {
    // `embeddedToClusterElement` a deux sorties (collidable / non) : la couche ne
    // doit pas se perdre dans l'une des deux.
    const layout = withInstances([
      inst({
        prefab: 'x',
        elements: [{ assetKey: 'un_batiment', dx: 0, dy: 0, scale: 1, collide: 'both', layer: 'struct' }]
      })
    ])
    const site = composedToSiteLayout(layout)
    expect(site.clusters[0]?.elements?.[0]?.layer).toBe('struct')
  })

  it('un élément sans `layer` reste sans `layer` (le rendu déduira)', () => {
    const layout = withInstances([
      inst({ prefab: 'x', elements: [{ assetKey: 'vieux_truc', dx: 0, dy: 0, scale: 1, collide: 'none' }] })
    ])
    const site = composedToSiteLayout(layout)
    expect(site.clusters[0]?.elements?.[0]?.layer).toBeUndefined()
  })

  it('parseLayout PRÉSERVE `layer` (sinon un aller-retour sauvegarde/chargement le perd)', () => {
    // C'est la régression exacte déjà vécue avec `destructible` : le layout joueur
    // est relu au boot via parseLayout, et tout champ non préservé disparaît sans bruit.
    const raw = JSON.stringify({
      version: 1,
      stage: 'fondations',
      worldSize: { width: 10240, height: 7680 },
      instances: [
        {
          id: 'a', prefab: 'x', x: 0, y: 0, flipX: false, variant: 0, rotation: 0, locked: false,
          elements: [{ assetKey: 'route_asphalte_droite', dx: 0, dy: 0, scale: 1, collide: 'none', layer: 'decal' }]
        }
      ]
    })
    const res = parseLayout(raw, 'fondations')
    expect(res.ok).toBe(true)
    // ParseResult n est pas une union discriminee : on restreint sur layout.
    if (res.layout === undefined) { throw new Error("parseLayout n a rien rendu") }
    expect(res.layout.instances[0]?.elements?.[0]?.layer).toBe('decal')
  })

  it('ignore une couche inconnue plutôt que de la propager', () => {
    const raw = JSON.stringify({
      version: 1,
      stage: 'fondations',
      worldSize: { width: 10240, height: 7680 },
      instances: [
        {
          id: 'a', prefab: 'x', x: 0, y: 0, flipX: false, variant: 0, rotation: 0, locked: false,
          elements: [{ assetKey: 'truc', dx: 0, dy: 0, scale: 1, collide: 'none', layer: 'nimporte_quoi' }]
        }
      ]
    })
    const res = parseLayout(raw, 'fondations')
    expect(res.ok).toBe(true)
    // ParseResult n est pas une union discriminee : on restreint sur layout.
    if (res.layout === undefined) { throw new Error("parseLayout n a rien rendu") }
    expect(res.layout.instances[0]?.elements?.[0]?.layer).toBeUndefined()
  })
})
