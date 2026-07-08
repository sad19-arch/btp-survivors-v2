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
      // Chaque ouverture débouche sur un chemin connecté au portail.
      for (const o of z.openings) {
        const near = comp.some((s) => segPointDist(s, o) <= 1)
        expect(near).toBe(true)
      }
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
    for (const z of plan.zones) {
      if (!z.fenced) {
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

  it.each(SEEDS)('C8 spawn dégagé ET sur un chemin (seed %i)', (seed) => {
    const plan = planFor(stageId, seed)
    const spawn = { x: W / 2, y: H / 2 }
    for (const z of plan.zones) {
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
