import Phaser from 'phaser'

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

/** Rayon d'exclusion autour du spawn (centre du monde) pour ne pas gêner le départ. */
const CENTER_EXCLUSION = 300

/**
 * Disperse des props décoratifs STATIQUES à des positions seedées, cuits dans une
 * RenderTexture placée au-dessus du sol mais sous les entités (depth -5). Évite la
 * zone centrale (spawn joueur). Purement visuel et déterministe — n'affecte pas la
 * simulation.
 */
export function createProps(
  scene: Phaser.Scene,
  worldW: number,
  worldH: number,
  props: readonly PropDef[],
  seed = 1
): void {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const cx = worldW / 2
  const cy = worldH / 2
  // Densité par surface CONSTANTE : les `count` sont calibrés pour 1600×1200 ;
  // sur un monde plus grand, on met plus d'exemplaires (dispersés sur toute la
  // surface) pour ne pas paraître vide. Cuit dans la RT → aucun coût runtime.
  const areaFactor = (worldW * worldH) / (1600 * 1200)
  for (const def of props) {
    if (!scene.textures.exists(def.key)) {
      continue
    }
    const count = Math.max(def.count, Math.round(def.count * areaFactor))
    for (let i = 0; i < count; i++) {
      let x = 0
      let y = 0
      // Tire une position hors de la zone centrale (quelques essais).
      for (let t = 0; t < 12; t++) {
        x = rng() * worldW
        y = rng() * worldH
        if (Math.hypot(x - cx, y - cy) >= CENTER_EXCLUSION) {
          break
        }
      }
      scene.add.image(x, y, def.key).setScale(def.scale).setDepth(-6)
    }
  }
}

/**
 * Pose un grand LANDMARK de bâtiment (la structure à cette phase) à une position
 * seedée hors du centre — visible autour du combat, décoratif et non bloquant.
 * Sprite individuel au-dessus des props épars (depth -4). Déterministe.
 */
export function createLandmark(
  scene: Phaser.Scene,
  worldW: number,
  worldH: number,
  landmark: PropDef,
  seed = 1
): void {
  if (!scene.textures.exists(landmark.key)) {
    return
  }
  const rng = mulberry32((seed ^ 0x1b56c4e9) >>> 0)
  const cx = worldW / 2
  const cy = worldH / 2
  for (let i = 0; i < Math.max(1, landmark.count); i++) {
    // Ancrage périphérique (~500-620 px du centre) → visible en jouant, hors du spawn.
    const angle = rng() * Math.PI * 2
    const dist = 500 + rng() * 120
    const x = Math.min(worldW - 60, Math.max(60, cx + Math.cos(angle) * dist))
    const y = Math.min(worldH - 60, Math.max(60, cy + Math.sin(angle) * dist))
    scene.add.image(x, y, landmark.key).setScale(landmark.scale).setDepth(-4)
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
export type StructureBand = 'mid' | 'periphery'

/** Une grande pièce structurelle qui remplit l'arène (dérive de PropDef + bande). */
export interface StructureDef extends PropDef {
  band: StructureBand
}

/** Rayon central laissé LIBRE de grosses structures opaques (lisibilité du combat). */
const CENTER_CLEAR = 260

const BANDS: Record<StructureBand, readonly [number, number]> = {
  mid: [CENTER_CLEAR, 720],
  periphery: [560, 820]
}

/**
 * Pose les grandes STRUCTURES d'un stage (l'étape de chantier qui remplit l'arène) à
 * des positions seedées DISTINCTES dans leur bande, hors du rayon central dégagé.
 * Sprites individuels au-dessus des props, sous le landmark hero (depth -5).
 * Purement visuel et déterministe.
 */
export function createStructures(
  scene: Phaser.Scene,
  worldW: number,
  worldH: number,
  structures: readonly StructureDef[],
  seed = 1
): void {
  const rng = mulberry32((seed ^ 0x53a9f0b1) >>> 0)
  const cx = worldW / 2
  const cy = worldH / 2
  for (const def of structures) {
    if (!scene.textures.exists(def.key)) {
      continue
    }
    const [dmin, dmax] = BANDS[def.band]
    for (let i = 0; i < Math.max(1, def.count); i++) {
      const angle = rng() * Math.PI * 2
      const dist = dmin + rng() * (dmax - dmin)
      const x = Math.min(worldW - 40, Math.max(40, cx + Math.cos(angle) * dist))
      const y = Math.min(worldH - 40, Math.max(40, cy + Math.sin(angle) * dist))
      scene.add.image(x, y, def.key).setScale(def.scale).setDepth(-5)
    }
  }
}
