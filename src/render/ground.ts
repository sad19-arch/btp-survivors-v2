import Phaser from 'phaser'
import { STAGE_RENDER, type StageKeyFile } from '@render/stages'
import type { StageLayout } from '@content/stageLayout'

/**
 * Tuiles de sol qu'une composition référence en DEHORS de son propre stage :
 * le fond global (`groundKey`) et les plaques posées (`elements[].tile`).
 *
 * Le preload d'un stage ne charge que SES 6 tuiles. Poser le sol du 05 sur le 01
 * échouerait donc silencieusement — la texture n'existerait pas, et le rendu
 * retomberait sur le sol du stage sans rien signaler. Fonction PURE : la
 * résolution clé → fichier passe par `STAGE_RENDER`, la même source que le jeu.
 */
export function groundTilesForLayout(layout: StageLayout | null): StageKeyFile[] {
  if (layout === null) { return [] }
  const wanted = new Set<string>()
  if (layout.groundKey !== undefined) { wanted.add(layout.groundKey) }
  for (const inst of layout.instances) {
    for (const el of inst.elements ?? []) {
      if (el.tile !== undefined) { wanted.add(el.assetKey) }
    }
  }
  if (wanted.size === 0) { return [] }
  const out: StageKeyFile[] = []
  for (const sr of Object.values(STAGE_RENDER)) {
    for (const g of sr.ground) {
      if (wanted.has(g.key)) { out.push(g) }
    }
  }
  return out
}

export interface GroundAssets {
  /** Clés de texture des tuiles de base (variantes ; la 1re sert de base répétée). */
  tileKeys: readonly string[]
  /** Indice de la tuile de base dans `tileKeys` (défaut 0). Optionnel. */
  baseTileIndex?: number
  /**
   * Tuile de fond CHOISIE par la composition (`StageLayout.groundKey`), qui prime
   * sur `baseTileIndex`. Permet de jouer un stage sur le sol d'un AUTRE stage.
   * La clé peut donc ne pas être dans `tileKeys` : elle est utilisée telle quelle.
   */
  overrideKey?: string
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
  // Priorité : sol choisi par la compo > baseTileIndex du stage > 1re tuile.
  // Le repli protège d'un `groundKey` pointant une texture non chargée (compo
  // d'un stage dont les tuiles ne sont pas préchargées) : mieux vaut le sol du
  // stage qu'un carré noir.
  const tileIdx = assets.baseTileIndex ?? 0
  const stageKey = assets.tileKeys[tileIdx] ?? assets.tileKeys[0]
  const overrideOk = assets.overrideKey !== undefined && scene.textures.exists(assets.overrideKey)
  const baseKey = overrideOk ? assets.overrideKey : stageKey
  if (baseKey !== undefined) {
    scene.add.tileSprite(0, 0, worldW, worldH, baseKey).setOrigin(0, 0).setDepth(-10)
  }
}
