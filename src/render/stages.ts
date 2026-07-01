/**
 * Registre de RENDU par phase/stage : quels assets (sol, décalques, props, skins
 * d'ennemis) charger selon `stageId` exposé par la sim. La sim reste la source de
 * vérité (thème, pools) ; ici on ne fait que mapper vers des fichiers.
 *
 * Le joueur, le boss, les projectiles/pickups/VFX/icônes UI sont PARTAGÉS (non
 * listés ici). Seuls sol/décalques/props/ennemis changent d'un stage à l'autre.
 */

export interface StageKeyFile {
  key: string
  file: string
}

export interface StageProp {
  key: string
  file: string
  scale: number
  count: number
}

/** Skin d'un type d'ennemi pour un stage donné. */
export interface StageEnemySprite {
  key: string
  file: string
  frame: number
  scale: number
}

export interface StageRender {
  ground: StageKeyFile[]
  decals: StageKeyFile[]
  props: StageProp[]
  /** type d'ennemi (sim) → feuille de sprite pour ce stage. */
  enemies: Record<string, StageEnemySprite>
}

export const DEFAULT_STAGE = 'terrain_vierge'

const TERRAIN_VIERGE_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_${i}`, file: `stage01/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_puddle', file: 'stage01/decals/puddle.png' },
    { key: 'decal_weeds', file: 'stage01/decals/weeds.png' },
    { key: 'decal_pebbles', file: 'stage01/decals/pebbles.png' },
    { key: 'decal_crack', file: 'stage01/decals/crack.png' },
    { key: 'decal_tracks', file: 'stage01/decals/tracks.png' }
  ],
  props: [
    { key: 'prop_sign', file: 'stage01/props/site_sign.png', scale: 1.1, count: 2 },
    { key: 'prop_stakes', file: 'stage01/props/survey_stakes.png', scale: 1.1, count: 3 },
    { key: 'prop_tape', file: 'stage01/props/boundary_tape.png', scale: 1.0, count: 3 },
    { key: 'prop_rocks', file: 'stage01/props/rock_cluster.png', scale: 1.0, count: 5 },
    { key: 'prop_weeds', file: 'stage01/props/dry_weeds.png', scale: 1.0, count: 6 },
    { key: 'prop_soft', file: 'stage01/props/soft_ground.png', scale: 1.4, count: 3 }
  ],
  enemies: {
    huissier: { key: 'brute', file: 'stage01/enemies/brute_walk.png', frame: 192, scale: 1.0 },
    inspecteur: { key: 'imp', file: 'stage01/enemies/imp_walk.png', frame: 192, scale: 0.9 },
    paperasse: { key: 'mudling', file: 'stage01/enemies/mudling_walk.png', frame: 192, scale: 1.25 }
  }
}

export const STAGE_RENDER: Record<string, StageRender> = {
  terrain_vierge: TERRAIN_VIERGE_RENDER,
  terrassement: {
    ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_s2_${i}`, file: `stage02/ground/tile_${i}.png` })),
    decals: [
      { key: 'decal_s2_tracks', file: 'stage02/decals/tracks.png' },
      { key: 'decal_s2_puddle', file: 'stage02/decals/puddle.png' }
    ],
    props: [],
    // Skins d'ennemis terrassement : produits en vague 3 (d'ici là → repli cercle).
    enemies: {}
  }
}

/** Config de rendu d'un stage, avec repli sur le terrain vierge. */
export function stageRender(stageId: string): StageRender {
  return STAGE_RENDER[stageId] ?? TERRAIN_VIERGE_RENDER
}
