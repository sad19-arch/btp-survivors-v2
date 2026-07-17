/**
 * ATTEIGNABILITÉ des feuilles PNJ d'ambiance — garde anti-orphelins.
 *
 * Pourquoi ce test existe : une feuille peut être déclarée dans `stages.ts`,
 * packée dans `public/`, verte à `assets:qa`… et n'être JAMAIS affichée, parce
 * qu'aucun chemin de rendu ne la demande. C'est arrivé deux fois (engins
 * orphelins, PNJ métier). Le seul moyen de le voir est de CONSTRUIRE les mondes
 * et de compter les instances réelles — c'est ce que fait ce test, sur le VRAI
 * code de prod (`SiteWorkers.reset`), pas sur une réimplémentation.
 *
 * Rappel d'architecture : depuis la normalisation « un seul système de PNJ par
 * plan de chantier », les feuilles `stage.ambient` sont rendues EXCLUSIVEMENT
 * par SiteWorkers. L'ancien second système (errance Lissajous dans GameScene)
 * a été supprimé ; ne pas le réintroduire (double-population incohérente).
 *
 * Ce test est une PHOTO de la réalité, pas un idéal : les orphelines listées
 * ci-dessous sont RÉELLEMENT jamais affichées aujourd'hui. Si ce test rougit,
 * c'est une information — une feuille est devenue (ou a cessé d'être)
 * orpheline. Mettre la liste à jour EN CONNAISSANCE DE CAUSE, jamais par
 * réflexe.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('phaser', () => ({
  default: { Math: { Clamp: (v: number, a: number, b: number) => Math.min(b, Math.max(a, v)) } }
}))

/** Sonde : `jobs` est privé — on lit la structure planifiée par le vrai reset(). */
interface JobProbe { jobs: Array<{ textureKey: string; role: string }> }

/**
 * Contexte 2D minimal : happy-dom n'en fournit pas, et Phaser en exige un à
 * l'import (détection de features canvas). Aucun pixel n'est lu ici — on ne
 * teste que la PLANIFICATION des jobs, qui n'appelle aucune API de dessin.
 */
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

const W = 10240
const H = 7680
const SEED = 42

/**
 * Feuilles `ambient` déclarées mais qu'AUCUN chemin de rendu ne demande.
 *
 * - `terrain_vierge` a une compo committée (le niveau de l'éditeur) : elle est
 *   la vérité totale du stage, donc `reset()` ne fait PAS d'auto-placement des
 *   métiers. Seuls les PNJ POSÉS dans la compo sont rendus → les 2 feuilles
 *   `kind:'trade'` non posées sont orphelines par CONSTRUCTION.
 * - Ailleurs : `_resolveKey` ne retient qu'UNE feuille par rôle (porteur /
 *   signaleur) via indice de nom ; les autres feuilles ouvrier ne sont
 *   demandées par personne.
 */
const EXPECTED_ORPHANS: Record<string, readonly string[]> = {
  terrain_vierge: ['npc_stage01_geometre_trade', 'npc_stage01_chef_trade'],
  terrassement: ['npc_stage02_macon'],
  fondations: ['npc_stage03_cimentier'],
  reseaux_enterres: ['npc_stage04_plombier', 'npc_stage04_poseur_cable', 'npc_stage04_gainier'],
  gros_oeuvre: ['npc_stage05_parpaingueur', 'npc_stage05_grutier'],
  echafaudages: ['npc_stage06_monteur_tube', 'npc_stage06_porteur_echelle'],
  charpente_toiture: ['npc_stage07_charpentier', 'npc_stage07_poseur_liteau'],
  second_oeuvre: ['npc_stage08', 'npc_stage08_plombier', 'npc_stage08_elec'],
  finitions: ['npc_stage09_carreleur', 'npc_stage09_poseur_sol'],
  livraison_audit: ['npc_stage10', 'npc_stage10_agent_reception', 'npc_stage10_technicien']
}

/** Construit le monde d'un stage et renvoie les clés ambient réellement demandées. */
async function reachableKeys(stageId: string): Promise<{ reachable: Set<string>; declared: string[]; jobCount: number }> {
  stubCanvas2d()

  const { SiteWorkers } = await import('@render/scenes/siteWorkers')
  const { STAGE_RENDER } = await import('@render/stages')

  const ambient = STAGE_RENDER[stageId]?.ambient ?? []
  const declared = ambient.map((a) => a.key)
  const loaded = new Set(declared)
  const scene = {
    textures: { exists: (k: string): boolean => loaded.has(k) },
    add: { sprite: (): unknown => ({}) }
  } as unknown as Phaser.Scene

  const sw = new SiteWorkers(scene)
  sw.reset(SEED, W, H, stageId, declared, {
    entries: ambient.filter((a) => a.kind === 'trade').map((a) => ({ key: a.key, scale: a.scale })),
    baseAngleDeg: 55
  })
  const jobs = (sw as unknown as JobProbe).jobs
  return {
    reachable: new Set(jobs.map((j) => j.textureKey).filter((k) => loaded.has(k))),
    declared,
    jobCount: jobs.length
  }
}

describe('PNJ d’ambiance — atteignabilité réelle (mondes construits)', () => {
  for (const stageId of Object.keys(EXPECTED_ORPHANS)) {
    it(`${stageId} : les feuilles orphelines sont exactement celles documentées`, async () => {
      const { reachable, declared } = await reachableKeys(stageId)
      const orphans = declared.filter((k) => !reachable.has(k))
      expect(orphans.sort()).toEqual([...(EXPECTED_ORPHANS[stageId] ?? [])].sort())
    })
  }

  it('INVARIANT : tout job PNJ pointe une feuille chargée (jamais de texture fantôme)', async () => {
    // Un job dont la texture n'existe pas retombe sur un cercle vert (repli
    // Graphics) : pas de crash, mais un PNJ visiblement faux. Aucun ne doit
    // exister sur les 10 stages.
    for (const stageId of Object.keys(EXPECTED_ORPHANS)) {
      const { reachable, declared } = await reachableKeys(stageId)
      for (const key of reachable) {
        expect(declared).toContain(key)
      }
    }
  })

  it('le stage 01 (compo de l’éditeur) ne rend QUE les PNJ posés dans la compo', async () => {
    // Garde de non-régression du contrat « une compo sauvée est la vérité
    // totale » : pas d'auto-peuplement par-dessus le niveau de l'utilisateur.
    const { jobCount } = await reachableKeys('terrain_vierge')
    const { jobCount: genCount } = await reachableKeys('terrassement')
    expect(jobCount).toBeLessThan(genCount)
  })
})
