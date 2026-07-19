/**
 * `npm run content:reachability` — garde-fou générique « déclaré mais jamais atteint ».
 *
 * POURQUOI CET OUTIL. 8 des pires gaspillages du projet partagent une cause : « fini »
 * voulait dire « la QA statique est verte, le fichier existe », jamais « j'ai construit
 * l'état réel du jeu et compté ce qui apparaît ». Des PNJ métier packés+QA-OK jamais
 * rendus (registre vide + `slice(0,0)`), des engins animés câblés dans des clusters que
 * plus aucun stage ne place, 50 des 60 tuiles de sol chargées et jamais peintes. Le SEUL
 * moyen de le voir est de CONSTRUIRE les mondes et de compter les instances réelles.
 * Cet outil généralise cette preuve à tout contenu déclaré.
 *
 * Il CONSTRUIT l'état de prod (pas une lecture statique de données) et signale, PAR
 * catégorie, ce qui est déclaré mais atteint par aucun chemin réel :
 *   1. PNJ ambient / métier — via le VRAI `SiteWorkers.reset()` sur les 10 mondes ;
 *   2. Engins animés — via `buildSiteLayout` sur les 10 mondes (`CLUSTERS` post-swap) ;
 *   3. Tuiles de sol — via le chemin de rendu réel (`createGround` peint 1 base/stage) ;
 *   4. Cues audio / SFX d'armes — call-sites dans le code de prod (pas les tests).
 *
 * LECTEUR/AUDITEUR, JAMAIS CORRECTEUR : il ne modifie aucun fichier sous `src/`. Le cas
 * des tuiles de sol (50/60) est un incident CONNU et NON corrigé — l'outil le SIGNALE.
 *
 * Sortie calquée sur `assets:qa`/`audio:qa` : rapport lisible + exit non-zéro si une
 * catégorie BLOQUANTE a des orphelins inattendus (c'est un gate, pas qu'un rapport).
 *
 * Usage : npm run content:reachability
 */
import { register } from 'node:module'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { GlobalWindow } from 'happy-dom'
import {
  checkLiveEngines,
  checkGroundTiles,
  checkAudioCues,
  checkWeaponSfx,
  buildAmbientReport,
  unexpectedOrphans,
  type CategoryReport,
  type LiveEngineProbe,
  type StageGroundProbe
} from './reachabilityChecks'

// ── Constantes de construction de monde (mêmes valeurs que le jeu / le test PNJ) ──
const WORLD_W = 10240
const WORLD_H = 7680
const SEED = 42
const AMBIENT_ANGLE_DEG = 55

/**
 * Orphelins PNJ ATTENDUS (choix d'auteur documenté, pas un bug) — alignés sur
 * `tests/unit/ambientReachability.test.ts`. Le stage 01 a une compo committée qui
 * fait loi (pas d'auto-placement par-dessus le niveau du joueur) ; ses 2 feuilles
 * métier sont posables depuis la palette de l'éditeur. Elles sortiront de cette liste
 * le jour où il les posera. NE PAS « corriger » en rallumant un auto-placement.
 */
const EXPECTED_AMBIENT_ORPHANS: readonly string[] = [
  'npc_stage01_geometre_trade',
  'npc_stage01_chef_trade'
]

/** Fichier de DÉCLARATION des cues audio (exclu de la recherche de call-site). */
const AUDIO_DECLARATION_SUFFIX = 'manifest.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Installation d'un DOM minimal + stub Phaser (pour exécuter le vrai SiteWorkers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enregistre le hook qui redirige `phaser` → stub, PUIS installe les globals DOM de
 * happy-dom. À appeler AVANT tout `import()` de `@render/*`. Le stub couvre la seule
 * surface Phaser utilisée par `SiteWorkers.reset` (`Phaser.Math.Clamp`, cf. phaserStub).
 */
function installHeadlessEnv(): void {
  // Base = ce fichier, pour résoudre `./phaserLoader.mjs` quel que soit le cwd.
  register('./phaserLoader.mjs', import.meta.url)
  const win = new GlobalWindow()
  const g = globalThis as unknown as Record<string, unknown>
  const winRec = win as unknown as Record<string, unknown>
  const set = (key: string, val: unknown): void => {
    try {
      g[key] = val
    } catch {
      Object.defineProperty(g, key, { value: val, configurable: true, writable: true })
    }
  }
  set('window', win)
  set('self', win)
  // Bulk-copie chaque global DOM que la fenêtre expose et qui manque à globalThis
  // (Element, HTMLCanvasElement, navigator, document…) — comme le fait
  // @happy-dom/global-registrator, pour que l'import de siteWorkers trouve un DOM.
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key in g) {
      continue
    }
    set(key, winRec[key])
  }
  // Contexte 2D bidon : aucun pixel n'est lu, mais l'import Phaser (neutralisé par le
  // stub) et happy-dom exigent un `getContext` défini. Défensif, sans effet de dessin.
  const HCE = winRec['HTMLCanvasElement'] as { prototype: { getContext: unknown } } | undefined
  if (HCE !== undefined) {
    const ctx = new Proxy({}, {
      get: (_t, p): unknown => {
        if (p === 'getImageData') {
          return (): unknown => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) })
        }
        if (p === 'canvas') {
          return { width: 1, height: 1 }
        }
        return (): undefined => undefined
      },
      set: (): boolean => true
    })
    HCE.prototype.getContext = (): unknown => ctx
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Catégorie 1 — PNJ ambient / métier (vrai SiteWorkers sur les 10 mondes)
// ─────────────────────────────────────────────────────────────────────────────

/** Sonde du champ privé `jobs` de SiteWorkers (planifié par le vrai `reset()`). */
interface JobProbe {
  jobs: Array<{ textureKey: string }>
}

/**
 * Construit chaque monde via le VRAI `SiteWorkers.reset()` et compte les feuilles
 * `ambient` réellement demandées par un job. Même méthode que le test de prod
 * (`ambientReachability.test.ts`) — on n'audite pas une réimplémentation.
 */
async function checkAmbientNpcs(): Promise<CategoryReport> {
  const { STAGE_RENDER } = await import('@render/stages')
  const { SiteWorkers } = await import('@render/scenes/siteWorkers')

  const declaredAll = new Set<string>()
  const orphansAll = new Set<string>()

  for (const stageId of Object.keys(STAGE_RENDER)) {
    const ambient = STAGE_RENDER[stageId]?.ambient ?? []
    const declared = ambient.map((a) => a.key)
    for (const k of declared) {
      declaredAll.add(k)
    }
    const loaded = new Set(declared)
    const scene = {
      textures: { exists: (k: string): boolean => loaded.has(k) },
      add: { sprite: (): unknown => ({}) }
    } as unknown as import('phaser').Scene

    const sw = new SiteWorkers(scene)
    sw.reset(SEED, WORLD_W, WORLD_H, stageId, ambient, {
      entries: ambient.filter((a) => a.kind === 'trade').map((a) => ({ key: a.key, scale: a.scale })),
      baseAngleDeg: AMBIENT_ANGLE_DEG
    })
    const jobs = (sw as unknown as JobProbe).jobs
    const reachable = new Set(jobs.map((j) => j.textureKey).filter((k) => loaded.has(k)))
    for (const k of declared) {
      if (!reachable.has(k)) {
        orphansAll.add(k)
      }
    }
  }

  return buildAmbientReport(declaredAll.size, [...orphansAll], EXPECTED_AMBIENT_ORPHANS)
}

// ─────────────────────────────────────────────────────────────────────────────
// Catégorie 2 — Engins animés (buildSiteLayout sur les 10 mondes)
// ─────────────────────────────────────────────────────────────────────────────

async function checkEnginesCategory(): Promise<CategoryReport> {
  const { STAGE_RENDER } = await import('@render/stages')
  const { buildSiteLayout } = await import('@core/siteLayout')
  const { CLUSTERS, LIVE_ENGINE_KEYS, liveEngineFor } = await import('@content/clusters')

  // Union des assetKeys de TOUS les éléments de clusters bâtis sur les 10 stages.
  // Compo éditeur → `PlacedCluster.elements` porte les clés résolues ; stage génératif
  // → `CLUSTERS[defId].elements` (déjà passé par `withLiveEngine`, donc *_work swapé).
  const present = new Set<string>()
  for (const stageId of Object.keys(STAGE_RENDER)) {
    const layout = buildSiteLayout(SEED, WORLD_W, WORLD_H, stageId)
    for (const c of layout.clusters) {
      const els = c.elements ?? CLUSTERS[c.defId]?.elements ?? []
      for (const el of els) {
        present.add(el.assetKey)
      }
    }
  }

  const engines: LiveEngineProbe[] = LIVE_ENGINE_KEYS.map((staticKey) => {
    const live = liveEngineFor(staticKey)
    // `liveEngineFor(k)` est défini pour toute clé de `LIVE_ENGINE_KEYS` (mêmes clés).
    return { staticKey, workKey: live?.workKey ?? staticKey }
  })
  return checkLiveEngines(engines, present)
}

// ─────────────────────────────────────────────────────────────────────────────
// Catégorie 3 — Tuiles de sol (chemin de rendu réel)
// ─────────────────────────────────────────────────────────────────────────────

async function checkGroundCategory(): Promise<CategoryReport> {
  const { STAGE_RENDER } = await import('@render/stages')
  const { resolveComposedLayout } = await import('@content/runtimeLayouts')

  const stages: StageGroundProbe[] = []
  for (const [stageId, sr] of Object.entries(STAGE_RENDER)) {
    // Le rendu peut référencer, HORS base, la tuile de fond d'une compo (`groundKey`
    // override) et les plaques de sol posées (`elements[].tile`). On les compte comme
    // atteintes (miroir de `groundTilesForLayout`), pour ne PAS accuser une tuile
    // qu'une compo utilise réellement.
    const composed = resolveComposedLayout(stageId)
    const extra = new Set<string>()
    if (composed !== null) {
      if (composed.groundKey !== undefined) {
        extra.add(composed.groundKey)
      }
      for (const inst of composed.instances) {
        for (const el of inst.elements ?? []) {
          if (el.tile !== undefined) {
            extra.add(el.assetKey)
          }
        }
      }
    }
    stages.push({
      stageId,
      tileKeys: sr.ground.map((g) => g.key),
      baseTileIndex: sr.baseTileIndex ?? 0,
      extraReferenced: [...extra]
    })
  }
  return checkGroundTiles(stages)
}

// ─────────────────────────────────────────────────────────────────────────────
// Catégorie 4 — Cues audio + SFX d'armes (call-sites dans le code de prod)
// ─────────────────────────────────────────────────────────────────────────────

/** Liste récursive des fichiers .ts/.tsx sous un dossier. */
function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      out.push(...listTsFiles(p))
    } else if (/\.tsx?$/.test(e)) {
      out.push(p)
    }
  }
  return out
}

async function checkAudioCategories(): Promise<CategoryReport[]> {
  const { SFX, WEAPON_SFX_IDS } = await import('@/audio/manifest')
  const { WEAPONS } = await import('@content/weapons')

  // Code de PROD = tout `src/` (les tests ne comptent pas comme call-site).
  const sources = new Map<string, string>()
  for (const f of listTsFiles('src')) {
    sources.set(f, readFileSync(f, 'utf8'))
  }

  const cueReport = checkAudioCues(Object.keys(SFX), sources, AUDIO_DECLARATION_SUFFIX)
  const weaponReport = checkWeaponSfx(WEAPON_SFX_IDS, new Set(Object.keys(WEAPONS)))
  return [cueReport, weaponReport]
}

// ─────────────────────────────────────────────────────────────────────────────
// Rapport + exit code
// ─────────────────────────────────────────────────────────────────────────────

function printReport(reports: readonly CategoryReport[]): number {
  let hardFailures = 0
  console.log('[content:reachability] audit « déclaré mais jamais atteint » (mondes construits)\n')

  for (const r of reports) {
    const unexpected = unexpectedOrphans(r)
    const expectedHit = r.orphans.length - unexpected.length
    const tag = r.gate ? 'GATE ' : 'WARN '
    console.log(`=== ${r.category} ===`)
    console.log(`  ${tag}total ${r.declared} · atteignables ${r.reachable} · orphelins ${r.orphans.length}`)

    if (r.orphans.length === 0) {
      console.log('  OK — aucun orphelin.\n')
      continue
    }
    for (const o of r.orphans) {
      const documented = (r.expectedOrphans ?? []).includes(o)
      console.log(`    - ${o}${documented ? '  [orphelin ATTENDU, documenté]' : ''}`)
    }
    if (expectedHit > 0) {
      console.log(`  (${expectedHit} orphelin(s) attendu(s) et documenté(s) — n'échoue pas.)`)
    }
    if (unexpected.length > 0) {
      if (r.gate) {
        hardFailures += unexpected.length
        console.log(`  FAIL — ${unexpected.length} orphelin(s) INATTENDU(S) : déclaré(s), packé(s), jamais atteint(s).`)
      } else {
        console.log(`  WARN — ${unexpected.length} orphelin(s) sans call-site détecté (check heuristique, non bloquant).`)
      }
    }
    console.log('')
  }

  console.log('─'.repeat(72))
  if (hardFailures > 0) {
    console.log(`[content:reachability] ÉCHEC : ${hardFailures} orphelin(s) bloquant(s).`)
    console.log('Un contenu déclaré+packé mais jamais atteint = travail gaspillé et invisible.')
    return 1
  }
  const warnOnly = reports.some((r) => !r.gate && unexpectedOrphans(r).length > 0)
  if (warnOnly) {
    console.log('[content:reachability] OK (gates verts) — voir les WARN ci-dessus (à vérifier à la main).')
  } else {
    console.log('[content:reachability] OK — toutes les catégories bloquantes sont vertes.')
  }
  return 0
}

async function main(): Promise<void> {
  installHeadlessEnv()

  const reports: CategoryReport[] = []
  // PNJ + Engins + Sol : ordre déterministe. Audio en dernier (2 sous-rapports).
  reports.push(await checkAmbientNpcs())
  reports.push(await checkEnginesCategory())
  reports.push(await checkGroundCategory())
  reports.push(...(await checkAudioCategories()))

  process.exit(printReport(reports))
}

main().catch((e: unknown) => {
  console.error('[content:reachability] ERREUR FATALE :', e instanceof Error ? e.stack : e)
  process.exit(2)
})
