/**
 * Tests des fonctions PURES de `npm run content:reachability`.
 *
 * L'exigence NON NÉGOCIABLE du brief : ZÉRO faux positif. Un outil qui accuse une
 * clé RÉELLEMENT atteignable est cassé, pas un détecteur. On le prouve par MUTATION
 * DANS LES DEUX SENS sur chaque check :
 *   - retirer l'appelant d'une clé connue-atteignable → elle DOIT devenir orpheline ;
 *   - le restaurer → elle DOIT redevenir atteignable.
 *
 * Les cas « monde réel » (engins, tuiles de sol) tournent sur les VRAIES données de
 * prod, pas des maquettes : ils valident à la fois la logique et l'état actuel du repo.
 * Le check PNJ (vrai `SiteWorkers` + Phaser stub) est couvert par
 * `ambientReachability.test.ts` — l'outil réutilise EXACTEMENT sa méthode.
 */
import { describe, it, expect } from 'vitest'
import {
  checkLiveEngines,
  checkGroundTiles,
  checkAudioCues,
  checkWeaponSfx,
  hasStringLiteral,
  unexpectedOrphans,
  buildAmbientReport,
  type LiveEngineProbe,
  type StageGroundProbe
} from '../../tools/content/reachabilityChecks'
import { LIVE_ENGINE_KEYS, liveEngineFor, CLUSTERS } from '@content/clusters'
import { buildSiteLayout } from '@core/siteLayout'
import { STAGE_RENDER } from '@render/stages'
import { WEAPONS } from '@content/weapons'
import { WEAPON_SFX_IDS } from '@/audio/manifest'

const W = 10240
const H = 7680
const SEED = 42

/** Union des assetKeys de tous les clusters bâtis sur les 10 stages (comme l'outil). */
function presentAssetKeys(): Set<string> {
  const present = new Set<string>()
  for (const stageId of Object.keys(STAGE_RENDER)) {
    const layout = buildSiteLayout(SEED, W, H, stageId)
    for (const c of layout.clusters) {
      const els = c.elements ?? CLUSTERS[c.defId]?.elements ?? []
      for (const el of els) {
        present.add(el.assetKey)
      }
    }
  }
  return present
}

function engineProbes(): LiveEngineProbe[] {
  return LIVE_ENGINE_KEYS.map((staticKey) => ({
    staticKey,
    workKey: liveEngineFor(staticKey)?.workKey ?? staticKey
  }))
}

describe('engins animés — atteignabilité (données de prod)', () => {
  it('tous les engins vivants sont atteints aujourd’hui (0 orphelin)', () => {
    const r = checkLiveEngines(engineProbes(), presentAssetKeys())
    expect(r.orphans).toEqual([])
    expect(r.reachable).toBe(r.declared)
    expect(r.declared).toBeGreaterThan(0)
  })

  it('MUTATION : retirer une feuille *_work atteignable la rend orpheline, la restaurer la ré-atteint', () => {
    const engines = engineProbes()
    const present = presentAssetKeys()
    const known = engines[0]
    expect(known).toBeDefined()
    const workKey = (known as LiveEngineProbe).workKey
    expect(present.has(workKey)).toBe(true) // sanity : la clé témoin EST atteignable

    // Sens 1 : on retire l'unique appelant (la clé du monde construit) → orphelin.
    const mutated = new Set(present)
    mutated.delete(workKey)
    const red = checkLiveEngines(engines, mutated)
    expect(red.orphans).toContain(workKey)

    // Sens 2 : on la restaure → plus orpheline.
    const green = checkLiveEngines(engines, present)
    expect(green.orphans).not.toContain(workKey)
  })
})

describe('tuiles de sol — atteignabilité (données de prod)', () => {
  function groundProbes(): StageGroundProbe[] {
    return Object.entries(STAGE_RENDER).map(([stageId, sr]) => ({
      stageId,
      tileKeys: sr.ground.map((g) => g.key),
      baseTileIndex: sr.baseTileIndex ?? 0,
      extraReferenced: []
    }))
  }

  it('l’incident CONNU est détecté : 50 des 60 tuiles orphelines', () => {
    const r = checkGroundTiles(groundProbes())
    expect(r.declared).toBe(60)
    expect(r.reachable).toBe(10) // une base peinte par stage
    expect(r.orphans).toHaveLength(50)
  })

  it('MUTATION : référencer une tuile orpheline (compo groundKey) la rend atteignable', () => {
    const probes = groundProbes()
    const first = probes[0]
    expect(first).toBeDefined()
    const stage = first as StageGroundProbe
    // Une tuile NON-base de ce stage est orpheline aujourd'hui.
    const orphanTile = stage.tileKeys.find((_k, i) => i !== stage.baseTileIndex)
    expect(orphanTile).toBeDefined()

    const before = checkGroundTiles(probes)
    expect(before.orphans).toContain(orphanTile)

    // Sens inverse : une compo qui référence cette tuile (groundKey override / plaque)
    // la sort des orphelins — l'outil ne doit PAS accuser une tuile réellement utilisée.
    const patched = probes.map((p) =>
      p.stageId === stage.stageId ? { ...p, extraReferenced: [orphanTile as string] } : p
    )
    const after = checkGroundTiles(patched)
    expect(after.orphans).not.toContain(orphanTile)
    expect(after.reachable).toBe(before.reachable + 1)
  })
})

describe('SFX d’armes en fichier — atteignabilité (données de prod)', () => {
  it('tout WEAPON_SFX_ID correspond à une arme (0 orphelin aujourd’hui)', () => {
    const r = checkWeaponSfx(WEAPON_SFX_IDS, new Set(Object.keys(WEAPONS)))
    expect(r.orphans).toEqual([])
  })

  it('MUTATION : un id sans arme correspondante est orphelin ; l’ajouter le rend atteignable', () => {
    const ids = [...WEAPON_SFX_IDS, 'arme_fantome']
    const withoutGhost = new Set(Object.keys(WEAPONS))
    expect(checkWeaponSfx(ids, withoutGhost).orphans).toContain('arme_fantome')

    const withGhost = new Set([...Object.keys(WEAPONS), 'arme_fantome'])
    expect(checkWeaponSfx(ids, withGhost).orphans).not.toContain('arme_fantome')
  })
})

describe('cues audio nommés — call-site par littéral de chaîne (pur)', () => {
  const DECL = 'manifest.ts'

  it('MUTATION bidirectionnelle : un cue appelé est atteint ; retirer son littéral le rend orphelin', () => {
    const cues = ['enemyKilled', 'orphanCue']
    // Sources SANS le fichier de déclaration : seul un vrai call-site compte.
    const withCall = new Map<string, string>([
      ['src/audio/audioDirector.ts', "this.playCue('enemyKilled')"]
    ])
    const r1 = checkAudioCues(cues, withCall, DECL)
    expect(r1.orphans).toContain('orphanCue') // jamais appelé
    expect(r1.orphans).not.toContain('enemyKilled') // appelé

    // Retirer le call-site → 'enemyKilled' devient orphelin (sens inverse prouvé).
    const withoutCall = new Map<string, string>([['src/audio/audioDirector.ts', '// rien']])
    const r2 = checkAudioCues(cues, withoutCall, DECL)
    expect(r2.orphans).toContain('enemyKilled')
  })

  it('le fichier de DÉCLARATION ne compte pas comme call-site (sinon tout serait « atteint »)', () => {
    // Le nom apparaît dans manifest.ts (déclaration), mais nulle part ailleurs → orphelin.
    const sources = new Map<string, string>([
      ['src/audio/manifest.ts', "monCue: { keys: ['x'] } // monCue déclaré ici"],
      ['src/audio/audioDirector.ts', '// aucun appel']
    ])
    expect(hasStringLiteral('monCue', sources, DECL)).toBe(false)
  })

  it('détecte les 3 chemins de dispatch : appel direct, table (breakSfx), script d’intro', () => {
    const sources = new Map<string, string>([
      ['src/audio/audioDirector.ts', "this.playCue('enemyKilled')"],
      ['src/content/destructibles.ts', "breakSfx: 'break_wood'"],
      ['src/content/introScripts.ts', "{ kind: 'sfx', key: 'clonk' }"]
    ])
    expect(hasStringLiteral('enemyKilled', sources, DECL)).toBe(true)
    expect(hasStringLiteral('break_wood', sources, DECL)).toBe(true)
    expect(hasStringLiteral('clonk', sources, DECL)).toBe(true)
  })
})

describe('agrégation du rapport', () => {
  it('les orphelins ATTENDUS ne comptent pas comme inattendus (PNJ stage 01)', () => {
    const r = buildAmbientReport(50, ['npc_stage01_chef_trade', 'npc_reel_orphelin'], ['npc_stage01_chef_trade'])
    expect(unexpectedOrphans(r)).toEqual(['npc_reel_orphelin'])
  })

  it('sans orphelin attendu, tout orphelin est inattendu', () => {
    const r = checkLiveEngines([{ staticKey: 's', workKey: 'w' }], new Set())
    expect(unexpectedOrphans(r)).toEqual(['w'])
  })
})
