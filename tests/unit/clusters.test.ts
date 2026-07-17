import { describe, it, expect } from 'vitest'
import { CLUSTERS, STAGE_CLUSTERS, LIVE_ENGINE_KEYS, liveEngineFor } from '@content/clusters'
import { resolveSolidity, type Solidity } from '@content/assetSolidity'
import { buildSiteLayout } from '@core/siteLayout'
import { STAGE_RENDER } from '@render/stages'

/**
 * Intégrité des prefabs de clusters (T1 — data pure).
 * Ces tests valident les invariants structurels des définitions de clusters ;
 * ils ne testent pas le placement (T2) ni le rendu (T3).
 */
describe('CLUSTERS — intégrité des définitions', () => {
  it('1. toute assetKey est une chaîne non vide', () => {
    for (const [clusterId, def] of Object.entries(CLUSTERS)) {
      for (const el of def.elements) {
        expect(
          el.assetKey.length > 0,
          `${clusterId}: assetKey vide dans un élément`
        ).toBe(true)
      }
    }
  })

  it('2. cohérence collide / shape : collide!=="none" ⇒ shape défini ; collide==="none" ⇒ shape absent', () => {
    for (const [clusterId, def] of Object.entries(CLUSTERS)) {
      for (const el of def.elements) {
        if (el.collide !== 'none') {
          expect(
            el.shape,
            `${clusterId} assetKey="${el.assetKey}" collide="${el.collide}" mais shape absent`
          ).toBeDefined()
        } else {
          expect(
            el.shape,
            `${clusterId} assetKey="${el.assetKey}" collide="none" mais shape présent`
          ).toBeUndefined()
        }
      }
    }
  })

  /**
   * Ce que l'invariant protège vraiment : un ENCLOS (anneau de palissade) sans
   * ouverture = zone inatteignable et joueur qui s'y coince.
   *
   * Il visait « au moins un élément collidable » tant que collision ⇔ clôture.
   * Depuis que la solidité est DÉCLARÉE (assetSolidity), un bulldozer garé rend
   * `cluster_plant` « collidable » sans rien enclore : la règle d'origine y
   * exigeait un gate fictif. On la recentre donc sur son intention — la clôture,
   * qui est ce qui enferme — sans rien relâcher pour les vrais enclos.
   */
  it('3. tout cluster qui pose une CLÔTURE (enclos) a gates.length >= 1', () => {
    const FENCES = new Set(['fence_panel'])
    let checked = 0
    for (const [clusterId, def] of Object.entries(CLUSTERS)) {
      const encloses = def.elements.some((el) => FENCES.has(el.assetKey) && el.collide !== 'none')
      if (encloses) {
        checked++
        expect(
          def.gates.length >= 1,
          `${clusterId} pose une clôture bloquante mais aucun gate (enclos 100 % fermé)`
        ).toBe(true)
      }
    }
    // Sans ça, un renommage d'asset viderait le test en silence.
    expect(checked, 'aucun cluster clôturé trouvé : le test ne vérifie plus rien').toBeGreaterThan(0)
  })

  it('4. footprintRadius > 0 et ≥ à la distance max (|dx,dy|) de ses éléments', () => {
    for (const [clusterId, def] of Object.entries(CLUSTERS)) {
      expect(def.footprintRadius, `${clusterId}: footprintRadius <= 0`).toBeGreaterThan(0)

      for (const el of def.elements) {
        const dist = Math.sqrt(el.dx * el.dx + el.dy * el.dy)
        expect(
          def.footprintRadius >= dist,
          `${clusterId} assetKey="${el.assetKey}" dist=${dist.toFixed(1)} > footprintRadius=${def.footprintRadius}`
        ).toBe(true)
      }
    }
  })
})

describe('STAGE_CLUSTERS — intégrité', () => {
  it('5. STAGE_CLUSTERS["terrain_vierge"] a désormais des clusters (installation de chantier, rollout complet)', () => {
    // Depuis le rollout complet (phase 8), le stage 01 a lui aussi une compo
    // tactique (base-vie clôturée). Il n'est PLUS la garde diff-0 de sim:check
    // (baseline re-dérivée). On vérifie qu'il expose les 5 rôles standards.
    const entries = STAGE_CLUSTERS['terrain_vierge']
    expect(entries).toBeDefined()
    expect(entries?.map((e) => e.role)).toEqual(['route', 'excavation', 'spoil', 'plant', 'pause'])
  })

  it('5b. les 10 stages ont tous une compo de clusters (aucun vide)', () => {
    const STAGES = [
      'terrain_vierge', 'terrassement', 'fondations', 'reseaux_enterres', 'gros_oeuvre',
      'echafaudages', 'charpente_toiture', 'second_oeuvre', 'finitions', 'livraison_audit'
    ]
    for (const s of STAGES) {
      expect(STAGE_CLUSTERS[s]?.length ?? 0, `stage "${s}" sans clusters`).toBeGreaterThan(0)
    }
  })

  it('6a. tout clusterId référencé dans STAGE_CLUSTERS existe dans CLUSTERS', () => {
    for (const [stageId, entries] of Object.entries(STAGE_CLUSTERS)) {
      for (const entry of entries) {
        expect(
          CLUSTERS[entry.clusterId],
          `stage "${stageId}" référence clusterId "${entry.clusterId}" qui n'existe pas dans CLUSTERS`
        ).toBeDefined()
      }
    }
  })

  it('6b. tout role référencé dans STAGE_CLUSTERS est une chaîne non vide cohérente', () => {
    const validRoles = new Set(['route', 'excavation', 'spoil', 'plant', 'pause'])
    for (const [stageId, entries] of Object.entries(STAGE_CLUSTERS)) {
      for (const entry of entries) {
        expect(
          entry.role.length > 0,
          `stage "${stageId}": role vide`
        ).toBe(true)
        expect(
          validRoles.has(entry.role),
          `stage "${stageId}": role "${entry.role}" inconnu (valides: ${[...validRoles].join(', ')})`
        ).toBe(true)
      }
    }
  })
})

/**
 * MACHINES VIVANTES — les engins animés (`LIVE_ENGINES`).
 *
 * Ces tests gardent les DEUX façons dont le lot a déjà échoué :
 *  - une feuille animée câblée dans un cluster que plus personne ne place
 *    (les 3 feuilles stage 02 : 0 frame jouée depuis leur livraison) ;
 *  - un swap de clé sans entrée miroir dans `ASSET_SOLIDITY`, qui rendrait
 *    l'engin TRAVERSABLE (le joueur passe à travers une pelleteuse) et
 *    ferait diverger la sim.
 */
describe('LIVE_ENGINES — machines vivantes', () => {
  it('7. la variante animée a EXACTEMENT la solidité de la statique (sinon: engin traversable + sim qui dérive)', () => {
    // Les deux façons dont un cluster écrit un engin, à tester toutes les deux :
    // `collide:'none'` (les fabriques comptent sur la déclaration) et une forme
    // explicite (les scènes écrites à la main la transportent).
    const writtenCases: { label: string; written: Solidity }[] = [
      { label: "collide:'none' (fabriques)", written: { collide: 'none' } },
      {
        label: 'forme explicite (scènes)',
        written: { collide: 'both', shape: { kind: 'circle', r: 56 } }
      }
    ]
    for (const staticKey of LIVE_ENGINE_KEYS) {
      const live = liveEngineFor(staticKey)
      expect(live, `${staticKey}: entrée LIVE_ENGINES introuvable`).toBeDefined()
      if (live === undefined) {
        continue
      }
      for (const { label, written } of writtenCases) {
        expect(
          resolveSolidity(live.workKey, written),
          `${staticKey} → ${live.workKey} [${label}] : la variante ANIMÉE n'a pas la ` +
            `même solidité que la statique. Ajoute l'entrée miroir dans ASSET_SOLIDITY, ` +
            `sinon l'engin devient traversable et la sim dérive.`
        ).toEqual(resolveSolidity(staticKey, written))
      }
    }
  })

  it("8. aucune statique animée ne subsiste dans CLUSTERS (la passe s'applique partout)", () => {
    for (const [clusterId, def] of Object.entries(CLUSTERS)) {
      for (const el of def.elements) {
        expect(
          LIVE_ENGINE_KEYS.includes(el.assetKey),
          `${clusterId}: l'engin "${el.assetKey}" a une variante animée mais reste statique`
        ).toBe(false)
      }
    }
  })

  it('9. tout élément issu de LIVE_ENGINES porte une animation jouable (frameRate > 0)', () => {
    const workKeys = new Set(LIVE_ENGINE_KEYS.map((k) => liveEngineFor(k)?.workKey))
    for (const [clusterId, def] of Object.entries(CLUSTERS)) {
      for (const el of def.elements) {
        if (!workKeys.has(el.assetKey)) {
          continue
        }
        expect(el.animation, `${clusterId}: "${el.assetKey}" posé sans animation`).toBeDefined()
        expect(
          (el.animation?.frameRate ?? 0) > 0,
          `${clusterId}: "${el.assetKey}" frameRate invalide`
        ).toBe(true)
      }
    }
  })
})

/**
 * Contrat RENDU des machines vivantes.
 *
 * `siteRenderer` anime via `anims.generateFrameNumbers(assetKey)` : la texture
 * DOIT donc être chargée en SPRITESHEET (`load.spritesheet`), ce que `GameScene`
 * ne fait que pour les entrées `editorExtras` porteuses d'un `frame`. Une feuille
 * animée oubliée là serait chargée en image simple : une seule frame, engin figé,
 * et aucun test de contenu ne le verrait.
 */
describe('LIVE_ENGINES — contrat de chargement (spritesheet)', () => {
  it('10. toute variante animée est déclarée en editorExtras AVEC un frame, sur le stage qui la pose', () => {
    const extras = new Map<string, number | undefined>()
    for (const stage of Object.values(STAGE_RENDER)) {
      for (const e of stage.editorExtras ?? []) {
        extras.set(e.key, e.frame)
      }
    }
    for (const staticKey of LIVE_ENGINE_KEYS) {
      const workKey = liveEngineFor(staticKey)?.workKey ?? ''
      expect(
        extras.has(workKey),
        `${workKey}: absent de editorExtras → jamais chargé, l'engin ne s'affiche pas`
      ).toBe(true)
      expect(
        extras.get(workKey),
        `${workKey}: déclaré SANS "frame" → chargé en image simple, une seule frame, engin figé`
      ).toBeGreaterThan(0)
    }
  })
})

/**
 * LA garde qui manquait : les engins animés arrivent-ils DANS LE MONDE ?
 *
 * Les 3 feuilles du stage 02 étaient correctes, déclarées, packées, QA-vertes
 * ET porteuses d'une `animation` — mais posées dans `cluster_excavation` /
 * `cluster_plant`, que `buildSiteLayout` ne place sur AUCUN stage depuis que
 * `terrassement` a un `SITE_PROGRAM`. Tout était « vert » et rien ne tournait.
 * Un test de contenu ne pouvait pas le voir : il faut CONSTRUIRE le monde.
 */
describe('LIVE_ENGINES — les engins animés arrivent dans le monde', () => {
  const SEED = 12345
  const W = 10240
  const H = 7680
  const animatedKeysOf = (stageId: string): Set<string> => {
    const found = new Set<string>()
    for (const placed of buildSiteLayout(SEED, W, H, stageId).clusters) {
      const elements = placed.elements ?? CLUSTERS[placed.defId]?.elements ?? []
      for (const el of elements) {
        if (el.animation !== undefined) {
          found.add(el.assetKey)
        }
      }
    }
    return found
  }

  // Stage → engins animés qu'on doit VOIR tourner une fois le monde construit.
  const EXPECTED: Record<string, string[]> = {
    terrassement: ['prop_s2_excavator_work', 'prop_s2_truck_work', 'prop_s2_dozer_work'],
    fondations: ['struct_stage03_mixer_work', 'prop_stage03_concrete_mixer_work'],
    reseaux_enterres: ['struct_stage04_excavator_work'],
    gros_oeuvre: ['struct_stage05_crane_work', 'prop_stage05_crane_hook_work'],
    echafaudages: ['struct_stage06_nacelle_work'],
    charpente_toiture: ['struct_stage07_crane_work']
  }

  for (const [stageId, keys] of Object.entries(EXPECTED)) {
    it(`11. ${stageId} : ${keys.length} engin(s) animé(s) réellement posé(s)`, () => {
      const found = animatedKeysOf(stageId)
      for (const key of keys) {
        expect(
          found.has(key),
          `${stageId}: "${key}" n'est posé par AUCUN cluster placé → l'engin ne tourne pas en jeu`
        ).toBe(true)
      }
    })
  }

  it('12. la TOUPIE stage 05 reste STATIQUE (réserve DA assumée, pas un oubli)', () => {
    const found = animatedKeysOf('gros_oeuvre')
    expect(
      found.has('struct_stage05_mixer_work'),
      'struct_stage05_mixer_work est branché alors que sa feuille est en vue de côté ' +
        '(régression DA jugée en contexte). Si la feuille a été refaite en 3/4, ' +
        'ajoute la clé à LIVE_ENGINES et mets à jour ce test.'
    ).toBe(false)
  })
})
