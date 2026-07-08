/**
 * sitePlan — planificateur de chantier DÉTERMINISTE (ÉTAPE 1→4 de la méthode).
 *
 * Consomme le programme sémantique du stage (`src/content/sitePrograms.ts`) et
 * produit un PLAN MASSE : portail sur la route sud, zones placées par ancrage
 * (nord/ouest/est/près-portail/adjacent), clôtures en anneaux FERMÉS avec
 * ouvertures, chemins CONTINUS (épine portail→nord + branches en L) reliant
 * toutes les zones. Zéro pile-ou-face : la géographie découle des règles.
 *
 * Les contraintes du plan (anneaux fermés, connexité, adjacences, spawn dégagé…)
 * sont VÉRIFIÉES par `tests/unit/sitePlan.test.ts` (ÉTAPE 5 automatisée).
 *
 * Règles src/core : pur, seedé (Rng dédié seed ^ 0x517e), zéro Phaser/DOM,
 * zéro Math.random/Date, zéro any. Même (seed, monde, stage) ⇒ même plan.
 */

import { Rng } from '@core/rng'
import { SITE_PROGRAMS } from '@content/sitePrograms'
import type { ZoneSpec } from '@content/sitePrograms'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes exportées (testables)
// ─────────────────────────────────────────────────────────────────────────────

/** Largeur de la bande sud réservée à la route (px) — alignée sur siteLayout. */
export const PLAN_ROUTE_BAND = 700

/** Marge minimale entre une zone et le bord du monde (px). */
export const PLAN_MARGIN = 350

/** Largeur d'une ouverture de clôture (px) — passage joueur/camion confortable. */
export const OPENING_WIDTH = 280

/** Rayon dégagé garanti autour du spawn (centre monde). */
export const SPAWN_CLEAR_R = 300

/** Espace minimal entre deux zones (bord à bord, px). */
export const ZONE_GAP = 200

/** Constante XOR du RNG plan — isolé des autres flux (sim, layout, vagues). */
const PLAN_XOR = 0x517e

// ─────────────────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanPoint {
  x: number
  y: number
}

/** Segment axis-aligned (chemin ou clôture). */
export interface PlanSeg {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PlacedZone {
  id: string
  role: ZoneSpec['role']
  glyph: string
  cx: number
  cy: number
  halfW: number
  halfH: number
  fenced: boolean
  /** Points d'ouverture sur le périmètre (vide si non clôturée). */
  openings: PlanPoint[]
  /** Porte : point du bord relié au réseau de chemins. */
  door: PlanPoint
}

export interface SitePlan {
  worldW: number
  worldH: number
  /** Bord nord de la bande route. */
  routeTopY: number
  gate: PlanPoint
  zones: PlacedZone[]
  paths: PlanSeg[]
  fences: PlanSeg[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers géométriques exportés (réutilisés par tests + outil ASCII)
// ─────────────────────────────────────────────────────────────────────────────

/** Distance bord-à-bord entre deux rectangles (0 si contact/chevauchement). */
export function rectGap(a: PlacedZone, b: PlacedZone): number {
  const dx = Math.max(0, Math.abs(a.cx - b.cx) - (a.halfW + b.halfW))
  const dy = Math.max(0, Math.abs(a.cy - b.cy) - (a.halfH + b.halfH))
  return Math.hypot(dx, dy)
}

/** Distance d'un point au bord d'un rectangle (0 si dedans). */
export function rectPointDist(z: PlacedZone, p: PlanPoint): number {
  const dx = Math.max(0, Math.abs(p.x - z.cx) - z.halfW)
  const dy = Math.max(0, Math.abs(p.y - z.cy) - z.halfH)
  return Math.hypot(dx, dy)
}

/** Distance d'un point à un segment axis-aligned. */
export function segPointDist(s: PlanSeg, p: PlanPoint): number {
  const minX = Math.min(s.x1, s.x2)
  const maxX = Math.max(s.x1, s.x2)
  const minY = Math.min(s.y1, s.y2)
  const maxY = Math.max(s.y1, s.y2)
  const cx = Math.min(Math.max(p.x, minX), maxX)
  const cy = Math.min(Math.max(p.y, minY), maxY)
  return Math.hypot(p.x - cx, p.y - cy)
}

/** True si deux segments axis-aligned se touchent (tolérance eps). */
export function segsTouch(a: PlanSeg, b: PlanSeg, eps: number): boolean {
  // Test par distance point-segment sur les 4 extrémités + croisement H/V.
  if (segPointDist(a, { x: b.x1, y: b.y1 }) <= eps) { return true }
  if (segPointDist(a, { x: b.x2, y: b.y2 }) <= eps) { return true }
  if (segPointDist(b, { x: a.x1, y: a.y1 }) <= eps) { return true }
  if (segPointDist(b, { x: a.x2, y: a.y2 }) <= eps) { return true }
  // Croisement perpendiculaire (H × V).
  const aH = a.y1 === a.y2
  const bH = b.y1 === b.y2
  if (aH !== bH) {
    const h = aH ? a : b
    const v = aH ? b : a
    const hy = h.y1
    const vx = v.x1
    const hMinX = Math.min(h.x1, h.x2) - eps
    const hMaxX = Math.max(h.x1, h.x2) + eps
    const vMinY = Math.min(v.y1, v.y2) - eps
    const vMaxY = Math.max(v.y1, v.y2) + eps
    return vx >= hMinX && vx <= hMaxX && hy >= vMinY && hy <= vMaxY
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Placement
// ─────────────────────────────────────────────────────────────────────────────

interface MutableZone extends PlacedZone {
  spec: ZoneSpec
}

/** Résout la position initiale d'une zone selon son ancrage sémantique. */
function resolveAnchor(
  spec: ZoneSpec,
  worldW: number,
  routeTopY: number,
  gate: PlanPoint,
  placed: Map<string, MutableZone>,
  rng: Rng
): PlanPoint {
  const j = spec.jitterPx ?? 0
  const jx = j > 0 ? rng.float(-j, j) : 0
  const jy = j > 0 ? rng.float(-j, j) : 0
  const a = spec.anchor
  switch (a.kind) {
    case 'north':
      return { x: a.xFrac * worldW + jx, y: PLAN_MARGIN + spec.halfH + Math.abs(jy) }
    case 'west':
      return { x: PLAN_MARGIN + spec.halfW + Math.abs(jx), y: a.yFrac * (routeTopY + PLAN_ROUTE_BAND) + jy }
    case 'east':
      return { x: worldW - PLAN_MARGIN - spec.halfW - Math.abs(jx), y: a.yFrac * (routeTopY + PLAN_ROUTE_BAND) + jy }
    case 'near_gate': {
      const dir = a.side === 'east' ? 1 : -1
      return { x: gate.x + dir * a.distPx + jx, y: routeTopY - spec.halfH - 160 - Math.abs(jy) }
    }
    case 'adjacent': {
      const target = placed.get(a.to)
      if (target === undefined) {
        // Cible absente (erreur de programme) : repli nord — les tests le signaleront.
        return { x: 0.5 * worldW + jx, y: PLAN_MARGIN + spec.halfH }
      }
      const gap = a.gapPx
      switch (a.side) {
        case 'east':
          return { x: target.cx + target.halfW + gap + spec.halfW, y: target.cy + jy }
        case 'west':
          return { x: target.cx - target.halfW - gap - spec.halfW, y: target.cy + jy }
        case 'north':
          return { x: target.cx + jx, y: target.cy - target.halfH - gap - spec.halfH }
        case 'south':
          return { x: target.cx + jx, y: target.cy + target.halfH + gap + spec.halfH }
      }
    }
  }
}

/** Clamp le centre d'une zone dans les bornes jouables. */
function clampZone(z: MutableZone, worldW: number, routeTopY: number): void {
  z.cx = Math.min(Math.max(z.cx, PLAN_MARGIN + z.halfW), worldW - PLAN_MARGIN - z.halfW)
  z.cy = Math.min(Math.max(z.cy, PLAN_MARGIN + z.halfH), routeTopY - z.halfH - 120)
}

/** Sépare deux zones qui se chevauchent (pousse la 2e le long de l'axe de moindre pénétration). */
function separate(a: MutableZone, b: MutableZone): boolean {
  const overlapX = a.halfW + b.halfW + ZONE_GAP - Math.abs(a.cx - b.cx)
  const overlapY = a.halfH + b.halfH + ZONE_GAP - Math.abs(a.cy - b.cy)
  if (overlapX <= 0 || overlapY <= 0) {
    return false
  }
  if (overlapX < overlapY) {
    b.cx += (b.cx >= a.cx ? 1 : -1) * (overlapX + 20)
  } else {
    b.cy += (b.cy >= a.cy ? 1 : -1) * (overlapY + 20)
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonction principale
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construit le plan masse du stage. Renvoie null si le stage n'a pas de
 * programme (les stages legacy gardent l'ancien layout pendant la transition).
 */
export function buildSitePlan(
  seed: number,
  worldW: number,
  worldH: number,
  stageId: string
): SitePlan | null {
  const program = SITE_PROGRAMS[stageId]
  if (program === undefined) {
    return null
  }

  const rng = new Rng((seed ^ PLAN_XOR) >>> 0)
  const routeTopY = worldH - PLAN_ROUTE_BAND
  // Portail aligné sur l'épine centrale (elle passe par le spawn au centre monde).
  const gate: PlanPoint = { x: worldW / 2, y: routeTopY }
  const spawn: PlanPoint = { x: worldW / 2, y: worldH / 2 }

  // ── 1. Placement des zones par ancrage (ordre du programme) ────────────────
  const byId = new Map<string, MutableZone>()
  const zones: MutableZone[] = []
  for (const spec of program.zones) {
    const p = resolveAnchor(spec, worldW, routeTopY, gate, byId, rng)
    const z: MutableZone = {
      id: spec.id,
      role: spec.role,
      glyph: spec.glyph,
      cx: p.x,
      cy: p.y,
      halfW: spec.halfW,
      halfH: spec.halfH,
      fenced: spec.fence !== undefined,
      openings: [],
      door: { x: p.x, y: p.y },
      spec,
    }
    clampZone(z, worldW, routeTopY)
    byId.set(spec.id, z)
    zones.push(z)
  }

  // ── 2. Résolution des chevauchements + dégagement du spawn ────────────────
  for (let pass = 0; pass < 10; pass++) {
    let moved = false
    for (let i = 0; i < zones.length; i++) {
      for (let k = i + 1; k < zones.length; k++) {
        const a = zones[i]
        const b = zones[k]
        if (a !== undefined && b !== undefined && separate(a, b)) {
          clampZone(b, worldW, routeTopY)
          moved = true
        }
      }
    }
    // Spawn : aucune zone ne doit mordre le rayon dégagé.
    for (const z of zones) {
      const dx = Math.max(0, Math.abs(spawn.x - z.cx) - z.halfW)
      const dy = Math.max(0, Math.abs(spawn.y - z.cy) - z.halfH)
      if (Math.hypot(dx, dy) < SPAWN_CLEAR_R) {
        // Pousse la zone à la verticale, du côté où elle est déjà.
        z.cy += (z.cy >= spawn.y ? 1 : -1) * (SPAWN_CLEAR_R + 80)
        clampZone(z, worldW, routeTopY)
        moved = true
      }
    }
    if (!moved) {
      break
    }
  }

  // ── 3+4. Portes + chemins : épine portail→nord, branches en L qui
  //         CONTOURNENT les zones clôturées (jamais de piste à travers une clôture).
  const spineX = gate.x
  const paths: PlanSeg[] = []
  const branchYs: number[] = [gate.y]
  const connectSet = new Set(program.connect)

  /** True si un segment axis-aligned traverse le rect (gonflé) d'une zone. */
  const segHitsZone = (s: PlanSeg, z: MutableZone, inflate: number): boolean => {
    const x0 = z.cx - z.halfW - inflate
    const x1 = z.cx + z.halfW + inflate
    const y0 = z.cy - z.halfH - inflate
    const y1 = z.cy + z.halfH + inflate
    if (s.y1 === s.y2) {
      const y = s.y1
      if (y < y0 || y > y1) {
        return false
      }
      const lo = Math.min(s.x1, s.x2)
      const hi = Math.max(s.x1, s.x2)
      return hi > x0 && lo < x1
    }
    const x = s.x1
    if (x < x0 || x > x1) {
      return false
    }
    const lo = Math.min(s.y1, s.y2)
    const hi = Math.max(s.y1, s.y2)
    return hi > y0 && lo < y1
  }
  /** True si un candidat de tracé heurte une zone CLÔTURÉE autre que `self`. */
  const routeBlocked = (segs: PlanSeg[], self: MutableZone): boolean => {
    for (const z of zones) {
      if (z === self || !z.fenced) {
        continue
      }
      for (const s of segs) {
        if (segHitsZone(s, z, 60)) {
          return true
        }
      }
    }
    return false
  }

  // Porte par défaut (zones non connectées) : milieu du bord sud.
  for (const z of zones) {
    z.door = { x: z.cx, y: z.cy + z.halfH }
  }

  for (const z of zones) {
    if (!connectSet.has(z.id)) {
      continue
    }
    if (Math.abs(z.cx - spineX) <= z.halfW - 120) {
      // Zone traversée par l'épine : porte sur le bord horizontal côté spawn/portail.
      const doorX = Math.min(Math.max(spineX, z.cx - z.halfW + 200), z.cx + z.halfW - 200)
      const south = z.cy < spawn.y
      z.door = { x: doorX, y: z.cy + (south ? z.halfH : -z.halfH) }
      branchYs.push(z.door.y)
      if (Math.abs(doorX - spineX) >= 1) {
        paths.push({ x1: doorX, y1: z.door.y, x2: spineX, y2: z.door.y })
      }
      continue
    }
    // Candidat A : porte sur le bord vertical face à l'épine, branche droite.
    const side = z.cx > spineX ? -1 : 1
    const doorA: PlanPoint = { x: z.cx + side * z.halfW, y: z.cy }
    const segsA: PlanSeg[] = [{ x1: doorA.x, y1: doorA.y, x2: spineX, y2: doorA.y }]
    if (!routeBlocked(segsA, z)) {
      z.door = doorA
      paths.push(...segsA)
      branchYs.push(doorA.y)
      continue
    }
    // Candidat B : porte au sud, descente puis corridor horizontal SOUS les
    // zones clôturées qui bloquaient (contournement).
    const doorB: PlanPoint = {
      x: Math.min(Math.max(spineX, z.cx - z.halfW + 150), z.cx + z.halfW - 150),
      y: z.cy + z.halfH,
    }
    let corridorY = doorB.y + 150
    for (let guard = 0; guard < 6; guard++) {
      const h: PlanSeg = { x1: doorB.x, y1: corridorY, x2: spineX, y2: corridorY }
      let pushed = false
      for (const other of zones) {
        if (other === z || !other.fenced) {
          continue
        }
        if (segHitsZone(h, other, 60)) {
          corridorY = other.cy + other.halfH + 60 + 150
          pushed = true
        }
      }
      if (!pushed) {
        break
      }
    }
    z.door = doorB
    if (corridorY > doorB.y + 1) {
      paths.push({ x1: doorB.x, y1: doorB.y, x2: doorB.x, y2: corridorY })
    }
    paths.push({ x1: doorB.x, y1: corridorY, x2: spineX, y2: corridorY })
    branchYs.push(corridorY)
  }
  const spineTopY = Math.min(...branchYs)
  paths.unshift({ x1: spineX, y1: gate.y, x2: spineX, y2: spineTopY })

  // Ouvertures des zones clôturées : la porte finale (+ bord opposé si demandé).
  for (const z of zones) {
    if (!z.fenced) {
      continue
    }
    z.openings.push({ x: z.door.x, y: z.door.y })
    const wanted = z.spec.fence?.openings ?? 1
    if (wanted >= 2) {
      z.openings.push({ x: 2 * z.cx - z.door.x, y: 2 * z.cy - z.door.y })
    }
  }

  // ── 5. Clôtures : anneaux fermés découpés aux ouvertures ──────────────────
  const fences: PlanSeg[] = []
  for (const z of zones) {
    if (!z.fenced) {
      continue
    }
    const x0 = z.cx - z.halfW
    const x1 = z.cx + z.halfW
    const y0 = z.cy - z.halfH
    const y1 = z.cy + z.halfH
    const edges: PlanSeg[] = [
      { x1: x0, y1: y0, x2: x1, y2: y0 }, // nord
      { x1: x0, y1: y1, x2: x1, y2: y1 }, // sud
      { x1: x0, y1: y0, x2: x0, y2: y1 }, // ouest
      { x1: x1, y1: y0, x2: x1, y2: y1 }, // est
    ]
    for (const edge of edges) {
      const horizontal = edge.y1 === edge.y2
      // Ouvertures situées sur CE bord.
      const cuts: number[] = []
      for (const o of z.openings) {
        const onEdge = horizontal
          ? Math.abs(o.y - edge.y1) < 1 && o.x >= edge.x1 - 1 && o.x <= edge.x2 + 1
          : Math.abs(o.x - edge.x1) < 1 && o.y >= edge.y1 - 1 && o.y <= edge.y2 + 1
        if (onEdge) {
          cuts.push(horizontal ? o.x : o.y)
        }
      }
      const lo = horizontal ? edge.x1 : edge.y1
      const hi = horizontal ? edge.x2 : edge.y2
      cuts.sort((a, b) => a - b)
      let cursor = lo
      for (const c of cuts) {
        const gapLo = Math.max(lo, c - OPENING_WIDTH / 2)
        const gapHi = Math.min(hi, c + OPENING_WIDTH / 2)
        if (gapLo > cursor) {
          fences.push(
            horizontal
              ? { x1: cursor, y1: edge.y1, x2: gapLo, y2: edge.y1 }
              : { x1: edge.x1, y1: cursor, x2: edge.x1, y2: gapLo }
          )
        }
        cursor = Math.max(cursor, gapHi)
      }
      if (cursor < hi) {
        fences.push(
          horizontal
            ? { x1: cursor, y1: edge.y1, x2: hi, y2: edge.y1 }
            : { x1: edge.x1, y1: cursor, x2: edge.x1, y2: hi }
        )
      }
    }
  }

  // Zones publiques sans le champ interne `spec`.
  const publicZones: PlacedZone[] = zones.map((z) => ({
    id: z.id,
    role: z.role,
    glyph: z.glyph,
    cx: z.cx,
    cy: z.cy,
    halfW: z.halfW,
    halfH: z.halfH,
    fenced: z.fenced,
    openings: z.openings,
    door: z.door,
  }))

  return { worldW, worldH, routeTopY, gate, zones: publicZones, paths, fences }
}
