import Phaser from 'phaser'

export interface GroundAssets {
  /** Clés de texture des tuiles de base (variantes ; la 1re sert de base répétée). */
  tileKeys: readonly string[]
}

/**
 * Rend la BASE du sol SOUS les entités, en **coût O(1) indépendant de la taille du monde** :
 *  - base = un `TileSprite` GPU (une tuile 32×32, puissance de 2, répétée par le
 *    GPU sur tout le monde) → 1 objet, aucune RenderTexture, aucun draw par
 *    cellule, quelle que soit la taille du monde.
 *
 * Les décalques épars (flaques, cailloux…) qui étaient ici sont DÉPLACÉS dans le
 * `DecorStreamer` (`src/render/decorStreamer.ts`) qui les streame par chunks autour
 * de la caméra — coût constant même pour un monde ×10.
 * Aucune texture pleine-taille → la taille du monde ne coûte ni mémoire ni
 * cuisson en plus. Purement visuel et reproductible.
 */
export function createGround(
  scene: Phaser.Scene,
  worldW: number,
  worldH: number,
  assets: GroundAssets
): void {
  // Base : une tuile répétée par un TileSprite (POT 32×32 → tuilage GPU propre).
  const baseKey = assets.tileKeys[0]
  if (baseKey !== undefined) {
    scene.add.tileSprite(0, 0, worldW, worldH, baseKey).setOrigin(0, 0).setDepth(-10)
  }
}
