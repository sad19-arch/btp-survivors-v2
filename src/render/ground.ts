import Phaser from 'phaser'

/** Taille d'une tuile de sol, en px. */
const TILE_PX = 32

export interface GroundAssets {
  /** Clés de texture des tuiles de base (variantes). */
  tileKeys: readonly string[]
  /** Clés de texture des décalques épars. */
  decalKeys: readonly string[]
}

/** Hash déterministe d'une coordonnée de cellule → variante de tuile. */
function hash32(a: number, b: number): number {
  return (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0
}

/** PRNG seedé (mulberry32) — placement des décalques reproductible. */
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
 * Dessine le sol dans une RenderTexture statique placée SOUS les entités :
 * base tuilée (variante tirée par cellule via hash déterministe des coords)
 * + décalques épars (PRNG seedé, posés hors grille). Purement visuel et
 * reproductible — n'affecte pas la simulation.
 */
export function createGround(
  scene: Phaser.Scene,
  worldW: number,
  worldH: number,
  assets: GroundAssets,
  seed = 1
): Phaser.GameObjects.RenderTexture {
  const rt = scene.add.renderTexture(0, 0, worldW, worldH).setOrigin(0, 0).setDepth(-10)

  // 1) Base : une variante par cellule (hash déterministe).
  const cols = Math.ceil(worldW / TILE_PX)
  const rows = Math.ceil(worldH / TILE_PX)
  const tiles = assets.tileKeys
  if (tiles.length > 0) {
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const key = tiles[hash32(cx, cy) % tiles.length]
        if (key !== undefined) {
          rt.draw(key, cx * TILE_PX, cy * TILE_PX)
        }
      }
    }
  }

  // 2) Décalques épars (densité ~ 1 pour 260×260 px).
  const decals = assets.decalKeys
  if (decals.length > 0) {
    const rng = mulberry32(seed)
    const count = Math.max(0, Math.round((worldW * worldH) / (260 * 260)))
    for (let i = 0; i < count; i++) {
      const key = decals[Math.floor(rng() * decals.length)]
      if (key === undefined) {
        continue
      }
      const frame = scene.textures.getFrame(key)
      const w = frame?.width ?? 0
      const h = frame?.height ?? 0
      const x = Math.floor(rng() * Math.max(1, worldW - w))
      const y = Math.floor(rng() * Math.max(1, worldH - h))
      rt.draw(key, x, y)
    }
  }

  return rt
}
