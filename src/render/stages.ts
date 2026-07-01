/**
 * Registre de RENDU par phase/stage : quels assets (sol, décalques, props/engins,
 * skins d'ennemis, skin de boss) charger selon `stageId` exposé par la sim. La sim
 * reste la source de vérité (thème, pools, stats) ; ici on ne fait que mapper vers
 * des fichiers.
 *
 * Le joueur, les projectiles/pickups/VFX/icônes UI sont PARTAGÉS. Le BOSS est
 * désormais par-stage (skin unique ; la sim spawne toujours `contremaitre`,
 * mêmes stats). Sol/décalques/props/ennemis/boss changent d'un stage à l'autre.
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

/** Skin d'un perso (ennemi ou boss) pour un stage : feuille 4×4 en cellule `frame`. */
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
  /** type d'ennemi (id de contenu) → feuille de sprite pour ce stage. */
  enemies: Record<string, StageEnemySprite>
  /** Skin du mini-boss (contremaitre) pour ce stage. */
  boss: StageEnemySprite
}

export const DEFAULT_STAGE = 'terrain_vierge'

/** Boss stage 01 (ground_keeper), réutilisé tant qu'un stage n'a pas son skin propre. */
const GROUND_KEEPER: StageEnemySprite = {
  key: 'boss',
  file: 'stage01/boss/ground_keeper_walk.png',
  frame: 256,
  scale: 1.35
}

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
    { key: 'prop_soft', file: 'stage01/props/soft_ground.png', scale: 1.4, count: 3 },
    { key: 'prop_cabin', file: 'stage01/props/site_cabin.png', scale: 1.1, count: 1 }
  ],
  enemies: {
    huissier: { key: 'brute', file: 'stage01/enemies/brute_walk.png', frame: 192, scale: 1.0 },
    inspecteur: { key: 'imp', file: 'stage01/enemies/imp_walk.png', frame: 192, scale: 0.9 },
    paperasse: { key: 'mudling', file: 'stage01/enemies/mudling_walk.png', frame: 192, scale: 1.25 }
  },
  boss: GROUND_KEEPER
}

const TERRASSEMENT_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_s2_${i}`, file: `stage02/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_s2_tracks', file: 'stage02/decals/tracks.png' },
    { key: 'decal_s2_puddle', file: 'stage02/decals/puddle.png' }
  ],
  props: [
    { key: 'prop_s2_excavator', file: 'stage02/props/excavator.png', scale: 0.8, count: 1 },
    { key: 'prop_s2_truck', file: 'stage02/props/dump_truck.png', scale: 0.72, count: 1 },
    { key: 'prop_s2_dirt', file: 'stage02/props/dirt_large.png', scale: 0.8, count: 4 }
  ],
  enemies: {
    boueux: { key: 'enemy_s2_boueux', file: 'stage02/enemies/boueux_walk.png', frame: 256, scale: 0.74 },
    foreur: { key: 'enemy_s2_foreur', file: 'stage02/enemies/foreur_walk.png', frame: 256, scale: 0.64 },
    rocheux: { key: 'enemy_s2_rocheux', file: 'stage02/enemies/rocheux_walk.png', frame: 256, scale: 0.8 }
  },
  boss: GROUND_KEEPER
}

/** Spécification compacte d'un prop : [nom de fichier (sans ext), échelle, nombre]. */
type PropSpec = readonly [name: string, scale: number, count: number]

function buildProps(prefix: string, specs: readonly PropSpec[]): StageProp[] {
  return specs.map(([name, scale, count]) => ({
    key: `prop_${prefix}_${name}`,
    file: `${prefix}/props/${name}.png`,
    scale,
    count
  }))
}

/**
 * Construit la config de rendu d'un stage 03-10 (assets produits à la demande ;
 * repli cercle tant que les feuilles n'existent pas). `ids` = [base, fast, tank]
 * (mêmes ids que le pool de la phase). Échelles calibrées comme le stage 02 (art
 * v3 similaire) — à affiner au calibrage réel de chaque stage.
 */
function makeStage(
  prefix: string,
  ids: readonly [string, string, string],
  propSpecs: readonly PropSpec[],
  decals: readonly string[],
  enemyScales: readonly [number, number, number] = [0.74, 0.64, 0.8],
  bossScale = 0.7
): StageRender {
  return {
    ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_${prefix}_${i}`, file: `${prefix}/ground/tile_${i}.png` })),
    decals: decals.map((d) => ({ key: `decal_${prefix}_${d}`, file: `${prefix}/decals/${d}.png` })),
    props: buildProps(prefix, propSpecs),
    enemies: {
      [ids[0]]: { key: `enemy_${prefix}_base`, file: `${prefix}/enemies/base_walk.png`, frame: 256, scale: enemyScales[0] },
      [ids[1]]: { key: `enemy_${prefix}_fast`, file: `${prefix}/enemies/fast_walk.png`, frame: 256, scale: enemyScales[1] },
      [ids[2]]: { key: `enemy_${prefix}_tank`, file: `${prefix}/enemies/tank_walk.png`, frame: 256, scale: enemyScales[2] }
    },
    boss: { key: `boss_${prefix}`, file: `${prefix}/boss/boss_walk.png`, frame: 256, scale: bossScale }
  }
}

export const STAGE_RENDER: Record<string, StageRender> = {
  terrain_vierge: TERRAIN_VIERGE_RENDER,
  terrassement: TERRASSEMENT_RENDER,
  fondations: makeStage(
    'stage03',
    ['gachee', 'ferrailleur', 'massif'],
    [
      ['mixer_truck', 0.85, 1],
      ['concrete_pump', 0.8, 1],
      ['concrete_mixer', 0.6, 2],
      ['rebar', 0.7, 3],
      ['formwork', 0.8, 2]
    ],
    ['spill', 'crack'],
    [1.18, 0.62, 0.94],
    1.33
  ),
  reseaux_enterres: makeStage(
    'stage04',
    ['gaine', 'fileur', 'collecteur'],
    [
      ['mini_excavator', 0.78, 1],
      ['trencher', 0.8, 1],
      ['pipes', 0.8, 3],
      ['cable_reel', 0.7, 3]
    ],
    ['trench', 'mud'],
    [0.75, 0.65, 0.77],
    1.22
  ),
  gros_oeuvre: makeStage(
    'stage05',
    ['parpaing', 'truelle', 'banche'],
    [
      ['tower_crane', 0.8, 1],
      ['mobile_crane', 0.9, 1],
      ['block_pallet', 0.8, 4],
      ['telehandler', 0.8, 1]
    ],
    ['mortar', 'rubble'],
    [0.71, 0.63, 0.8],
    1.3
  ),
  echafaudages: makeStage(
    'stage06',
    ['boulon', 'grimpeur', 'pylone'],
    [
      ['scaffold', 1.0, 2],
      ['boom_lift', 0.85, 1],
      ['tubes', 0.7, 3]
    ],
    ['bolt_scatter', 'oil'],
    [0.71, 0.65, 0.77],
    1.41
  ),
  charpente_toiture: makeStage(
    'stage07',
    ['copeau', 'chevron', 'poutre'],
    [
      ['crane_truck', 0.9, 1],
      ['trusses', 0.85, 3],
      ['tiles', 0.7, 4]
    ],
    ['sawdust', 'woodchips'],
    [0.5, 0.66, 0.78],
    1.23
  ),
  second_oeuvre: makeStage(
    'stage08',
    ['platras', 'gainard', 'cloison'],
    [
      ['forklift', 0.8, 1],
      ['drywall', 0.8, 4],
      ['insulation', 0.7, 3]
    ],
    ['plaster_dust', 'scrap']
  ),
  finitions: makeStage(
    'stage09',
    ['goutte', 'pinceau', 'pot'],
    [
      ['van', 0.8, 1],
      ['paint', 0.7, 4],
      ['tile_pallet', 0.75, 3]
    ],
    ['paint_spot', 'tile_offcut']
  ),
  livraison_audit: makeStage(
    'stage10',
    ['formulaire', 'auditeur', 'commission'],
    [
      ['inspection_van', 0.8, 1],
      ['sign_ok', 0.9, 2],
      ['cones', 0.6, 5]
    ],
    ['clean_mark', 'tape_line']
  )
}

/** Config de rendu d'un stage, avec repli sur le terrain vierge. */
export function stageRender(stageId: string): StageRender {
  return STAGE_RENDER[stageId] ?? TERRAIN_VIERGE_RENDER
}
