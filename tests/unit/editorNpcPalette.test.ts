/**
 * CHAÎNE COMPLÈTE « je pose un métier dans l'éditeur → il est en jeu ».
 *
 * Poser un PNJ traverse 4 couches, et chacune a déjà perdu des données en
 * silence par le passé :
 *   palette (PrefabCatalog) → EditorState.addNpc → sérialisation/parseLayout
 *   → planNpcJobs (rendu).
 * Un test par couche ne prouve rien sur la CHAÎNE : c'est le maillon d'après qui
 * laisse tomber le champ. On la parcourt donc d'un bout à l'autre.
 *
 * ⚠️ `parseLayout` a déjà mangé en silence `destructible`, `layer`, `tile`,
 * `paths` et `keepSitePlan`. La sauvegarde/rechargement est ici testée pour de
 * vrai (aller-retour JSON), pas supposée.
 */
import { describe, it, expect, vi } from 'vitest'
import { getStageCatalog } from '@/editor/PrefabCatalog'
import { parseLayout, serializeLayout } from '@/editor/StageLayoutSchema'
import { emptyLayout, type StageLayout } from '@content/stageLayout'
import { planNpcJobs } from '@render/workerBehavior'
import { STAGE_RENDER } from '@render/stages'

vi.mock('phaser', () => ({
  default: { Math: { Clamp: (v: number, a: number, b: number) => Math.min(b, Math.max(a, v)) } }
}))

const W = 10240
const H = 7680

/** Sonde : `jobs` est privé — on lit ce que le VRAI `reset()` a planifié. */
interface JobProbe { jobs: Array<{ textureKey: string; role: string; scale?: number }> }

/** Contexte 2D minimal exigé par Phaser à l'import (aucun pixel n'est lu ici). */
function stubCanvas2d(): void {
  const ctx = new Proxy({}, {
    get: (_t, p): unknown => {
      if (p === 'getImageData') { return (): unknown => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }) }
      if (p === 'canvas') { return { width: 1, height: 1 } }
      return (): undefined => undefined
    },
    set: (): boolean => true
  }) as CanvasRenderingContext2D
  HTMLCanvasElement.prototype.getContext =
    ((): CanvasRenderingContext2D => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext
}

/** Les 2 feuilles métier du stage 01 que l'utilisateur n'a pas (encore) posées. */
const STAGE01_UNPLACED = ['npc_stage01_geometre_trade', 'npc_stage01_chef_trade']

describe('PNJ métier posé dans l’éditeur — chaîne palette → jeu', () => {
  it('les feuilles métier non posées du stage 01 SONT dans la palette (donc posables)', () => {
    // C'est ce qui rend leur statut d'orphelines un CHOIX d'auteur et non un mur :
    // elles n'attendent qu'un clic. Cf. `ambientReachability.test.ts`.
    const cat = getStageCatalog('terrain_vierge')
    for (const key of STAGE01_UNPLACED) {
      const entry = cat.entries.find((e) => e.npcSkin === key)
      expect(entry, `${key} absent de la palette`).toBeDefined()
      expect(entry?.category).toBe('npc_metier')
    }
  })

  it('un métier posé survit à l’aller-retour sauvegarde/rechargement', () => {
    const layout = emptyLayout('terrain_vierge')
    layout.npcs = [{ id: 'npc_1', skin: 'npc_stage01_chef_trade', kind: 'trade', x: 300, y: -150 }]

    const reloaded = parseLayout(serializeLayout(layout), 'terrain_vierge')
    expect(reloaded.ok).toBe(true)
    expect(reloaded.layout?.npcs).toEqual([
      { id: 'npc_1', skin: 'npc_stage01_chef_trade', kind: 'trade', x: 300, y: -150 }
    ])
  })

  it('un métier posé devient un job de rendu FIXE à la bonne position monde', () => {
    const layout: StageLayout = {
      ...emptyLayout('terrain_vierge'),
      npcs: [{ id: 'npc_1', skin: 'npc_stage01_chef_trade', kind: 'trade', x: 300, y: -150 }]
    }
    const jobs = planNpcJobs(layout, W, H)
    expect(jobs).toEqual([
      { role: 'npc_trade', skin: 'npc_stage01_chef_trade', x: W / 2 + 300, y: H / 2 - 150 }
    ])
  })

  it('un ouvrier posé devient un job MOBILE (rôle distinct du métier)', () => {
    const layout: StageLayout = {
      ...emptyLayout('terrain_vierge'),
      npcs: [{ id: 'npc_1', skin: 'npc_ouvrier_a', kind: 'worker', x: 0, y: 0 }]
    }
    const jobs = planNpcJobs(layout, W, H)
    expect(jobs[0]?.role).toBe('npc_worker')
    // Alias : une compo d'avant le renommage pose encore `npc_ouvrier_a`.
    expect(jobs[0]?.skin).toBe('npc_ouvrier_zinedine')
  })

  it('un métier posé s’affiche à son échelle CALIBRÉE, pas au WORKER_SCALE uniforme', async () => {
    // Le stage 01 est la vraie compo de l'utilisateur : il y a posé `npc_stage01`
    // (le géomètre), feuille calibrée à 0.78. Sans la table d'échelles, le job
    // retombait sur WORKER_SCALE (0.62) → 20 % trop petit, et l'éditeur mentait
    // sur le rendu. On lit le job planifié par le VRAI reset().
    stubCanvas2d()
    const { SiteWorkers } = await import('@render/scenes/siteWorkers')
    const ambient = STAGE_RENDER.terrain_vierge?.ambient ?? []
    const geometre = ambient.find((a) => a.key === 'npc_stage01')
    expect(geometre?.scale, 'le géomètre du stage 01 doit rester calibré').toBe(0.78)

    const loaded = new Set(ambient.map((a) => a.key))
    const scene = {
      textures: { exists: (k: string): boolean => loaded.has(k) },
      add: { sprite: (): unknown => ({}) }
    } as unknown as Phaser.Scene

    const sw = new SiteWorkers(scene)
    sw.reset(42, W, H, 'terrain_vierge', ambient, {
      entries: ambient.filter((a) => a.kind === 'trade').map((a) => ({ key: a.key, scale: a.scale })),
      baseAngleDeg: 55
    })
    const job = (sw as unknown as JobProbe).jobs.find((j) => j.textureKey === 'npc_stage01')
    expect(job, 'le géomètre posé dans la compo doit produire un job').toBeDefined()
    expect(job?.scale).toBe(0.78)
  })
})
