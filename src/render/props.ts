import Phaser from 'phaser'
import type { StageGeometry } from '@render/stages'

/** Un type de prop décoratif à disperser dans le monde. */
export interface PropDef {
  /** Clé de texture (chargée en preload). */
  key: string
  /** Échelle de rendu. */
  scale: number
  /** Nombre d'exemplaires dispersés. */
  count: number
}

/** PRNG seedé (mulberry32) — placement reproductible. */
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
 * Sel déterministe dérivé de l'id de phase (FNV-1a 32 bits). Mélangé à la seed de run
 * → chaque stage a une disposition de décor DIFFÉRENTE (fini les positions identiques
 * d'un stage à l'autre), tout en restant reproductible.
 */
export function phaseSalt(phaseId: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < phaseId.length; i++) {
    h ^= phaseId.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Bande de placement d'une structure : anneau de distance au centre du monde. */
export type StructureBand = 'near' | 'mid' | 'periphery'

/** Une grande pièce structurelle qui remplit l'arène (dérive de PropDef + bande). */
export interface StructureDef extends PropDef {
  band: StructureBand
}

/** Rayon central laissé LIBRE de grosses structures opaques (lisibilité du combat). */
const CENTER_CLEAR = 260

const BANDS: Record<StructureBand, readonly [number, number]> = {
  // « near » : juste au bord du rayon central dégagé → l'élément-héro est PRÉSENT
  // dans l'anneau de jeu (visible en permanence), pas seulement à l'horizon.
  near: [320, 500],
  mid: [CENTER_CLEAR, 720],
  periphery: [560, 820]
}

/**
 * Un cercle d'exclusion : tout décor posé à moins de `r` du point (x, y) est interdit.
 * Utilisé pour : centre du monde, positions de prisonniers, décors déjà posés.
 *
 * Rayons forfaitaires documentés :
 *   - centre monde (spawn) : r = CENTER_CLEAR = 260 px
 *   - prisonnier (cage ~40px rayon) : r = 80 px (inclut marge de lisibilité)
 *   - structure « near » / landmark : r = scale × 96 px (demi-frame 192 px)
 *   - PNJ ambiance : r = scale × 64 px (personnage compact)
 */
export interface ExclusionCircle {
  x: number
  y: number
  /** Rayon de dégagement : distance min entre CENTRES pour que l'item soit accepté. */
  r: number
}

/** Nombre de candidats de dart-throwing avant d'accepter le meilleur. */
const DART_CANDIDATES = 12

/**
 * Résout la position finale d'un décor en conservant l'ANGLE scripté mais en
 * choisissant la meilleure DISTANCE (+ petit jitter d'angle ±10°) parmi
 * `DART_CANDIDATES` candidats seedés, afin d'éviter toutes les exclusions.
 *
 * Algorithme (déterministe — `rng` doit être le mulberry32 du caller) :
 *  1. Génère `DART_CANDIDATES` (distance, jitterAngle) depuis `rng`.
 *  2. Calcule la position candidate ; vérifie le dégagement vs toutes les exclusions.
 *  3. Retourne le 1er candidat sans conflit ; sinon le candidat avec le meilleur
 *     dégagement minimum (max-min-clearance), pour que la distance scriptée soit
 *     respectée dans la mesure du possible.
 *
 * @param angleDeg  Angle scripté (degrés, 0 = Est, trigo).
 * @param distMin   Borne inférieure de la bande de distance.
 * @param distMax   Borne supérieure de la bande de distance.
 * @param cx        Coordonnée X du centre du monde.
 * @param cy        Coordonnée Y du centre du monde.
 * @param worldW    Largeur du monde (pour clamp).
 * @param worldH    Hauteur du monde (pour clamp).
 * @param margin    Marge de bord monde (px).
 * @param exclusions  Liste des cercles d'exclusion à éviter.
 * @param placed    Liste des décors déjà posés (accumulée par l'appelant).
 * @param itemRadius  Rayon forfaitaire du décor à placer (pour le dégagement).
 * @param rng       Générateur PRNG seedé (mulberry32 du caller).
 */
export function resolvePlacement(
  angleDeg: number,
  distMin: number,
  distMax: number,
  cx: number,
  cy: number,
  worldW: number,
  worldH: number,
  margin: number,
  exclusions: readonly ExclusionCircle[],
  placed: readonly ExclusionCircle[],
  itemRadius: number,
  rng: () => number
): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180
  // Jitter maximal d'angle (±10°).
  const MAX_JITTER_RAD = (10 * Math.PI) / 180

  let bestX = 0
  let bestY = 0
  let bestMinClearance = -Infinity

  for (let c = 0; c < DART_CANDIDATES; c++) {
    // Candidat : distance dans la bande + jitter d'angle.
    const dist = distMin + rng() * (distMax - distMin)
    const jitter = (rng() * 2 - 1) * MAX_JITTER_RAD
    const a = angleRad + jitter
    const x = Math.min(worldW - margin, Math.max(margin, cx + Math.cos(a) * dist))
    const y = Math.min(worldH - margin, Math.max(margin, cy + Math.sin(a) * dist))

    // Dégagement minimum vis-à-vis de toutes les exclusions + décors déjà posés.
    let minClearance = Infinity
    for (const ex of exclusions) {
      const d = Math.hypot(x - ex.x, y - ex.y) - ex.r - itemRadius
      if (d < minClearance) { minClearance = d }
    }
    for (const pl of placed) {
      const d = Math.hypot(x - pl.x, y - pl.y) - pl.r - itemRadius
      if (d < minClearance) { minClearance = d }
    }

    if (minClearance > bestMinClearance) {
      bestMinClearance = minClearance
      bestX = x
      bestY = y
    }
  }

  return { x: bestX, y: bestY }
}

/**
 * Pose un grand LANDMARK de bâtiment (la structure à cette phase) à une position
 * seedée hors du centre — visible autour du combat, décoratif et non bloquant.
 * Sprite individuel au-dessus des props épars (depth -4). Déterministe.
 *
 * Si `geometry.landmarkAngle` est fourni (degrés), l'angle est fixe → la
 * géographie du stage est reconnaissable. Sinon repli RNG.
 *
 * @param exclusions  Cercles d'exclusion initiaux (centre du monde, prisonniers…).
 *                    La fonction y AJOUTE chaque landmark posé pour que les appelants
 *                    suivants (PNJ ambiance) les évitent.
 */
export function createLandmark(
  scene: Phaser.Scene,
  worldW: number,
  worldH: number,
  landmark: PropDef,
  seed = 1,
  geometry?: StageGeometry,
  exclusions?: ExclusionCircle[],
  placed?: ExclusionCircle[]
): void {
  if (!scene.textures.exists(landmark.key)) {
    return
  }
  const rng = mulberry32((seed ^ 0x1b56c4e9) >>> 0)
  const cx = worldW / 2
  const cy = worldH / 2

  // Rayon forfaitaire du landmark : demi-frame 192 px × scale, arrondi.
  const landmarkRadius = Math.round(landmark.scale * 96)

  // Bande de placement du landmark (ancrage périphérique original ~500-620 px).
  const LANDMARK_DIST_MIN = 500
  const LANDMARK_DIST_MAX = 620

  for (let i = 0; i < Math.max(1, landmark.count); i++) {
    // Angle fixe si geometry.landmarkAngle est défini ; sinon RNG.
    const angleDeg =
      geometry?.landmarkAngle !== undefined
        ? geometry.landmarkAngle
        : rng() * 360
    // Consomme un RNG si angle fixe pour maintenir la parité de la séquence RNG.
    if (geometry?.landmarkAngle === undefined) {
      // angle already consumed rng() above
    } else {
      rng() // consomme une valeur pour rester cohérent avec l'ancienne séquence RNG
    }

    let x: number
    let y: number

    if (exclusions !== undefined && placed !== undefined) {
      // Dart-throwing déterministe : préserve l'angle, ajuste la distance/jitter.
      const pos = resolvePlacement(
        angleDeg,
        LANDMARK_DIST_MIN,
        LANDMARK_DIST_MAX,
        cx, cy, worldW, worldH, 60,
        exclusions, placed, landmarkRadius, rng
      )
      x = pos.x
      y = pos.y
      // Accumule pour les appelants suivants.
      placed.push({ x, y, r: landmarkRadius })
    } else {
      // Ancien comportement sans exclusions (rétrocompatibilité).
      const angleRad = (angleDeg * Math.PI) / 180
      const dist = LANDMARK_DIST_MIN + rng() * (LANDMARK_DIST_MAX - LANDMARK_DIST_MIN)
      x = Math.min(worldW - 60, Math.max(60, cx + Math.cos(angleRad) * dist))
      y = Math.min(worldH - 60, Math.max(60, cy + Math.sin(angleRad) * dist))
    }

    scene.add.image(x, y, landmark.key).setScale(landmark.scale).setDepth(-4)
  }
}

/**
 * Pose les grandes STRUCTURES d'un stage (l'étape de chantier qui remplit l'arène) à
 * des positions seedées DISTINCTES dans leur bande, hors du rayon central dégagé.
 * Sprites individuels au-dessus des props, sous le landmark hero (depth -5).
 * Purement visuel et déterministe.
 *
 * Si `geometry.structureAngles` est fourni, chaque structure reçoit l'angle fixe
 * correspondant (index global sur toutes les instances de toutes les defs, pas
 * par def). Repli RNG si absent ou si l'index dépasse le tableau.
 *
 * @param exclusions  Cercles d'exclusion initiaux (centre du monde, prisonniers…).
 *                    La fonction y AJOUTE chaque structure posée pour que les suivantes
 *                    (landmark, PNJ) les évitent.
 */
export function createStructures(
  scene: Phaser.Scene,
  worldW: number,
  worldH: number,
  structures: readonly StructureDef[],
  seed = 1,
  geometry?: StageGeometry,
  exclusions?: ExclusionCircle[],
  placed?: ExclusionCircle[]
): void {
  const rng = mulberry32((seed ^ 0x53a9f0b1) >>> 0)
  const cx = worldW / 2
  const cy = worldH / 2
  let globalIdx = 0
  for (const def of structures) {
    // Rayon forfaitaire de la structure : demi-frame 192 px × scale, arrondi.
    const structRadius = Math.round(def.scale * 96)

    if (!scene.textures.exists(def.key)) {
      // Avance le RNG autant qu'il aurait été consommé pour rester déterministe.
      for (let i = 0; i < Math.max(1, def.count); i++) {
        if (exclusions !== undefined) {
          // dart-throwing: 2 RNG par candidat × DART_CANDIDATES + 1 angle RNG
          rng() // angle
          for (let c = 0; c < DART_CANDIDATES; c++) { rng(); rng() }
        } else {
          rng(); rng()
        }
        globalIdx++
      }
      continue
    }
    const [dmin, dmax] = BANDS[def.band]
    for (let i = 0; i < Math.max(1, def.count); i++) {
      const fixedAngleDeg = geometry?.structureAngles?.[globalIdx]
      const angleDeg =
        fixedAngleDeg !== undefined
          ? fixedAngleDeg
          : rng() * 360
      // Consomme un RNG si angle fixe pour maintenir la parité de la séquence RNG.
      if (fixedAngleDeg === undefined) {
        // angle already consumed rng() above
      } else {
        rng()
      }

      let x: number
      let y: number

      if (exclusions !== undefined && placed !== undefined) {
        // Dart-throwing déterministe.
        const pos = resolvePlacement(
          angleDeg, dmin, dmax,
          cx, cy, worldW, worldH, 40,
          exclusions, placed, structRadius, rng
        )
        x = pos.x
        y = pos.y
        // Accumule pour les suivants.
        placed.push({ x, y, r: structRadius })
      } else {
        // Ancien comportement sans exclusions (rétrocompatibilité).
        const angleRad = (angleDeg * Math.PI) / 180
        const dist = dmin + rng() * (dmax - dmin)
        x = Math.min(worldW - 40, Math.max(40, cx + Math.cos(angleRad) * dist))
        y = Math.min(worldH - 40, Math.max(40, cy + Math.sin(angleRad) * dist))
      }

      scene.add.image(x, y, def.key).setScale(def.scale).setDepth(-5)
      globalIdx++
    }
  }
}
