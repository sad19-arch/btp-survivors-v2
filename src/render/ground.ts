import Phaser from 'phaser'

export interface GroundAssets {
  /** Clés de texture des tuiles de base (variantes ; la 1re sert de base répétée). */
  tileKeys: readonly string[]
  /** Clés de texture des décalques épars. */
  decalKeys: readonly string[]
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
 * Rend le sol SOUS les entités, en **coût indépendant de la taille du monde** :
 *  - base = un `TileSprite` GPU (une tuile 32×32, puissance de 2, répétée par le
 *    GPU sur tout le monde) → 1 objet, aucune RenderTexture, aucun draw par
 *    cellule, quelle que soit la taille du monde ;
 *  - variété = décalques épars (flaques, cailloux…) posés en sprites individuels
 *    par-dessus (quelques centaines, culés hors écran).
 * Aucune texture pleine-taille → un monde 4× plus grand ne coûte ni mémoire ni
 * cuisson en plus. Purement visuel et reproductible (PRNG seedé).
 */
export function createGround(
  scene: Phaser.Scene,
  worldW: number,
  worldH: number,
  assets: GroundAssets,
  seed = 1
): void {
  // 1) Base : une tuile répétée par un TileSprite (POT 32×32 → tuilage GPU propre).
  const baseKey = assets.tileKeys[0]
  if (baseKey !== undefined) {
    scene.add.tileSprite(0, 0, worldW, worldH, baseKey).setOrigin(0, 0).setDepth(-10)
  }

  // 2) Décalques épars (densité ~ 1 pour 260×260 px) — sprites individuels.
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
      scene.add.image(x, y, key).setOrigin(0, 0).setDepth(-9)
    }
  }
}
