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
): Phaser.GameObjects.RenderTexture {
  const rt = scene.add.renderTexture(0, 0, worldW, worldH).setOrigin(0, 0).setDepth(-5)
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const cx = worldW / 2
  const cy = worldH / 2
  for (const def of props) {
    if (!scene.textures.exists(def.key)) {
      continue
    }
    for (let i = 0; i < def.count; i++) {
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
      const img = scene.make.image({ x: 0, y: 0, key: def.key, add: false }).setScale(def.scale)
      rt.draw(img, x, y)
      img.destroy()
    }
  }
  return rt
}
