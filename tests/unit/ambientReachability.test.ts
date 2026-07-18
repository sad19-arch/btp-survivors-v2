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
 * Était 21 sur 50. Les 19 feuilles OUVRIER le sont devenues parce que les jobs
 * de marche piochent désormais dans un POOL par rôle (`buildWalkerPools`) au
 * lieu de l'unique feuille que `_resolveKey` retenait par indice de nom. Aucun
 * job n'a été ajouté pour ça — c'est la distribution des jobs existants qui a
 * changé, pas leur nombre (cf. le test « le nombre de jobs ne bouge pas »).
 *
 * Restent les 2 feuilles `kind:'trade'` du stage 01, et c'est un CHOIX D'AUTEUR,
 * pas une lacune de code : `terrain_vierge` a une compo committée, qui est la
 * vérité totale du stage (pas d'auto-placement par-dessus le niveau de
 * l'utilisateur). Ces 2 feuilles sont posables depuis la palette de l'éditeur
 * (section « PNJ métier (fixe) », cf. `editorNpcPalette.test.ts`) : elles
 * sortiront de cette liste le jour où il les posera. Ne PAS « corriger » ça en
 * rallumant un auto-placement sur un stage composé.
 */
const EXPECTED_ORPHANS: Record<string, readonly string[]> = {
  terrain_vierge: ['npc_stage01_geometre_trade', 'npc_stage01_chef_trade'],
  terrassement: [],
  fondations: [],
  reseaux_enterres: [],
  gros_oeuvre: [],
  echafaudages: [],
  charpente_toiture: [],
  second_oeuvre: [],
  finitions: [],
  livraison_audit: []
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
  sw.reset(SEED, W, H, stageId, ambient, {
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

  /**
   * Nombre de jobs planifiés par stage, MESURÉ avant l'élargissement des rôles.
   *
   * C'est l'argument « le cull ne mange rien » rendu EXÉCUTABLE. `_reselect` ne
   * garde que les `WORKER_COUNT` (10) jobs les plus proches du joueur : rendre
   * des feuilles atteignables en AJOUTANT des jobs les mettrait en concurrence
   * pour ces 10 places, et l'art resterait invisible. Le pool ne touche qu'à la
   * TEXTURE de jobs qui existaient déjà — donc ces nombres ne doivent pas bouger.
   *
   * Si ce test rougit, l'élargissement a créé des jobs : la conclusion sur le
   * cull tombe et il faut la refaire, pas mettre ces nombres à jour par réflexe.
   *
   * EXCEPTION assumée : `npc_stage08` (plaquiste) et `npc_stage10` (inspecteur)
   * sont des feuilles *_work de la famille métier dont le flag `kind:'trade'`
   * avait été oublié — elles étaient donc servies comme ouvrières de marche au
   * lieu de postes métier fixes, comme leurs 8 homologues. Flag ajouté + échelle
   * réalignée sur la famille (0.78, jugement DA validé à l'œil, cf.
   * autoTradeNpcs.test.ts) : elles sortent du pool de marche et reçoivent un poste
   * auto-placé, +1 job fixe chacune → second_oeuvre 33→34, livraison_audit 34→35.
   * Ce n'est PAS le pool qui crée des jobs, c'est une réaffectation marcheur→métier.
   */
  const JOBS_BEFORE: Record<string, number> = {
    terrain_vierge: 1, terrassement: 36, fondations: 33, reseaux_enterres: 34,
    gros_oeuvre: 34, echafaudages: 34, charpente_toiture: 34, second_oeuvre: 34,
    finitions: 34, livraison_audit: 35
  }

  for (const [stageId, expected] of Object.entries(JOBS_BEFORE)) {
    it(`${stageId} : le nombre de jobs ne bouge pas (le pool ne crée aucun job)`, async () => {
      const { jobCount } = await reachableKeys(stageId)
      expect(jobCount).toBe(expected)
    })
  }

  it('le stage 01 (compo de l’éditeur) ne rend QUE les PNJ posés dans la compo', async () => {
    // Garde de non-régression du contrat « une compo sauvée est la vérité
    // totale » : pas d'auto-peuplement par-dessus le niveau de l'utilisateur.
    const { jobCount } = await reachableKeys('terrain_vierge')
    const { jobCount: genCount } = await reachableKeys('terrassement')
    expect(jobCount).toBeLessThan(genCount)
  })
})
