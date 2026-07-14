/**
 * T2 — Zonage du site (siteLayout, pur seede).
 *
 * Responsabilite : placer les clusters (definis en T1 dans src/content/clusters.ts)
 * sur le monde de facon coherente et deterministe, et produire la liste des obstacles
 * absolus pour le systeme de collision (T3).
 *
 * Regles :
 * - src/core pur : zero Phaser/DOM, zero Math.random/Date.now, zero `any`.
 * - RNG dedie et isole (seed ^ 0x51e0) — n'affecte PAS le flux RNG de la sim.
 * - Calcule UNE SEULE fois par partie (pas de RNG par pas de simulation).
 * - terrain_vierge → { clusters: [], obstacles: [] } (sim:check diff 0 garanti).
 *
 * Convention segments absolus :
 *   x, y = point de depart absolu dans le monde
 *   x2, y2 = coordonnees absolues du 2e point (PAS un delta)
 *   Derivation : cx + elem.dx + elem.shape.x2 pour x2
 */

import { Rng } from '@core/rng'
import { CLUSTERS, STAGE_CLUSTERS } from '@content/clusters'
import type { ClusterDef, ClusterElement } from '@content/clusters'
import { buildSitePlan } from '@core/sitePlan'
import type { SitePlan, PlacedZone } from '@core/sitePlan'
import { SITE_PROGRAMS } from '@content/sitePrograms'
import type { ZonePrefab } from '@content/sitePrograms'
import { resolveComposedLayout } from '@content/runtimeLayouts'
import type { StageLayout, EmbeddedElement } from '@content/stageLayout'
import { DESTRUCTIBLE_SCATTER } from '@content/destructibles'
import type { DestructibleSpawn } from '@content/destructibles'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes exportees (testables)
// ─────────────────────────────────────────────────────────────────────────────

/** Largeur de la bande sud reservee a la route (px). */
export const ROUTE_BAND = 700

/** Taille d'une cellule de la grille interieure (px). */
export const CELL = 1300

/** Distance minimale entre deux ancres de clusters (px) — anti-chevauchement. */
export const MIN_GAP = 440

/** Espacement des tuiles de route le long du bord sud (px). */
export const ROUTE_TILE = 210

/** Rayon de securite autour du spawn : aucun cluster collidable autorise. */
export const SPAWN_SAFE_R = 700

/** Constante XOR pour deriver le RNG siteLayout — isole des autres flux. */
const LAYOUT_XOR = 0x51e0

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces publiques
// ─────────────────────────────────────────────────────────────────────────────

export interface PlacedCluster {
  defId: string
  x: number
  y: number
  /** Miroir horizontal de la scène entière (compos éditeur). Défaut : false. */
  flipX?: boolean
  /** Rotation de la scène entière en degrés (compos éditeur). Défaut : 0. */
  rotationDeg?: number
  /** Éléments inline (prefab d'éditeur SANS ClusterDef connu). Sinon : CLUSTERS[defId]. */
  elements?: ClusterElement[]
}

/**
 * Obstacle absolu dans le monde.
 *
 * circle  => x, y = centre ; r = rayon.
 * segment => x, y = point de depart absolu ; x2, y2 = 2e point ABSOLU (pas delta).
 *
 * `blocks` appartient a { 'both', 'enemies' } — jamais 'none'.
 */
export interface Obstacle {
  kind: 'circle' | 'segment'
  x: number
  y: number
  x2?: number
  y2?: number
  r?: number
  thickness?: number
  blocks: 'both' | 'enemies'
}

export interface SurfaceSlowZone {
  x: number
  y: number
  radius: number
  multiplier: number
}

export interface SiteLayout {
  clusters: PlacedCluster[]
  obstacles: Obstacle[]
  /** Surfaces environnementales ralentissantes, sans degats. */
  slowZones?: SurfaceSlowZone[]
  /**
   * Objets destructibles à faire apparaître. Renseigné par l'éditeur
   * (`composedToSiteLayout`) OU le scatter programmatique (attaché par
   * `buildSiteLayout`). Absent = aucun (les consommateurs lisent `?? []`).
   */
  destructibles?: DestructibleSpawn[]
}

/** Constante XOR pour dériver le RNG de dispersion des destructibles (isolé). */
const DESTRUCTIBLE_XOR = 0x7d3a

// ─────────────────────────────────────────────────────────────────────────────
// Helpers prives
// ─────────────────────────────────────────────────────────────────────────────

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/**
 * Retourne true si l'ancre (cx, cy) est trop proche d'une ancre deja placee
 * (distance < MIN_GAP).
 */
function tooClose(cx: number, cy: number, placed: PlacedCluster[]): boolean {
  const minGap2 = MIN_GAP * MIN_GAP
  for (const p of placed) {
    if (dist2(cx, cy, p.x, p.y) < minGap2) {
      return true
    }
  }
  return false
}

/**
 * Retourne true si la def contient au moins un element collidable ET que l'ancre
 * est a moins de SPAWN_SAFE_R du spawn (centre monde).
 */
function violatesSpawnSafe(
  cx: number,
  cy: number,
  def: ClusterDef,
  spawnX: number,
  spawnY: number
): boolean {
  const hasCollidable = def.elements.some((el) => el.collide !== 'none')
  if (!hasCollidable) {
    return false
  }
  return dist2(cx, cy, spawnX, spawnY) < SPAWN_SAFE_R * SPAWN_SAFE_R
}

/**
 * Extrait les obstacles absolus d'un cluster place en (cx, cy).
 *
 * `flipX`/`rotationDeg` (défaut identité) transforment la scène ENTIÈRE (compos
 * éditeur). Avec les valeurs par défaut, le résultat est BIT-À-BIT identique à
 * l'ancien comportement (cos1/sin0) → sim:check diff 0 sur les stages génératifs.
 */
function extractObstacles(
  cx: number,
  cy: number,
  elements: ReadonlyArray<ClusterElement>,
  flipX = false,
  rotationDeg = 0
): Obstacle[] {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // Transforme un vecteur local (miroir puis rotation).
  const tx = (vx: number, vy: number): number => (flipX ? -vx : vx) * cos - vy * sin
  const ty = (vx: number, vy: number): number => (flipX ? -vx : vx) * sin + vy * cos

  const result: Obstacle[] = []
  for (const elem of elements) {
    if (elem.collide === 'none') {
      continue
    }
    const blocks = elem.collide // 'both' | 'enemies'
    const ax = cx + tx(elem.dx, elem.dy)
    const ay = cy + ty(elem.dx, elem.dy)

    // shape est toujours defini quand collide !== 'none' (invariant T1 verifie)
    const shape = elem.shape
    if (shape === undefined) {
      continue
    }

    if (shape.kind === 'circle') {
      result.push({ kind: 'circle', x: ax, y: ay, r: shape.r, blocks })
    } else {
      // segment : le vecteur (x2,y2) est aussi transformé (miroir + rotation)
      result.push({
        kind: 'segment',
        x: ax,
        y: ay,
        x2: ax + tx(shape.x2, shape.y2),
        y2: ay + ty(shape.x2, shape.y2),
        thickness: shape.thickness,
        blocks
      })
    }
  }
  return result
}

function extractSurfaceSlowZones(
  cx: number,
  cy: number,
  elements: ReadonlyArray<ClusterElement>,
  flipX = false,
  rotationDeg = 0
): SurfaceSlowZone[] {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const result: SurfaceSlowZone[] = []
  for (const elem of elements) {
    if (elem.surfaceSlow === undefined) {
      continue
    }
    const lx = flipX ? -elem.dx : elem.dx
    result.push({
      x: cx + lx * cos - elem.dy * sin,
      y: cy + lx * sin + elem.dy * cos,
      radius: elem.surfaceSlow.radius,
      multiplier: elem.surfaceSlow.multiplier
    })
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition éditeur → SiteLayout (pur, déterministe)
// ─────────────────────────────────────────────────────────────────────────────

/** Élément embarqué (compo/import) → ClusterElement (collision lossless). */
function embeddedToClusterElement(e: EmbeddedElement): ClusterElement {
  if (e.collide !== undefined && e.collide !== 'none') {
    const shape = e.shape ?? { kind: 'circle', r: Math.max(16, e.scale * 40) }
    return { assetKey: e.assetKey, dx: e.dx, dy: e.dy, scale: e.scale, flipX: e.flipX === true, collide: e.collide, shape }
  }
  return { assetKey: e.assetKey, dx: e.dx, dy: e.dy, scale: e.scale, flipX: e.flipX === true, collide: 'none' }
}

/**
 * Convertit une composition d'éditeur (`StageLayout`, origine = centre monde) en
 * `SiteLayout` consommable par la sim (obstacles) ET le rendu (clusters).
 * PUR : mêmes entrées ⇒ même sortie (aucun RNG/Date).
 *
 * - instance avec `elements` embarqués (import / objet inline) → priorité aux
 *   éléments (collision lossless : clôtures segments, engins bloquants) ;
 * - sinon prefab connu de `CLUSTERS` → `PlacedCluster{defId}` (collision du cluster) ;
 * - sinon → ignoré.
 * `flipX`/`rotation` de l'instance transforment la scène entière.
 */
export function composedToSiteLayout(layout: StageLayout): SiteLayout {
  const offX = layout.worldSize.width / 2
  const offY = layout.worldSize.height / 2
  const clusters: PlacedCluster[] = []
  const obstacles: Obstacle[] = []
  const slowZones: SurfaceSlowZone[] = []
  const destructibles: DestructibleSpawn[] = []

  for (const inst of layout.instances) {
    const wx = offX + inst.x
    const wy = offY + inst.y
    const flip = inst.flipX
    const rot = inst.rotation
    if (inst.elements !== undefined && inst.elements.length > 0) {
      // Les éléments DESTRUCTIBLES sont routés vers les entités destructibles
      // (PV/casse), PAS vers le décor statique. Le reste est du décor/collision.
      const rad = (rot * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const decorEls: EmbeddedElement[] = []
      for (const e of inst.elements) {
        if (e.destructible !== undefined) {
          const lx = flip ? -e.dx : e.dx
          destructibles.push({
            typeId: e.destructible.typeId,
            x: wx + lx * cos - e.dy * sin,
            y: wy + lx * sin + e.dy * cos
          })
        } else {
          decorEls.push(e)
        }
      }
      if (decorEls.length > 0) {
        const els = decorEls.map(embeddedToClusterElement)
        clusters.push({ defId: inst.prefab, x: wx, y: wy, flipX: flip, rotationDeg: rot, elements: els })
        for (const obs of extractObstacles(wx, wy, els, flip, rot)) {
          obstacles.push(obs)
        }
        slowZones.push(...extractSurfaceSlowZones(wx, wy, els, flip, rot))
      }
    } else if (CLUSTERS[inst.prefab] !== undefined) {
      const cdef = CLUSTERS[inst.prefab] as ClusterDef
      clusters.push({ defId: inst.prefab, x: wx, y: wy, flipX: flip, rotationDeg: rot })
      for (const obs of extractObstacles(wx, wy, cdef.elements, flip, rot)) {
        obstacles.push(obs)
      }
      slowZones.push(...extractSurfaceSlowZones(wx, wy, cdef.elements, flip, rot))
    }
  }

  return { clusters, obstacles, slowZones, destructibles }
}

/**
 * Dispersion programmatique déterministe des destructibles d'un stage (config
 * `DESTRUCTIBLE_SCATTER`). RNG isolé (`seed ^ DESTRUCTIBLE_XOR`) → n'affecte pas
 * la sim. Évite la zone de spawn (rayon `SPAWN_SAFE_R` autour du centre monde).
 * Config vide pour un stage → `[]` (aucun destructible ⇒ `sim:check` diff 0).
 */
export function scatterDestructibles(
  seed: number,
  worldW: number,
  worldH: number,
  stageId: string
): DestructibleSpawn[] {
  const specs = DESTRUCTIBLE_SCATTER[stageId]
  if (specs === undefined || specs.length === 0) {
    return []
  }
  const rng = new Rng((seed ^ DESTRUCTIBLE_XOR) >>> 0)
  const cx = worldW / 2
  const cy = worldH / 2
  const margin = 220
  const out: DestructibleSpawn[] = []
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      let x = margin
      let y = margin
      // Jusqu'à 8 essais pour tomber hors de la zone de spawn.
      for (let tries = 0; tries < 8; tries++) {
        x = margin + rng.float(0, Math.max(1, worldW - 2 * margin))
        y = margin + rng.float(0, Math.max(1, worldH - 2 * margin))
        if ((x - cx) ** 2 + (y - cy) ** 2 >= SPAWN_SAFE_R ** 2) {
          break
        }
      }
      out.push({ typeId: spec.typeId, x, y })
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonction principale
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construit le layout de site (placement des clusters + liste des obstacles absolus)
 * de facon DETERMINISTE : meme (seed, worldW, worldH, stageId) => meme SiteLayout.
 *
 * @param seed    - Seed de la partie (le RNG interne est derive : seed ^ LAYOUT_XOR).
 * @param worldW  - Largeur du monde (px).
 * @param worldH  - Hauteur du monde (px).
 * @param stageId - Identifiant de la phase de chantier (ex. 'terrassement').
 */
/**
 * Point d'entrée PUBLIC : calcule le layout de base (clusters/obstacles) puis
 * ATTACHE les destructibles — ceux de l'éditeur (source de vérité) s'ils
 * existent, sinon le scatter programmatique du stage.
 */
export function buildSiteLayout(
  seed: number,
  worldW: number,
  worldH: number,
  stageId: string
): SiteLayout {
  const base = computeBaseLayout(seed, worldW, worldH, stageId)
  const result: SiteLayout = {
    clusters: base.clusters,
    obstacles: base.obstacles,
    destructibles: base.destructibles ?? scatterDestructibles(seed, worldW, worldH, stageId)
  }
  if (base.slowZones !== undefined) {
    result.slowZones = base.slowZones
  }
  return result
}

function computeBaseLayout(
  seed: number,
  worldW: number,
  worldH: number,
  stageId: string
): SiteLayout {
  // ── Chemin « COMPOSITION ÉDITEUR » (source de vérité, prioritaire) ─────────
  // Si une compo committée existe pour ce stage, elle DÉFINIT les scènes (décor +
  // collision). Pure/déterministe (aucun RNG). Registre vide → null → no-op.
  const composed = resolveComposedLayout(stageId)
  if (composed !== null) {
    const site = composedToSiteLayout(composed)
    // Backdrop procédural : pour un stage PROGRAMMÉ, le rendu dessine toujours les
    // panneaux de clôture des anneaux depuis le plan (siteRenderer.drawPlan). On
    // ré-injecte ici LEURS obstacles pour que la collision de la sim colle aux
    // panneaux visibles (parité sim/rendu). Le déterminisme est préservé.
    if (SITE_PROGRAMS[stageId] !== undefined) {
      const plan = buildSitePlan(seed, worldW, worldH, stageId)
      if (plan !== null) {
        for (const f of plan.fences) {
          site.obstacles.push({ kind: 'segment', x: f.x1, y: f.y1, x2: f.x2, y2: f.y2, thickness: 12, blocks: 'both' })
        }
      }
    }
    return site
  }

  // ── Chemin « PLAN DE CHANTIER » (méthode 6-étapes) ─────────────────────────
  // Les stages avec programme sémantique sont composés depuis le plan masse
  // (zones/portail/chemins/clôtures) — fini le pile-ou-face par cellule.
  if (SITE_PROGRAMS[stageId] !== undefined) {
    const plan = buildSitePlan(seed, worldW, worldH, stageId)
    if (plan !== null) {
      return layoutFromPlan(plan, stageId, seed)
    }
  }

  // ── Chemin LEGACY (stages non migrés — transition) ─────────────────────────
  // Garde : terrain_vierge ou stage sans clusters => layout vide (sim:check diff 0)
  const stageEntries = STAGE_CLUSTERS[stageId]
  if (stageEntries === undefined || stageEntries.length === 0) {
    return { clusters: [], obstacles: [] }
  }

  // RNG ISOLE — derive du seed de la partie, n'affecte PAS le RNG de la sim.
  const rng = new Rng((seed ^ LAYOUT_XOR) >>> 0)

  const spawnX = worldW / 2
  const spawnY = worldH / 2

  // Regrouper les entries par role pour faciliter la selection
  const byRole = new Map<string, typeof stageEntries>()
  for (const entry of stageEntries) {
    const list = byRole.get(entry.role)
    if (list !== undefined) {
      list.push(entry)
    } else {
      byRole.set(entry.role, [entry])
    }
  }

  const placed: PlacedCluster[] = []
  const obstacles: Obstacle[] = []

  // ── 1. Route (bord sud) — ligne continue de tuiles ───────────────────────
  const routeEntry = byRole.get('route')?.[0]
  if (routeEntry !== undefined) {
    const def = CLUSTERS[routeEntry.clusterId]
    if (def !== undefined) {
      const routeY = worldH - ROUTE_BAND / 2
      const tiles = Math.max(1, Math.round(worldW / ROUTE_TILE))
      const step = worldW / tiles
      for (let i = 0; i < tiles; i++) {
        const cx = step * (i + 0.5)
        // Les tuiles route sont intentionnellement adjacentes : pas de tooClose
        placed.push({ defId: def.id, x: cx, y: routeY })
        for (const obs of extractObstacles(cx, routeY, def.elements)) {
          obstacles.push(obs)
        }
      }
    }
  }

  // ── 2. Grille interieure ──────────────────────────────────────────────────
  const interiorH = worldH - ROUTE_BAND
  const colsN = Math.ceil(worldW / CELL)
  const rowsN = Math.ceil(interiorH / CELL)

  for (let row = 0; row < rowsN; row++) {
    for (let col = 0; col < colsN; col++) {
      // Centre de la cellule
      const cellCX = (col + 0.5) * CELL
      const cellCY = (row + 0.5) * CELL

      // Distance a la route (plus grand = plus au nord)
      const d = interiorH - cellCY

      // Role selon distance a la route :
      //   proche route (d <= interiorH * 0.33) => plant / pause
      //   loin (d >= interiorH * 0.66) => excavation
      //   intermediaire => spoil
      let role: string
      if (d >= interiorH * 0.66) {
        role = rng.chance(0.5) ? 'excavation' : 'spoil'
      } else if (d <= interiorH * 0.33) {
        role = rng.chance(0.5) ? 'plant' : 'pause'
      } else {
        role = 'spoil'
      }

      const roleEntries = byRole.get(role)
      if (roleEntries === undefined || roleEntries.length === 0) {
        continue
      }

      // Selection de l'entry (tire au sort si plusieurs)
      const entry =
        roleEntries.length === 1
          ? roleEntries[0]
          : roleEntries[rng.int(0, roleEntries.length - 1)]
      if (entry === undefined) {
        continue
      }

      const def = CLUSTERS[entry.clusterId]
      if (def === undefined) {
        continue
      }

      // Jitter dans la cellule (borne pour rester dans la cellule)
      const jitterRange = Math.max(0, CELL / 2 - def.footprintRadius)
      const cx = cellCX + rng.float(-jitterRange, jitterRange)
      const cy = cellCY + rng.float(-jitterRange, jitterRange)

      // Rejet : trop proche d'une autre ancre OU violation de la zone de spawn
      if (tooClose(cx, cy, placed)) {
        continue
      }
      if (violatesSpawnSafe(cx, cy, def, spawnX, spawnY)) {
        continue
      }

      placed.push({ defId: def.id, x: cx, y: cy })
      for (const obs of extractObstacles(cx, cy, def.elements)) {
        obstacles.push(obs)
      }
    }
  }

  return { clusters: placed, obstacles }
}

// ─────────────────────────────────────────────────────────────────────────────
// Placement « plan de chantier » : prefabs DANS leurs zones + clôtures bloquantes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compose le layout à partir du plan masse : route + portail + clôtures des
 * anneaux (obstacles) + prefabs placés DANS leurs zones selon l'arrangement du
 * programme (front/rangée/répartition/centre/porte). Déterministe (Rng isolé).
 */
function layoutFromPlan(plan: SitePlan, stageId: string, seed: number): SiteLayout {
  const rng = new Rng((seed ^ LAYOUT_XOR) >>> 0)
  const placed: PlacedCluster[] = []
  const obstacles: Obstacle[] = []
  const slowZones: SurfaceSlowZone[] = []
  const program = SITE_PROGRAMS[stageId]

  const push = (def: ClusterDef, x: number, y: number): void => {
    placed.push({ defId: def.id, x, y })
    for (const obs of extractObstacles(x, y, def.elements)) {
      obstacles.push(obs)
    }
    slowZones.push(...extractSurfaceSlowZones(x, y, def.elements))
  }

  // ── 1. Route (bord sud) — identique au legacy (bande continue). ───────────
  const routeDef = CLUSTERS['cluster_route']
  if (routeDef !== undefined) {
    const routeY = plan.worldH - ROUTE_BAND / 2
    const tiles = Math.max(1, Math.round(plan.worldW / ROUTE_TILE))
    const step = plan.worldW / tiles
    for (let i = 0; i < tiles; i++) {
      push(routeDef, step * (i + 0.5), routeY)
    }
  }

  // ── 2. Portail principal (sur la route, LE passage — pas de collision). ───
  const gateDef = CLUSTERS['cluster_gate_main']
  if (gateDef !== undefined) {
    push(gateDef, plan.gate.x, plan.gate.y - 24)
  }

  // ── 3. Clôtures des anneaux : obstacles bloquants (le rendu pose les panneaux). ──
  for (const f of plan.fences) {
    obstacles.push({
      kind: 'segment',
      x: f.x1,
      y: f.y1,
      x2: f.x2,
      y2: f.y2,
      thickness: 12,
      blocks: 'both',
    })
  }

  // Spawn (centre monde) : rayon dégagé où AUCUN prefab n'est posé — le joueur
  // démarre dans une poche libre même si la zone signature l'englobe.
  const spawnX = plan.worldW / 2
  const spawnY = plan.worldH / 2
  const SPAWN_PREFAB_CLEAR = 340

  // ── 4. Prefabs par zone, selon l'arrangement du programme. ─────────────────
  for (const zone of plan.zones) {
    const spec = program?.zones.find((z) => z.id === zone.id)
    const prefabs = spec?.prefabs ?? []
    /** Positions déjà posées DANS cette zone (anti-collage, toutes familles). */
    const zonePlaced: Array<{ x: number; y: number; r: number }> = []

    const tryPlace = (def: ClusterDef, x: number, y: number, ignoreSpawnClear = false): boolean => {
      // Clamp dans la zone (marge = encombrement du prefab).
      const m = def.footprintRadius + 40
      const px = Math.min(Math.max(x, zone.cx - zone.halfW + m), zone.cx + zone.halfW - m)
      const py = Math.min(Math.max(y, zone.cy - zone.halfH + m), zone.cy + zone.halfH - m)
      // Jamais sur la poche de spawn (le joueur ne démarre pas dans un trou).
      // La scène ANCRE (anchor_spawn) est volontairement proche → poche réduite
      // (juste de quoi ne pas naître dans la fosse), les autres restent au large.
      const clear = ignoreSpawnClear ? 210 : SPAWN_PREFAB_CLEAR + def.footprintRadius
      if (Math.hypot(px - spawnX, py - spawnY) < clear) {
        return false
      }
      // Jamais deux prefabs collés (règle « deux pelleteuses ») — et jamais
      // en-dessous de l'invariant global MIN_GAP entre ancres de clusters.
      for (const p of zonePlaced) {
        const minSep = Math.max(p.r + def.footprintRadius + 120, MIN_GAP)
        if (Math.hypot(px - p.x, py - p.y) < minSep) {
          return false
        }
      }
      // Laisse la porte dégagée (circulation).
      if (Math.hypot(px - zone.door.x, py - zone.door.y) < def.footprintRadius + 220) {
        return false
      }
      zonePlaced.push({ x: px, y: py, r: def.footprintRadius })
      push(def, px, py)
      return true
    }

    for (const pf of prefabs) {
      const def = CLUSTERS[pf.clusterId]
      if (def === undefined) {
        continue
      }
      placePrefab(pf, def, zone, rng, tryPlace)
    }
  }

  return { clusters: placed, obstacles, slowZones }
}

/** Place `count` exemplaires d'un prefab dans la zone selon l'arrangement. */
function placePrefab(
  pf: ZonePrefab,
  def: ClusterDef,
  zone: PlacedZone,
  rng: Rng,
  tryPlace: (def: ClusterDef, x: number, y: number, ignoreSpawnClear?: boolean) => boolean
): void {
  const m = def.footprintRadius + 60
  switch (pf.arrangement) {
    case 'front_north': {
      // L'engin AU FRONT : bord nord intérieur (là où on creuse).
      for (let i = 0; i < pf.count; i++) {
        const x = zone.cx + rng.float(-0.25, 0.25) * zone.halfW
        const y = zone.cy - zone.halfH + def.footprintRadius + 70
        tryPlace(def, x, y)
      }
      return
    }
    case 'row': {
      // Alignés au cordeau le long du grand axe.
      const alongX = zone.halfW >= zone.halfH
      const half = (alongX ? zone.halfW : zone.halfH) - m
      for (let i = 0; i < pf.count; i++) {
        const t = pf.count === 1 ? 0 : -half + ((2 * half) / (pf.count - 1)) * i
        const jitter = rng.float(-35, 35)
        const x = alongX ? zone.cx + t : zone.cx + jitter
        const y = alongX ? zone.cy + jitter : zone.cy + t
        tryPlace(def, x, y)
      }
      return
    }
    case 'scatter': {
      // Répartis avec espacement garanti (12 essais par exemplaire).
      for (let i = 0; i < pf.count; i++) {
        for (let t = 0; t < 12; t++) {
          const x = rng.float(zone.cx - zone.halfW + m, zone.cx + zone.halfW - m)
          const y = rng.float(zone.cy - zone.halfH + m, zone.cy + zone.halfH - m)
          if (tryPlace(def, x, y)) {
            break
          }
        }
      }
      return
    }
    case 'center': {
      for (let i = 0; i < pf.count; i++) {
        tryPlace(def, zone.cx + rng.float(-40, 40), zone.cy + rng.float(-40, 40))
      }
      return
    }
    case 'at_door': {
      // Côté intérieur de la porte (rampe/accès), tiré vers le centre.
      // Replis à distances croissantes si la place est prise (MIN_GAP).
      const dx = zone.cx - zone.door.x
      const dy = zone.cy - zone.door.y
      const len = Math.hypot(dx, dy)
      const ux = len > 0 ? dx / len : 0
      const uy = len > 0 ? dy / len : 1
      for (let i = 0; i < pf.count; i++) {
        for (let t = 0; t < 4; t++) {
          const d = def.footprintRadius + 320 + (i * 2 + t) * 240
          if (tryPlace(def, zone.door.x + ux * d, zone.door.y + uy * d)) {
            break
          }
        }
      }
      return
    }
    case 'anchor_spawn': {
      // Juste au NORD du spawn (la zone signature est centrée dessus) — le trou
      // (origine de la scène dédiée) tombe à ~270 px du joueur, la pelleteuse au
      // bord nord du trou reste dans le cadre au démarrage. On IGNORE le
      // spawn-clear générique (poche réduite : la scène dédiée n'a AUCUN
      // collidable côté joueur, cf. scene_dig_active_spawn).
      const rad = pf.clusterId === 'scene_foundation_pour_spawn' ? 220 : 270
      for (let i = 0; i < pf.count; i++) {
        tryPlace(def, zone.cx, zone.cy - rad, true)
      }
      return
    }
  }
}
