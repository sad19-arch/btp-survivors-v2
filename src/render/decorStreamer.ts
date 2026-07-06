import Phaser from 'phaser'
import type { PropDef } from '@render/props'
import type { DecorZone } from '@render/stages'

/**
 * Taille par défaut d'un chunk de streaming (px). Doit être un multiple commun
 * des tailles de monde pour que les chunks s'alignent proprement.
 */
export const DEFAULT_CHUNK_SIZE = 1024

/** Centre autour duquel aucun décalque/prop n'est émis (spawn joueur). */
const CENTER_EXCLUSION_RADIUS = 300

/**
 * Dégagement min entre le CENTRE d'un prop streamé et le bord d'une ancre de
 * structure (engin/landmark/PNJ). Empêche les props de se poser SUR les héros.
 */
const PROP_ANCHOR_CLEAR = 60
/** Distance min entre les centres de deux props streamés d'un même chunk. */
const PROP_MIN_SPACING = 92

/** PRNG seedé (mulberry32) — identique à ground.ts / props.ts pour cohérence. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) >>> 0
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Hash de chunk déterministe — combine seed de run, coordonnée x et y du chunk
 * (valeurs entières) en un entier 32 bits. Garantit qu'un chunk revisité produit
 * EXACTEMENT le même contenu (pas de pop-in incohérent).
 * Algorithme : deux rondes de FNV-1a 32 bits XOR-folded.
 */
export function chunkHash(seed: number, cx: number, cy: number): number {
  let h = (seed ^ 0x811c9dc5) >>> 0
  // Fold cx
  const cxBytes = cx & 0xffffffff
  h ^= cxBytes & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  h ^= (cxBytes >>> 8) & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  h ^= (cxBytes >>> 16) & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  h ^= (cxBytes >>> 24) & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  // Fold cy
  const cyBytes = cy & 0xffffffff
  h ^= cyBytes & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  h ^= (cyBytes >>> 8) & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  h ^= (cyBytes >>> 16) & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  h ^= (cyBytes >>> 24) & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  return h >>> 0
}

/** Rectangle (gauche, haut, largeur, hauteur) — iso Phaser.Geom.Rectangle pour les tests purs. */
export interface ViewRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Calcule l'ensemble des clés de chunks ("cx,cy") couvrant `view` **+ `margin`
 * chunks de marge de chaque côté**, bornés au monde `[0,worldW] × [0,worldH]`.
 * Fonction PURE, sans Phaser — testable en Vitest/happy-dom.
 *
 * @param view      Rectangle visible de la caméra (worldView).
 * @param chunkSize Taille d'un chunk en px.
 * @param margin    Nombre de chunks de marge au-delà de la vue (≥ 0).
 * @param worldW    Largeur totale du monde en px.
 * @param worldH    Hauteur totale du monde en px.
 */
export function chunksForView(
  view: ViewRect,
  chunkSize: number,
  margin: number,
  worldW: number,
  worldH: number
): Set<string> {
  const cxMin = Math.max(0, Math.floor(view.x / chunkSize) - margin)
  const cxMax = Math.min(
    Math.ceil(worldW / chunkSize) - 1,
    Math.floor((view.x + view.width) / chunkSize) + margin
  )
  const cyMin = Math.max(0, Math.floor(view.y / chunkSize) - margin)
  const cyMax = Math.min(
    Math.ceil(worldH / chunkSize) - 1,
    Math.floor((view.y + view.height) / chunkSize) + margin
  )

  const result = new Set<string>()
  for (let cx = cxMin; cx <= cxMax; cx++) {
    for (let cy = cyMin; cy <= cyMax; cy++) {
      result.add(`${cx},${cy}`)
    }
  }
  return result
}

/**
 * Détermine si un point (x, y) mondial tombe dans une `DecorZone`.
 * Retourne la zone si oui, null sinon. Fonction PURE (pas de RNG).
 */
function pointInZone(
  x: number,
  y: number,
  worldCx: number,
  worldCy: number,
  zones: readonly DecorZone[]
): DecorZone | null {
  const dx = x - worldCx
  const dy = y - worldCy
  const dist = Math.sqrt(dx * dx + dy * dy)
  // Angle en degrés (0=Est, croissant sens horaire en +y↓)
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  for (const z of zones) {
    if (dist < z.distMin || dist > z.distMax) {
      continue
    }
    // Différence angulaire (normalisée dans [−180,180])
    let diff = ((angleDeg - z.angleCenter) % 360 + 360) % 360
    if (diff > 180) { diff -= 360 }
    if (Math.abs(diff) <= z.angleSpread) {
      return z
    }
  }
  return null
}

/**
 * Calcule les placements de décalques et de props pour un chunk donné.
 * Retourne deux tableaux de positions — AUCUN objet Phaser créé ici.
 * Fonction PURE, testable sans Phaser.
 *
 * @param seed      Seed de run.
 * @param cx        Indice X du chunk.
 * @param cy        Indice Y du chunk.
 * @param chunkSize Taille d'un chunk en px.
 * @param worldW    Largeur totale du monde.
 * @param worldH    Hauteur totale du monde.
 * @param decalCount Nombre de textures décalques disponibles.
 * @param propCounts Nombre d'exemplaires par PropDef (dans l'ordre).
 * @param opts      Options de composition optionnelles (zones, densité).
 */
export function chunkPlacements(
  seed: number,
  cx: number,
  cy: number,
  chunkSize: number,
  worldW: number,
  worldH: number,
  decalCount: number,
  propCounts: readonly number[],
  opts?: {
    zones?: readonly DecorZone[]
    decalDensityMultiplier?: number
    /** Positions/rayons des structures/landmark/PNJ à éviter (anti-chevauchement props). */
    structureAnchors?: readonly { x: number; y: number; r: number }[]
  }
): {
  decals: Array<{ decalIndex: number; x: number; y: number }>
  props: Array<Array<{ x: number; y: number }>>
} {
  const rng = mulberry32(chunkHash(seed, cx, cy))

  const x0 = cx * chunkSize
  const y0 = cy * chunkSize
  const x1 = Math.min(x0 + chunkSize, worldW)
  const y1 = Math.min(y0 + chunkSize, worldH)
  const chunkW = x1 - x0
  const chunkH = y1 - y0
  const chunkArea = chunkW * chunkH

  const worldCx = worldW / 2
  const worldCy = worldH / 2
  const excl2 = CENTER_EXCLUSION_RADIUS * CENTER_EXCLUSION_RADIUS

  const zones = opts?.zones
  const densityMul = opts?.decalDensityMultiplier ?? 1.0

  // ── Décalques ──────────────────────────────────────────────────────────────
  const decalResult: Array<{ decalIndex: number; x: number; y: number }> = []
  if (decalCount > 0) {
    const decalTotal = Math.max(0, Math.round(chunkArea / (260 * 260) * densityMul))
    for (let i = 0; i < decalTotal; i++) {
      const x = x0 + rng() * chunkW
      const y = y0 + rng() * chunkH
      const dx = x - worldCx
      const dy = y - worldCy
      if (dx * dx + dy * dy < excl2) {
        // Consomme le RNG du choix d'indice pour rester déterministe malgré le skip.
        rng()
        continue
      }
      // Choisir l'indice : priorité aux décalques dominants de la zone si applicable.
      let decalIndex: number
      const zone = zones !== undefined ? pointInZone(x, y, worldCx, worldCy, zones) : null
      const dominant = zone?.dominantDecalIndices
      if (dominant !== undefined && dominant.length > 0) {
        // 70 % de chance de choisir un indice dominant, 30 % uniforme.
        const r = rng()
        if (r < 0.7) {
          decalIndex = dominant[Math.floor(rng() * dominant.length)] ?? 0
        } else {
          decalIndex = Math.floor(rng() * decalCount)
        }
      } else {
        decalIndex = Math.floor(rng() * decalCount)
      }
      decalResult.push({ decalIndex, x, y })
    }
  }

  // ── Props ──────────────────────────────────────────────────────────────────
  const refArea = 1600 * 1200
  const anchors = opts?.structureAnchors
  // Props déjà posés dans CE chunk (tous types confondus) → espacement mutuel.
  const placedProps: Array<{ x: number; y: number }> = []
  const propResult: Array<Array<{ x: number; y: number }>> = propCounts.map((baseCount, propIdx) => {
    const count = Math.max(0, Math.round(baseCount * chunkArea / refArea))
    const positions: Array<{ x: number; y: number }> = []
    for (let i = 0; i < count; i++) {
      let px = 0
      let py = 0
      for (let t = 0; t < 12; t++) {
        px = x0 + rng() * chunkW
        py = y0 + rng() * chunkH
        const dx = px - worldCx
        const dy = py - worldCy
        if (dx * dx + dy * dy >= excl2) {
          break
        }
      }
      // Si les 12 tentatives sont retombées dans le rayon d'exclusion (possible
      // pour le chunk central), on NE pose PAS le prop plutôt que d'encombrer le
      // spawn — symétrique du `continue` des décalques. Le count cible est
      // approximatif, et les appels RNG déjà consommés gardent le déterminisme.
      const fdx = px - worldCx
      const fdy = py - worldCy
      if (fdx * fdx + fdy * fdy < excl2) {
        continue
      }
      // Si zones définies et que ce prop n'est pas dominant dans la zone de ce point,
      // on réduit la probabilité de le placer (50 % de chance de skip).
      if (zones !== undefined && zones.length > 0) {
        const zone = pointInZone(px, py, worldCx, worldCy, zones)
        if (zone !== null) {
          const isDominant = zone.dominantPropIndices?.includes(propIdx) ?? false
          // Dans une zone : les props dominants passent toujours ; les autres ont 40 % de chance.
          if (!isDominant && rng() > 0.4) {
            continue
          }
        }
      }
      // Anti-chevauchement : si des ancres de structures sont fournies, on écarte
      // les props qui tomberaient SUR un engin/landmark/PNJ ou trop près d'un autre
      // prop déjà posé. AUCUN appel RNG ici → la séquence RNG est IDENTIQUE au chemin
      // sans ancres (les tests de déterminisme existants restent verts ; seuls des
      // props chevauchants sont retirés de la sortie quand `structureAnchors` est passé).
      if (anchors !== undefined) {
        let overlap = false
        for (const a of anchors) {
          if (Math.hypot(px - a.x, py - a.y) < a.r + PROP_ANCHOR_CLEAR) { overlap = true; break }
        }
        if (!overlap) {
          for (const pp of placedProps) {
            if (Math.hypot(px - pp.x, py - pp.y) < PROP_MIN_SPACING) { overlap = true; break }
          }
        }
        if (overlap) { continue }
        placedProps.push({ x: px, y: py })
      }
      positions.push({ x: px, y: py })
    }
    return positions
  })

  return { decals: decalResult, props: propResult }
}

/**
 * Positions des COLONNES intérieures pour un chunk : grille alignée sur le monde
 * (multiples de `spacing`), hors du rayon d'exclusion central (spawn) et à l'écart
 * des ancres de structures/héros. PURE et déterministe (AUCUN RNG → une grille
 * régulière, reproductible). Rend l'ambiance « intérieur de bâtiment » (05→10).
 */
export function columnGridForChunk(
  cx: number,
  cy: number,
  chunkSize: number,
  worldW: number,
  worldH: number,
  spacing: number,
  anchors?: readonly { x: number; y: number; r: number }[]
): Array<{ x: number; y: number }> {
  const x0 = cx * chunkSize
  const y0 = cy * chunkSize
  const x1 = Math.min(x0 + chunkSize, worldW)
  const y1 = Math.min(y0 + chunkSize, worldH)
  const worldCx = worldW / 2
  const worldCy = worldH / 2
  // Marge autour du spawn : rayon central + un peu, pour ne pas planter une colonne
  // sur le joueur au départ.
  const exclR = CENTER_EXCLUSION_RADIUS + 40
  const excl2 = exclR * exclR
  const out: Array<{ x: number; y: number }> = []
  if (spacing <= 0) { return out }
  const gxMin = Math.ceil(x0 / spacing)
  const gxMax = Math.floor((x1 - 1) / spacing)
  const gyMin = Math.ceil(y0 / spacing)
  const gyMax = Math.floor((y1 - 1) / spacing)
  for (let gx = gxMin; gx <= gxMax; gx++) {
    for (let gy = gyMin; gy <= gyMax; gy++) {
      const px = gx * spacing
      const py = gy * spacing
      const dx = px - worldCx
      const dy = py - worldCy
      if (dx * dx + dy * dy < excl2) { continue }
      // Écarte les colonnes des engins/héros (mêmes ancres que les props).
      let blocked = false
      if (anchors !== undefined) {
        for (const a of anchors) {
          if (Math.hypot(px - a.x, py - a.y) < a.r + 70) { blocked = true; break }
        }
      }
      if (blocked) { continue }
      out.push({ x: px, y: py })
    }
  }
  return out
}

export interface DecorStreamerOpts {
  chunkSize: number
  seed: number
  decals: readonly string[]
  props: readonly PropDef[]
  /** Zones de clustering thématique (optionnel — repli uniforme si absent). */
  zones?: readonly DecorZone[]
  /** Multiplicateur de densité des décalques (défaut 1.0). */
  decalDensityMultiplier?: number
  /** Positions/rayons des structures/landmark/PNJ à éviter (anti-chevauchement props). */
  structureAnchors?: readonly { x: number; y: number; r: number }[]
  /** Grille de colonnes intérieures (ambiance « dans le bâtiment », phases 05→10). */
  interiorColumns?: {
    key: string
    spacing: number
    scale: number
  }
}

/**
 * Streamer de décor par chunks : génère décalques + props AUTOUR de la caméra
 * et détruit ceux qui s'éloignent. Coût constant quelle que soit la taille du
 * monde (≈ 16 chunks chargés à la fois). Purement visuel, observer-only.
 *
 * Déterminisme garanti : le contenu d'un chunk est seedé par `(seed, cx, cy)`
 * → un chunk revisité est IDENTIQUE (pas de pop-in incohérent).
 */
export class DecorStreamer {
  private readonly scene: Phaser.Scene
  private readonly worldW: number
  private readonly worldH: number
  private readonly opts: DecorStreamerOpts
  /** Objets de décor par chunk, indexés par clé "cx,cy". */
  private readonly chunks = new Map<string, Phaser.GameObjects.GameObject[]>()

  constructor(scene: Phaser.Scene, worldW: number, worldH: number, opts: DecorStreamerOpts) {
    this.scene = scene
    this.worldW = worldW
    this.worldH = worldH
    this.opts = opts
  }

  /**
   * À appeler dans `update()` de la GameScene. Calcule les chunks visibles
   * + 1 chunk de marge, charge les manquants, détruit ceux hors zone.
   *
   * Le throttle (appel toutes les N frames) est géré côté appelant si besoin ;
   * cette méthode reste idempotente (ne recharge pas un chunk déjà chargé).
   */
  update(camera: Phaser.Cameras.Scene2D.Camera): void {
    const view = camera.worldView
    const needed = chunksForView(
      { x: view.x, y: view.y, width: view.width, height: view.height },
      this.opts.chunkSize,
      1,
      this.worldW,
      this.worldH
    )

    // Charger les chunks manquants.
    for (const key of needed) {
      if (!this.chunks.has(key)) {
        this.loadChunk(key)
      }
    }

    // Détruire les chunks hors marge.
    for (const [key, objs] of this.chunks) {
      if (!needed.has(key)) {
        for (const obj of objs) {
          obj.destroy()
        }
        this.chunks.delete(key)
      }
    }
  }

  /** Détruit tous les chunks chargés (à appeler dans `resetRunState`). */
  clear(): void {
    for (const objs of this.chunks.values()) {
      for (const obj of objs) {
        obj.destroy()
      }
    }
    this.chunks.clear()
  }

  /** Nombre de chunks actuellement chargés (utile pour les tests). */
  get loadedChunkCount(): number {
    return this.chunks.size
  }

  /** Nombre total d'objets de décor actuellement actifs. */
  get decorObjectCount(): number {
    let total = 0
    for (const objs of this.chunks.values()) {
      total += objs.length
    }
    return total
  }

  private loadChunk(key: string): void {
    const parts = key.split(',')
    const cx = parseInt(parts[0] ?? '0', 10)
    const cy = parseInt(parts[1] ?? '0', 10)

    const placementOpts: {
      zones?: readonly DecorZone[]
      decalDensityMultiplier?: number
      structureAnchors?: readonly { x: number; y: number; r: number }[]
    } = {}
    if (this.opts.zones !== undefined) {
      placementOpts.zones = this.opts.zones
    }
    if (this.opts.decalDensityMultiplier !== undefined) {
      placementOpts.decalDensityMultiplier = this.opts.decalDensityMultiplier
    }
    if (this.opts.structureAnchors !== undefined) {
      placementOpts.structureAnchors = this.opts.structureAnchors
    }
    const { decals: decalPlacements, props: propPlacements } = chunkPlacements(
      this.opts.seed,
      cx,
      cy,
      this.opts.chunkSize,
      this.worldW,
      this.worldH,
      this.opts.decals.length,
      this.opts.props.map((p) => p.count),
      placementOpts
    )

    const objs: Phaser.GameObjects.GameObject[] = []

    // Décalques (depth -9, identique à l'ancienne boucle ground.ts).
    for (const { decalIndex, x, y } of decalPlacements) {
      const texKey = this.opts.decals[decalIndex]
      if (texKey === undefined || !this.scene.textures.exists(texKey)) {
        continue
      }
      const img = this.scene.add.image(x, y, texKey).setOrigin(0.5, 0.5).setDepth(-9)
      objs.push(img)
    }

    // Props (depth -6, identique à props.ts).
    for (let pi = 0; pi < this.opts.props.length; pi++) {
      const def = this.opts.props[pi]
      if (def === undefined || !this.scene.textures.exists(def.key)) {
        continue
      }
      const positions = propPlacements[pi]
      if (positions === undefined) {
        continue
      }
      for (const { x, y } of positions) {
        const img = this.scene.add.image(x, y, def.key).setScale(def.scale).setDepth(-6)
        objs.push(img)
      }
    }

    // Colonnes intérieures (grille, depth -3 = au-dessus du décor, SOUS les entités
    // → lisibilité du combat préservée). Ambiance « dans le bâtiment » (05→10).
    const ic = this.opts.interiorColumns
    if (ic !== undefined && this.scene.textures.exists(ic.key)) {
      const cols = columnGridForChunk(
        cx, cy, this.opts.chunkSize, this.worldW, this.worldH, ic.spacing, this.opts.structureAnchors
      )
      for (const { x, y } of cols) {
        const img = this.scene.add.image(x, y, ic.key).setScale(ic.scale).setDepth(-3)
        objs.push(img)
      }
    }

    this.chunks.set(key, objs)
  }
}
