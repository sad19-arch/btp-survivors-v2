import { describe, it, expect } from 'vitest'
import {
  buildSitePlan,
  OPENING_WIDTH,
  PLAN_ROUTE_BAND,
  SPAWN_CLEAR_R,
  rectGap,
  rectPointDist,
  segPointDist,
  segsTouch,
} from '@core/sitePlan'
import type { PlanSeg, PlacedZone, SitePlan } from '@core/sitePlan'
import { SITE_PROGRAMS } from '@content/sitePrograms'
import { buildProceduralSiteLayout } from '@core/siteLayout'
import { CLUSTERS } from '@content/clusters'

/**
 * ÉTAPE 5 automatisée — les contraintes de placement (ÉTAPE 2 de la méthode
 * « plan de chantier ») vérifiées sur le VRAI plan, pour chaque stage
 * programmé et plusieurs seeds. Un plan incohérent = test rouge = on corrige
 * le PLAN avant de peindre le moindre pixel.
 *
 * Contraintes machines (min-dist engins, pelleteuse au bord de fouille) :
 * testées au niveau LAYOUT (placement des prefabs) dans siteLayout — T3.
 */

const W = 10240
const H = 7680
const SEEDS = [1, 2, 3, 7, 42, 123, 999, 20260708]
const STAGES = Object.keys(SITE_PROGRAMS)

function planFor(stageId: string, seed: number): SitePlan {
  const plan = buildSitePlan(seed, W, H, stageId)
  expect(plan).not.toBeNull()
  return plan as SitePlan
}

/** Composante connexe des chemins contenant le portail (union-find naïf). */
function gateComponent(plan: SitePlan): PlanSeg[] {
  const segs = plan.paths
  const parent = segs.map((_, i) => i)
  const find = (i: number): number => {
    let r = i
    while (parent[r] !== r) {
      r = parent[r] ?? r
    }
    return r
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) {
      parent[ra] = rb
    }
  }
  for (let i = 0; i < segs.length; i++) {
    for (let k = i + 1; k < segs.length; k++) {
      const a = segs[i]
      const b = segs[k]
      if (a !== undefined && b !== undefined && segsTouch(a, b, 1)) {
        union(i, k)
      }
    }
  }
  // Segment(s) touchant le portail.
  let gateRoot = -1
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s !== undefined && segPointDist(s, plan.gate) <= 1) {
      gateRoot = find(i)
      break
    }
  }
  expect(gateRoot).toBeGreaterThanOrEqual(0)
  const out: PlanSeg[] = []
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s !== undefined && find(i) === gateRoot) {
      out.push(s)
    }
  }
  return out
}

function fenceLenOn(zone: PlacedZone, fences: PlanSeg[]): number {
  // Somme des longueurs des segments posés SUR le périmètre de la zone.
  const x0 = zone.cx - zone.halfW
  const x1 = zone.cx + zone.halfW
  const y0 = zone.cy - zone.halfH
  const y1 = zone.cy + zone.halfH
  let total = 0
  for (const s of fences) {
    const horizontal = s.y1 === s.y2
    const onEdge = horizontal
      ? (Math.abs(s.y1 - y0) < 1 || Math.abs(s.y1 - y1) < 1) && s.x1 >= x0 - 1 && s.x2 <= x1 + 1
      : (Math.abs(s.x1 - x0) < 1 || Math.abs(s.x1 - x1) < 1) && s.y1 >= y0 - 1 && s.y2 <= y1 + 1
    if (onEdge) {
      total += Math.abs(horizontal ? s.x2 - s.x1 : s.y2 - s.y1)
    }
  }
  return total
}

describe.each(STAGES)('sitePlan — contraintes de chantier (%s)', (stageId) => {
  const rules = SITE_PROGRAMS[stageId]?.rules

  it.each(SEEDS)('C1 route au sud + portail sur la route (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    expect(plan.routeTopY).toBe(H - PLAN_ROUTE_BAND)
    expect(plan.gate.y).toBe(plan.routeTopY)
    expect(plan.gate.x).toBeGreaterThan(0)
    expect(plan.gate.x).toBeLessThan(W)
    // Aucune zone ne déborde sur la bande route.
    for (const z of plan.zones) {
      expect(z.cy + z.halfH).toBeLessThanOrEqual(plan.routeTopY)
    }
  })

  it.each(SEEDS)('C2 anneaux de clôture FERMÉS sauf ouvertures, ouvertures sur chemin (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    const comp = gateComponent(plan)
    for (const z of plan.zones) {
      if (!z.fenced) {
        continue
      }
      const perimeter = 4 * z.halfW + 4 * z.halfH
      const expected = perimeter - z.openings.length * OPENING_WIDTH
      expect(Math.abs(fenceLenOn(z, plan.fences) - expected)).toBeLessThanOrEqual(2)
      expect(z.openings.length).toBeGreaterThanOrEqual(1)
      // La PORTE principale débouche sur un chemin connecté au portail.
      // (Les ouvertures latérales d'une zone signature sont de simples trous de
      // clôture pour l'entrée des ennemis — pas des accès routiers.)
      const near = comp.some((s) => segPointDist(s, z.door) <= 1)
      expect(near, `porte de ${z.id} pas sur un chemin`).toBe(true)
    }
  })

  it.each(SEEDS)('C3 chemins connexes : le portail atteint toutes les zones (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    const comp = gateComponent(plan)
    const program = SITE_PROGRAMS[stageId]
    const connected = new Set(program?.connect ?? [])
    for (const z of plan.zones) {
      if (!connected.has(z.id)) {
        continue
      }
      const reachable = comp.some((s) => segPointDist(s, z.door) <= 1)
      expect(reachable, `porte de ${z.id} injoignable depuis le portail`).toBe(true)
    }
  })

  it.each(SEEDS)('C3b aucun chemin ne traverse une zone clôturée (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    const program = SITE_PROGRAMS[stageId]
    for (const z of plan.zones) {
      if (!z.fenced) {
        continue
      }
      // La zone SIGNATURE contient le spawn : la piste d'accès (rampe) y ENTRE
      // légitimement par la porte — c'est le chantier central desservi par la route.
      const spec = program?.zones.find((s) => s.id === z.id)
      if (spec?.signature === true) {
        continue
      }
      // Rect INTÉRIEUR (rétréci) : un chemin qui y pénètre = traversée de clôture.
      const x0 = z.cx - z.halfW + 30
      const x1 = z.cx + z.halfW - 30
      const y0 = z.cy - z.halfH + 30
      const y1 = z.cy + z.halfH - 30
      for (const s of plan.paths) {
        const horizontal = s.y1 === s.y2
        const inside = horizontal
          ? s.y1 > y0 && s.y1 < y1 && Math.max(s.x1, s.x2) > x0 && Math.min(s.x1, s.x2) < x1
          : s.x1 > x0 && s.x1 < x1 && Math.max(s.y1, s.y2) > y0 && Math.min(s.y1, s.y2) < y1
        expect(inside, `chemin traverse la zone clôturée ${z.id}`).toBe(false)
      }
    }
  })

  it.each(SEEDS)('C5 déblais adjacents à une excavation (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    const excavations = plan.zones.filter((z) => z.role === 'excavation')
    for (const z of plan.zones) {
      if (z.role !== 'spoil') {
        continue
      }
      const gaps = excavations.map((e) => rectGap(z, e))
      expect(Math.min(...gaps)).toBeLessThanOrEqual(rules?.spoilAdjacentMaxPx ?? 400)
    }
  })

  it.each(SEEDS)('C6 base vie près du portail, loin des fouilles (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    for (const z of plan.zones) {
      if (z.role !== 'base_vie') {
        continue
      }
      expect(rectPointDist(z, plan.gate)).toBeLessThanOrEqual(rules?.baseVieMaxFromGatePx ?? 800)
      for (const e of plan.zones) {
        if (e.role === 'excavation') {
          expect(rectGap(z, e)).toBeGreaterThanOrEqual(rules?.baseVieMinFromExcavationPx ?? 1500)
        }
      }
    }
  })

  it.each(SEEDS)('C7 zéro chevauchement de zones (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    for (let i = 0; i < plan.zones.length; i++) {
      for (let k = i + 1; k < plan.zones.length; k++) {
        const a = plan.zones[i]
        const b = plan.zones[k]
        if (a === undefined || b === undefined) {
          continue
        }
        expect(rectGap(a, b), `${a.id} chevauche ${b.id}`).toBeGreaterThan(0)
      }
    }
  })

  it.each(SEEDS)('C8 poche de spawn dégagée (aucun PREFAB) ET sur un chemin (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    const spawn = { x: W / 2, y: H / 2 }
    const program = SITE_PROGRAMS[stageId]
    // Les zones NON-signature ne mordent pas le spawn. La zone signature PEUT
    // le contenir (le joueur démarre dedans) — sa poche est garantie par le
    // spawn-clear des prefabs (testé au niveau layout, C8b).
    for (const z of plan.zones) {
      const spec = program?.zones.find((s) => s.id === z.id)
      if (spec?.signature === true) {
        continue
      }
      expect(rectPointDist(z, spawn), `zone ${z.id} mord le spawn`).toBeGreaterThanOrEqual(SPAWN_CLEAR_R)
    }
    const dMin = Math.min(...plan.paths.map((s) => segPointDist(s, spawn)))
    expect(dMin).toBeLessThanOrEqual(60)
  })

  it('déterminisme : même seed ⇒ même plan', () => {
    expect(planFor(stageId, 42)).toEqual(planFor(stageId, 42))
  })
})

describe('sitePlan — stages sans programme', () => {
  it('renvoie null (layout legacy conservé)', () => {
    expect(buildSitePlan(1, W, H, 'stage_inconnu')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Lisibilité du plan ASCII (l'artefact de revue humaine — `npm run site:plan`)
// ─────────────────────────────────────────────────────────────────────────────
describe('sitePrograms — glyphes de zone lisibles sur le plan ASCII', () => {
  /**
   * `tools/site-plan-ascii.ts` réserve ces caractères à l'INFRASTRUCTURE. Une
   * zone qui en reprend un se déguise en route/portail/clôture sur la planche —
   * et le plan qu'on relit ment. Pris sur le fait deux fois en écrivant SP-T7
   * (`zone_lot_gaines` en 'G' = portail, `zone_reception` en 'R' = route) : d'où
   * l'invariant, plutôt que deux corrections ponctuelles.
   */
  const RESERVED = new Set(['R', 'G', '#', 'o', '=', '*', '.'])

  it('aucun glyphe de zone ne reprend un caractère réservé', () => {
    for (const [stageId, program] of Object.entries(SITE_PROGRAMS)) {
      for (const zone of program.zones) {
        expect(
          RESERVED.has(zone.glyph),
          `${stageId}/${zone.id} : glyphe "${zone.glyph}" réservé à l'infrastructure du plan ASCII`
        ).toBe(false)
      }
    }
  })

  // ⚠️ PAS de règle « un glyphe = une zone ». Elle a été écrite, elle est FAUSSE :
  // TERRASSEMENT donne exprès 'k' à `piquets_ne` ET `piquets_so`. Le glyphe dénote
  // la NATURE de la zone (deux lignes de piquets se lisent pareil), pas son
  // identité — et la légende, elle, liste bien les deux. Un glyphe partagé entre
  // zones de MÊME rôle est une abréviation correcte, pas une ambiguïté.
})

// ─────────────────────────────────────────────────────────────────────────────
// Intégrité des programmes (ce que les contraintes géométriques ne voient pas)
// ─────────────────────────────────────────────────────────────────────────────
describe('sitePrograms — intégrité du registre', () => {
  it('tout clusterId référencé par un programme existe dans CLUSTERS', () => {
    for (const [stageId, program] of Object.entries(SITE_PROGRAMS)) {
      for (const zone of program.zones) {
        for (const pf of zone.prefabs ?? []) {
          expect(
            CLUSTERS[pf.clusterId],
            `${stageId}/${zone.id} référence le cluster inconnu "${pf.clusterId}"`
          ).toBeDefined()
        }
      }
    }
  })

  it('tout id de `connect` correspond à une zone du programme', () => {
    for (const [stageId, program] of Object.entries(SITE_PROGRAMS)) {
      const ids = new Set(program.zones.map((z) => z.id))
      for (const id of program.connect) {
        expect(ids.has(id), `${stageId} : connect référence la zone inconnue "${id}"`).toBe(true)
      }
    }
  })

  it('tout ancrage `adjacent` vise une zone DÉJÀ placée (l\'ordre du programme compte)', () => {
    // `resolveAnchor` lit `placed` : une cible déclarée APRÈS retombe sur le
    // repli nord silencieusement. Le test rend la faute visible.
    for (const [stageId, program] of Object.entries(SITE_PROGRAMS)) {
      const placed = new Set<string>()
      for (const zone of program.zones) {
        if (zone.anchor.kind === 'adjacent') {
          expect(
            placed.has(zone.anchor.to),
            `${stageId}/${zone.id} : ancrée sur "${zone.anchor.to}", déclarée plus tard (ou absente)`
          ).toBe(true)
        }
        placed.add(zone.id)
      }
    }
  })

  it('chaque stage a AU PLUS une zone signature', () => {
    for (const [stageId, program] of Object.entries(SITE_PROGRAMS)) {
      const sigs = program.zones.filter((z) => z.signature === true)
      expect(sigs.length, `${stageId} : ${sigs.length} zones signature`).toBeLessThanOrEqual(1)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Contraintes de niveau LAYOUT (placement des prefabs) — C4 et C9
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scènes portant un engin EN TRAVAIL (le parc = machines parquées, exempt).
 *
 * ⚠️ Ce test exige `machines.length > 0` sur CHAQUE stage programmé : tout stage
 * ajouté à `SITE_PROGRAMS` doit donc déclarer ici ses scènes à engin, sinon C4
 * ne vérifie plus rien chez lui (et échoue, ce qui est le comportement voulu).
 * Les scènes `*_parc` en sont volontairement absentes : un parc, c'est des
 * machines rangées au cordeau — la règle d'écartement ne s'y applique pas.
 */
const MACHINE_CLUSTERS = new Set([
  'scene_dig_active',
  'scene_spoil',
  'scene_foundation_pour_spawn',
  'scene_mixer_waiting',
  'scene_small_mixer_patch',
  // Stages 05→10 (SP-T7) : signature (engin au tableau) + front de travail.
  'scene_gros_oeuvre_signature',
  'scene_gros_oeuvre_work',
  'scene_echafaudages_signature',
  'scene_echafaudages_work',
  'scene_charpente_signature',
  'scene_charpente_work',
  'scene_second_oeuvre_signature',
  'scene_second_oeuvre_work',
  'scene_finitions_signature',
  'scene_finitions_work',
  'scene_livraison_signature',
  'scene_livraison_work',
])

/** Clusters hors-zone par nature (infrastructure du site). */
const INFRA_CLUSTERS = new Set(['cluster_route', 'cluster_gate_main'])

describe.each(STAGES)('siteLayout — contraintes machines & zones (%s)', (stageId) => {
  it.each(SEEDS)('C4 deux machines en travail ne sont JAMAIS collées (seed %i)', (seed) => {
    const layout = buildProceduralSiteLayout(seed, W, H, stageId)
    const machines = layout.clusters.filter((c) => MACHINE_CLUSTERS.has(c.defId))
    expect(machines.length).toBeGreaterThan(0)
    const minDist = SITE_PROGRAMS[stageId]?.rules.minMachineDistPx ?? 600
    for (let i = 0; i < machines.length; i++) {
      for (let k = i + 1; k < machines.length; k++) {
        const a = machines[i]
        const b = machines[k]
        if (a === undefined || b === undefined) {
          continue
        }
        expect(
          Math.hypot(a.x - b.x, a.y - b.y),
          `machines ${a.defId}@(${Math.round(a.x)},${Math.round(a.y)}) et ${b.defId} collées`
        ).toBeGreaterThanOrEqual(minDist)
      }
    }
  })

  it.each(SEEDS)('R-F la zone SIGNATURE CONTIENT le spawn (joueur démarre dedans) (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    const program = SITE_PROGRAMS[stageId]
    const sigSpec = program?.zones.find((z) => z.signature === true)
    if (sigSpec === undefined) {
      return // stage sans zone signature
    }
    const sig = plan.zones.find((z) => z.id === sigSpec.id)
    expect(sig, 'zone signature introuvable dans le plan').toBeDefined()
    if (sig !== undefined) {
      const spawn = { x: W / 2, y: H / 2 }
      expect(rectPointDist(sig, spawn), 'le spawn n\'est pas DANS la zone signature').toBe(0)
    }
  })

  it.each(SEEDS)('C9 aucun prefab ne flotte hors de sa zone (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    const layout = buildProceduralSiteLayout(seed, W, H, stageId)
    for (const c of layout.clusters) {
      if (INFRA_CLUSTERS.has(c.defId)) {
        continue
      }
      const inSomeZone = plan.zones.some(
        (z) => Math.abs(c.x - z.cx) <= z.halfW + 10 && Math.abs(c.y - z.cy) <= z.halfH + 10
      )
      expect(inSomeZone, `${c.defId}@(${Math.round(c.x)},${Math.round(c.y)}) hors zone`).toBe(true)
    }
  })

  it.each(SEEDS)('les clôtures du plan deviennent des obstacles bloquants (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    const layout = buildProceduralSiteLayout(seed, W, H, stageId)
    const fenceObstacles = layout.obstacles.filter((o) => o.kind === 'segment' && o.blocks === 'both')
    // Au moins autant de segments d'obstacle que de segments de clôture du plan.
    expect(fenceObstacles.length).toBeGreaterThanOrEqual(plan.fences.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R-E structurel — « aucun trou nu » : toute scène avec une fosse porte son
// anneau de déblais. Vérifié sur les DÉFINITIONS de clusters (indépendant du seed) :
// un trou n'apparaît jamais sans les mottes qu'on en a sorties.
// ─────────────────────────────────────────────────────────────────────────────
describe('clusters — R-E : aucun trou sans son anneau de déblais', () => {
  const PIT_KEYS = ['struct_stage02_pit']
  const MOUND_KEYS = ['prop_s2_dirt']
  const RING_RADIUS = 220
  const MIN_MOUNDS = 4

  it('toute def de cluster contenant une fosse a ≥4 mottes autour', () => {
    for (const def of Object.values(CLUSTERS)) {
      const pits = def.elements.filter((e) => PIT_KEYS.includes(e.assetKey))
      for (const pit of pits) {
        const mounds = def.elements.filter(
          (e) => MOUND_KEYS.includes(e.assetKey) && Math.hypot(e.dx - pit.dx, e.dy - pit.dy) <= RING_RADIUS
        )
        expect(
          mounds.length,
          `${def.id} : fosse sans anneau de déblais (${mounds.length} mottes dans ${RING_RADIUS}px)`
        ).toBeGreaterThanOrEqual(MIN_MOUNDS)
      }
    }
  })
})
