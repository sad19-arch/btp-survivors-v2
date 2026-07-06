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

/** Bande de placement d'une structure (anneau autour du centre du monde). */
export type StageStructureBand = 'near' | 'mid' | 'periphery'

/**
 * Grande pièce structurelle qui remplit l'arène (l'étape de chantier VISIBLE partout).
 * `count` instances dispersées dans la `band`, hors de la zone centrale de jeu.
 */
export interface StageStructure {
  key: string
  file: string
  scale: number
  count: number
  band: StageStructureBand
}

/**
 * Géographie scriptée d'un stage : angles fixes (en degrés) pour les éléments-héros.
 * Optionnel — si absent, le placement reste aléatoire (comportement actuel).
 * Angles mesurés depuis le centre du monde, 0° = droite (Est), sens trigonométrique.
 */
export interface StageGeometry {
  /** Angle (°) de chaque structure, dans l'ordre de `structures[]`. */
  structureAngles?: number[]
  /** Angle (°) du landmark principal. */
  landmarkAngle?: number
  /** Angle (°) du PNJ d'ambiance (secteur où il apparaît). */
  ambientAngle?: number
}

/**
 * Zone de clustering thématique pour les décalques/props d'un stage.
 * Les points tombant dans la zone reçoivent une densité multipliée et
 * un choix prioritaire parmi les indices dominants.
 */
export interface DecorZone {
  /** Angle central de la zone (°, 0 = Est, sens trigo). */
  angleCenter: number
  /** Demi-ouverture angulaire de la zone (°). */
  angleSpread: number
  /** Distance minimale au centre (px). */
  distMin: number
  /** Distance maximale au centre (px). */
  distMax: number
  /** Indices de props prioritaires dans cette zone (ordre de `StageRender.props`). Optionnel. */
  dominantPropIndices?: number[]
  /** Indices de décalques prioritaires dans cette zone (ordre de `StageRender.decals`). Optionnel. */
  dominantDecalIndices?: number[]
  /** Multiplicateur de densité dans cette zone (1.0 = neutre, >1 = plus dense). */
  density: number
}

export interface StageRender {
  ground: StageKeyFile[]
  decals: StageKeyFile[]
  props: StageProp[]
  /** type d'ennemi (id de contenu) → feuille de sprite pour ce stage. */
  enemies: Record<string, StageEnemySprite>
  /** Skin du mini-boss (contremaitre) pour ce stage. */
  boss: StageEnemySprite
  /** Grand landmark de bâtiment (la structure HERO à CETTE phase) — placé en périphérie, décoratif. */
  landmark?: StageProp
  /** Grandes structures qui remplissent l'arène (l'étape de chantier partout). */
  structures?: StageStructure[]
  /** PNJ d'ambiance non-hostile (feuille perso, geste métier) — la « vie » du chantier. */
  ambient?: StageAmbient
  /** Géographie scriptée (angles fixes) — optionnel, repli aléatoire si absent. */
  geometry?: StageGeometry
  /** Zones de clustering thématique — optionnel, repli uniforme si absent. */
  zones?: DecorZone[]
  /** Indice de la tuile de base du sol (dans `ground[]`, défaut 0). */
  baseTileIndex?: number
  /** Multiplicateur de densité des décalques (défaut 1.0 — brut > fini). */
  decalDensityMultiplier?: number
}

/** PNJ d'ambiance : skin perso + période d'animation optionnelle (vitesse du geste). */
export interface StageAmbient extends StageEnemySprite {
  /** Période d'une frame du geste, en ms (défaut 300). */
  framePeriodMs?: number
}

/** Ajouts optionnels d'ambiance d'un stage (landmark + structures + PNJ + composition). */
export interface StageExtra {
  landmark?: StageProp
  structures?: StageStructure[]
  ambient?: StageAmbient
  geometry?: StageGeometry
  zones?: DecorZone[]
  baseTileIndex?: number
  decalDensityMultiplier?: number
}

export const DEFAULT_STAGE = 'terrain_vierge'

/** Boss stage 01 (ground_keeper), réutilisé tant qu'un stage n'a pas son skin propre. */
const GROUND_KEEPER: StageEnemySprite = {
  key: 'boss',
  file: 'stage01/boss/ground_keeper_walk.png',
  frame: 256,
  scale: 1.35
}

/**
 * Skin PARTAGÉ du boss FINAL (contremaître maudit) — distinct des mini-boss
 * par-stage (`STAGE_RENDER[...].boss`). Une seule feuille pour tous les stages
 * (le boss final est le même partout) ; échelle plus imposante que les
 * mid-boss (~0.7-1.41) pour marquer l'enjeu.
 */
export const FINAL_BOSS_SKIN: StageEnemySprite = {
  key: 'boss_final',
  file: 'stage01/boss/boss_final_cursed_foreman_walk.png',
  frame: 256,
  scale: 1.3
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
  boss: GROUND_KEEPER,
  // Terrain vierge : bornage du terrain (parcelles piquetées) + géomètre qui vise.
  landmark: { key: 'landmark_stage01', file: 'stage01/landmarks/permit.png', scale: 1.5, count: 1 },
  structures: [
    { key: 'struct_stage01_plot', file: 'stage01/structures/plot.png', scale: 0.85, count: 3, band: 'mid' }
  ],
  ambient: { key: 'npc_stage01', file: 'stage01/npc/geometre_work.png', frame: 256, scale: 0.72, framePeriodMs: 320 }
}

const TERRASSEMENT_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_s2_${i}`, file: `stage02/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_s2_tracks', file: 'stage02/decals/tracks.png' },
    { key: 'decal_s2_puddle', file: 'stage02/decals/puddle.png' }
  ],
  // SEUL prop streamé = les tas de terre (clutter réparti). Les gros ENGINS sont
  // des `structures` scriptées (placées UNE fois) — sinon la formule de densité du
  // streamer les réplique ~1 par chunk (pelleteuses partout = « vrac »).
  props: [
    { key: 'prop_s2_dirt', file: 'stage02/props/dirt_large.png', scale: 0.85, count: 5 }
  ],
  enemies: {
    boueux: { key: 'enemy_s2_boueux', file: 'stage02/enemies/boueux_walk.png', frame: 256, scale: 0.74 },
    foreur: { key: 'enemy_s2_foreur', file: 'stage02/enemies/foreur_walk.png', frame: 256, scale: 0.64 },
    rocheux: { key: 'enemy_s2_rocheux', file: 'stage02/enemies/rocheux_walk.png', frame: 256, scale: 0.8 }
  },
  boss: { key: 'boss_s2_terrassement', file: 'stage02/boss/boss_walk.png', frame: 256, scale: 1.27 },
  // Terrassement : grandes fouilles excavées partout + chef de chantier qui montre le plan.
  landmark: { key: 'landmark_stage02', file: 'stage02/landmarks/pit.png', scale: 1.4, count: 1 },
  // Engins-héros PLACÉS UNE FOIS, gros, proches de l'anneau de jeu (band 'near')
  // + 3 fosses en fond. Ordre = ordre des angles scriptés (structureAngles).
  structures: [
    { key: 'prop_s2_excavator', file: 'stage02/props/excavator.png', scale: 1.2, count: 1, band: 'near' },
    { key: 'prop_s2_truck', file: 'stage02/props/dump_truck.png', scale: 1.05, count: 1, band: 'near' },
    { key: 'prop_s2_roller', file: 'stage02/props/road_roller.png', scale: 1.0, count: 1, band: 'mid' },
    { key: 'prop_s2_dozer', file: 'stage02/props/bulldozer.png', scale: 1.0, count: 1, band: 'mid' },
    { key: 'struct_stage02_pit', file: 'stage02/structures/pit_big.png', scale: 0.85, count: 3, band: 'mid' }
  ],
  ambient: { key: 'npc_stage02', file: 'stage02/npc/chef_work.png', frame: 256, scale: 0.71, framePeriodMs: 340 },
  // ── Composition scriptée stage 02 (terrassement) ──────────────────────────────
  // Géographie : pelleteuse (prop_s2_excavator=idx0) côté NE, benne (idx1) côté SE,
  // compacteur (idx2=roller) à l'Ouest. Les 5 fosses distribuées sur le quart NE-SE
  // (là où les engins creusent). Landmark (grande fosse) au Nord-NE. PNJ chef de
  // chantier près du landmark, côté Nord.
  geometry: {
    // Angles en degrés : 0=Est, 90=Nord (convention sin/cos standard en Phaser +y↓)
    // structureAngles[i] → structure i (pit_big ×5) : angle en degrés
    // 5 fosses en arc Nord-Est (−60°..+60° autour de 45° = NE) pour concentrer l'excavation
    // 7 instances dans l'ordre des `structures` : pelleteuse NE, benne SE,
    // compacteur O, bulldozer OSO, puis 3 fosses (N, ENE, SO).
    structureAngles: [50, 310, 175, 215, 25, 95, 250],
    landmarkAngle: 70,      // grande fosse hero au Nord
    ambientAngle: 55        // chef de chantier près de la pelleteuse NE
  },
  // Zones métier : 3 secteurs complémentaires
  zones: [
    // Secteur Excavation (NE) — dense en ornières + tas de terre autour des engins
    {
      angleCenter: 50,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0],       // tas de terre (seul prop)
      dominantDecalIndices: [0],      // tracks (ornières)
      density: 1.8
    },
    // Secteur Déblais (SE) — tas de terre + flaques boueuses
    {
      angleCenter: 310,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0],       // tas de terre
      dominantDecalIndices: [1],      // puddle (flaques)
      density: 1.5
    },
    // Passage d'engins (Ouest) — ornières marquées
    {
      angleCenter: 180,
      angleSpread: 60,
      distMin: 320,
      distMax: 720,
      dominantPropIndices: [0],
      dominantDecalIndices: [0],      // tracks
      density: 1.3
    }
  ],
  baseTileIndex: 0,           // tuile boue de base (index 0)
  decalDensityMultiplier: 1.2 // chantier brut, mais sans « papier peint » (trame trop régulière si trop dense)
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
  bossScale = 0.7,
  extra: StageExtra = {}
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
    boss: { key: `boss_${prefix}`, file: `${prefix}/boss/boss_walk.png`, frame: 256, scale: bossScale },
    ...extra
  }
}

const FONDATIONS_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_stage03_${i}`, file: `stage03/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_stage03_spill', file: 'stage03/decals/spill.png' },
    { key: 'decal_stage03_crack', file: 'stage03/decals/crack.png' }
  ],
  // Seul clutter streamé : béton mini + ferraillage + coffrage.
  // Les GROS ENGINS (toupies, pompe) sont dans `structures` (placés 1 fois).
  props: [
    { key: 'prop_stage03_concrete_mixer', file: 'stage03/props/concrete_mixer.png', scale: 0.65, count: 3 },
    { key: 'prop_stage03_rebar',          file: 'stage03/props/rebar.png',           scale: 0.75, count: 4 },
    { key: 'prop_stage03_formwork',       file: 'stage03/props/formwork.png',        scale: 0.80, count: 3 }
  ],
  enemies: {
    gachee:      { key: 'enemy_stage03_base', file: 'stage03/enemies/base_walk.png', frame: 256, scale: 1.18 },
    ferrailleur: { key: 'enemy_stage03_fast', file: 'stage03/enemies/fast_walk.png', frame: 256, scale: 0.62 },
    massif:      { key: 'enemy_stage03_tank', file: 'stage03/enemies/tank_walk.png', frame: 256, scale: 0.94 }
  },
  boss: { key: 'boss_stage03', file: 'stage03/boss/boss_walk.png', frame: 256, scale: 1.25 },
  // Fondations : dalle-héros + toupies + coulées de béton + ferrailleur au travail.
  landmark: { key: 'landmark_stage03', file: 'stage03/landmarks/slab.png', scale: 1.5, count: 1 },
  // Engins-héros placés UNE fois (toupie jaune NE, pompe orange SE)
  // + travées de coffrage en fond. Ordre = ordre des angles scriptés.
  structures: [
    { key: 'struct_stage03_mixer',    file: 'stage03/props/mixer_truck.png',     scale: 1.1,  count: 1, band: 'near' },
    { key: 'struct_stage03_pump',     file: 'stage03/props/concrete_pump.png',   scale: 1.05, count: 1, band: 'near' },
    { key: 'struct_stage03_bay',      file: 'stage03/structures/formwork_bay.png', scale: 0.85, count: 5, band: 'mid'  }
  ],
  ambient: { key: 'npc_stage03', file: 'stage03/npc/ferrailleur_work.png', frame: 256, scale: 0.69, framePeriodMs: 260 },
  // ── Composition scriptée stage 03 (fondations) ───────────────────────────────
  // Géographie : toupie (mixer_truck=idx0) côté NE proche, pompe (idx1) côté SE proche,
  // 5 travées de coffrage distribuées en arc Nord-Ouest (idle, décor).
  // Landmark (grande dalle) au Nord-NE. PNJ ferrailleur près de la toupie NE.
  geometry: {
    // structureAngles[i] → structure i, dans l'ordre de `structures[]` :
    //   0 = mixer_truck (NE, ~45°)   1 = concrete_pump (SE, ~315°)
    //   2-6 = formwork_bay (arc O-SO : 160°, 200°, 240°, 100°, 280°)
    structureAngles: [50, 315, 160, 205, 245, 100, 280],
    landmarkAngle: 65,   // dalle-hero au Nord (légèrement Est)
    ambientAngle:  50    // ferrailleur près de la toupie NE
  },
  // Zones métier : 3 secteurs complémentaires
  zones: [
    // Secteur Coulée (NE) — dense en ferraillage + taches béton autour des engins
    {
      angleCenter: 50,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [1],       // rebar (ferraillage)
      dominantDecalIndices: [0],      // spill (taches béton)
      density: 1.8
    },
    // Secteur Coffrage (SO) — travées de coffrage + fissures
    {
      angleCenter: 220,
      angleSpread: 60,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [2],       // formwork (coffrage)
      dominantDecalIndices: [1],      // crack (fissures)
      density: 1.5
    },
    // Passage pompe (SE) — béton frais + ferraillage
    {
      angleCenter: 315,
      angleSpread: 50,
      distMin: 320,
      distMax: 700,
      dominantPropIndices: [0, 1],    // concrete_mixer + rebar
      dominantDecalIndices: [0],      // spill
      density: 1.4
    }
  ],
  baseTileIndex: 0,            // tuile béton de base (index 0)
  decalDensityMultiplier: 1.35 // chantier actif brut, densité forte (coulage béton)
}

const RESEAUX_ENTERRES_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_stage04_${i}`, file: `stage04/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_stage04_trench', file: 'stage04/decals/trench.png' },
    { key: 'decal_stage04_mud',    file: 'stage04/decals/mud.png' },
    { key: 'decal_stage04_cables', file: 'stage04/decals/cables.png' }
  ],
  // Seul clutter streamé : tuyaux + gaines + tourets + regards.
  // La mini-pelle héros est dans `structures` (placée UNE fois).
  props: [
    { key: 'prop_stage04_pipes',    file: 'stage04/props/pipes.png',    scale: 0.80, count: 4 },
    { key: 'prop_stage04_trencher', file: 'stage04/props/trencher.png', scale: 0.75, count: 3 },
    { key: 'prop_stage04_cable',    file: 'stage04/props/cable_reel.png', scale: 0.80, count: 3 },
    { key: 'prop_stage04_regard',   file: 'stage04/props/regard.png',   scale: 0.70, count: 4 }
  ],
  enemies: {
    gaine:      { key: 'enemy_stage04_base', file: 'stage04/enemies/base_walk.png', frame: 256, scale: 0.75 },
    fileur:     { key: 'enemy_stage04_fast', file: 'stage04/enemies/fast_walk.png', frame: 256, scale: 0.65 },
    collecteur: { key: 'enemy_stage04_tank', file: 'stage04/enemies/tank_walk.png', frame: 256, scale: 0.77 }
  },
  boss: { key: 'boss_stage04', file: 'stage04/boss/boss_walk.png', frame: 256, scale: 1.22 },
  // Réseaux enterrés : croisement tuyaux-héros + mini-pelle + tranchées + électricien qui tire le câble.
  landmark: { key: 'landmark_stage04', file: 'stage04/landmarks/pipes.png', scale: 1.5, count: 1 },
  // Mini-pelle héros (band near, côté NE) + 4 jonctions de tranchées en fond.
  // Ordre = ordre des angles scriptés (structureAngles).
  structures: [
    { key: 'struct_stage04_excavator', file: 'stage04/props/mini_excavator.png',       scale: 1.1, count: 1, band: 'near' },
    { key: 'struct_stage04_trench',    file: 'stage04/structures/trench_junction.png',  scale: 0.85, count: 4, band: 'mid'  }
  ],
  ambient: { key: 'npc_stage04', file: 'stage04/npc/electricien_work.png', frame: 256, scale: 0.71, framePeriodMs: 280 },
  // ── Composition scriptée stage 04 (réseaux enterrés) ─────────────────────────
  // Géographie : mini-pelle (idx0) côté NE proche, 4 jonctions de tranchées
  // distribuées autour (NO, S, ESE, ONO). Landmark (croisement tuyaux) au Nord.
  // PNJ électricien près de la mini-pelle NE (câble tiré vers la tranchée).
  geometry: {
    // structureAngles[i] → structure i, dans l'ordre de `structures[]` :
    //   0 = mini_excavator (NE, ~50°)
    //   1-4 = trench_junction : NO (140°), S (265°), ESE (340°), ONO (110°)
    structureAngles: [50, 140, 265, 340, 110],
    landmarkAngle: 80,   // croisement tuyaux-héros au Nord-Est (légèrement N)
    ambientAngle:  55    // électricien près de la mini-pelle NE
  },
  // Zones métier : 3 secteurs complémentaires
  zones: [
    // Secteur Pose tuyaux (NE) — dense en tuyaux + câbles autour de la pelle
    {
      angleCenter: 50,
      angleSpread: 60,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0, 1],  // pipes + trencher (gaine rouge)
      dominantDecalIndices: [0, 2], // trench + cables
      density: 1.8
    },
    // Secteur Tirage câbles (SO) — tourets + regards + ornières boueuses
    {
      angleCenter: 225,
      angleSpread: 65,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [2, 3],  // cable_reel + regard
      dominantDecalIndices: [1, 2], // mud + cables
      density: 1.5
    },
    // Tranchée principale (SE-E) — gaines + regards + tranchée
    {
      angleCenter: 310,
      angleSpread: 55,
      distMin: 320,
      distMax: 720,
      dominantPropIndices: [1, 3],  // trencher + regard
      dominantDecalIndices: [0],    // trench
      density: 1.3
    }
  ],
  baseTileIndex: 2,            // tuile gravier/tranchée de base (index 2 — moins boue que 0)
  decalDensityMultiplier: 1.15 // chantier actif, densité moyenne (réseaux en cours de pose)
}

const GROS_OEUVRE_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_stage05_${i}`, file: `stage05/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_stage05_mortar',       file: 'stage05/decals/mortar.png' },
    { key: 'decal_stage05_rubble',       file: 'stage05/decals/rubble.png' },
    { key: 'decal_stage05_lifting_mark', file: 'stage05/decals/lifting_mark.png' },
    { key: 'decal_stage05_dust',         file: 'stage05/decals/concrete_dust.png' }
  ],
  // Seul clutter streamé : palettes de parpaings + poteaux béton + crochets grue.
  // Les GROS ENGINS (grue à tour + toupie) sont dans `structures` (placés 1 fois).
  props: [
    { key: 'prop_stage05_block_pallet',  file: 'stage05/props/block_pallet.png',  scale: 0.85, count: 5 },
    { key: 'prop_stage05_concrete_pole', file: 'stage05/props/concrete_pole.png', scale: 0.75, count: 4 },
    { key: 'prop_stage05_crane_hook',    file: 'stage05/props/crane_hook.png',    scale: 0.80, count: 3 }
  ],
  enemies: {
    parpaing: { key: 'enemy_stage05_base', file: 'stage05/enemies/base_walk.png', frame: 256, scale: 0.71 },
    truelle:  { key: 'enemy_stage05_fast', file: 'stage05/enemies/fast_walk.png', frame: 256, scale: 0.63 },
    banche:   { key: 'enemy_stage05_tank', file: 'stage05/enemies/tank_walk.png', frame: 256, scale: 0.80 }
  },
  boss: { key: 'boss_stage05', file: 'stage05/boss/boss_walk.png', frame: 256, scale: 1.19 },
  // Gros œuvre : murs qui montent (landmark) + grue à tour + toupie comme engins-héros.
  // Poteaux béton + crochets + palettes = verticalité lisible en 2 s.
  landmark: { key: 'landmark_stage05', file: 'stage05/landmarks/walls.png', scale: 1.5, count: 1 },
  // Engins-héros placés UNE fois (grue NE imposante, toupie SE proche)
  // + pans de murs parpaings en fond (verticalité). Ordre = ordre des angles scriptés.
  structures: [
    { key: 'struct_stage05_crane',   file: 'stage05/props/tower_crane.png',  scale: 1.2,  count: 1, band: 'near' },
    { key: 'struct_stage05_mixer',   file: 'stage05/props/mobile_crane.png', scale: 1.05, count: 1, band: 'near' },
    { key: 'struct_stage05_wall',    file: 'stage05/structures/wall_section.png', scale: 0.85, count: 5, band: 'mid'  }
  ],
  ambient: { key: 'npc_stage05', file: 'stage05/npc/mason_work.png', frame: 256, scale: 0.79, framePeriodMs: 280 },
  // ── Composition scriptée stage 05 (gros œuvre) ───────────────────────────────
  // Géographie : grue à tour (idx0) côté NE proche imposante, toupie (idx1) côté SE proche,
  // 5 sections de mur distribuées en arc O-SO-N (murs qui montent autour).
  // Landmark (bâtiment en construction) au Nord. PNJ maçon près de la toupie SE.
  geometry: {
    // structureAngles[i] → structure i, dans l'ordre de `structures[]` :
    //   0 = tower_crane (NE, ~45°) — héros imposant côté NE
    //   1 = mobile_crane (SE, ~315°) — toupie livrant le béton côté SE
    //   2-6 = wall_section : O (180°), SO (230°), SSO (210°), N (90°), ENE (30°)
    structureAngles: [45, 315, 180, 230, 150, 90, 30],
    landmarkAngle: 70,    // bâtiment-hero murs au Nord-Est
    ambientAngle:  320    // maçon près de la toupie SE (pose les parpaings)
  },
  // Zones métier : 3 secteurs complémentaires
  zones: [
    // Secteur Grue (NE) — dense en crochets + palettes autour de la grue
    {
      angleCenter: 45,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [2, 0],    // crane_hook + block_pallet
      dominantDecalIndices: [2],      // lifting_mark (marques de levage)
      density: 1.6
    },
    // Secteur Maçonnerie (SE-S) — palettes parpaings + mortier + poteaux
    {
      angleCenter: 310,
      angleSpread: 60,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0, 1],    // block_pallet + concrete_pole
      dominantDecalIndices: [0, 3],   // mortar + dust
      density: 1.5
    },
    // Zone Murs (Ouest) — sections de mur + poussière béton
    {
      angleCenter: 190,
      angleSpread: 70,
      distMin: 320,
      distMax: 720,
      dominantPropIndices: [1],       // concrete_pole
      dominantDecalIndices: [1, 3],   // rubble + dust
      density: 1.2
    }
  ],
  baseTileIndex: 0,            // tuile poussière béton de base (index 0)
  decalDensityMultiplier: 1.0  // gros œuvre semi-propre : béton frais, densité moyenne
}

const ECHAFAUDAGES_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_stage06_${i}`, file: `stage06/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_stage06_bolt',   file: 'stage06/decals/bolt_scatter.png' },
    { key: 'decal_stage06_shadow', file: 'stage06/decals/tube_shadow.png' }
  ],
  // Clutter streamé : cadres + planchers + garde-corps + échelles.
  // La nacelle (boom_lift) et la tour complète (scaffold_tower) sont dans `structures` (placées UNE fois).
  props: [
    { key: 'prop_stage06_scaffold',    file: 'stage06/props/scaffold.png',    scale: 0.90, count: 3 },
    { key: 'prop_stage06_plancher',    file: 'stage06/props/plancher.png',    scale: 0.85, count: 3 },
    { key: 'prop_stage06_garde_corps', file: 'stage06/props/garde_corps.png', scale: 0.80, count: 3 },
    { key: 'prop_stage06_echelle',     file: 'stage06/props/echelle.png',     scale: 0.80, count: 3 },
    { key: 'prop_stage06_tubes',       file: 'stage06/props/tubes.png',       scale: 0.70, count: 2 }
  ],
  enemies: {
    boulon:   { key: 'enemy_stage06_base', file: 'stage06/enemies/base_walk.png', frame: 256, scale: 0.71 },
    grimpeur: { key: 'enemy_stage06_fast', file: 'stage06/enemies/fast_walk.png', frame: 256, scale: 0.65 },
    pylone:   { key: 'enemy_stage06_tank', file: 'stage06/enemies/tank_walk.png', frame: 256, scale: 0.77 }
  },
  boss: { key: 'boss_stage06', file: 'stage06/boss/boss_walk.png', frame: 256, scale: 1.41 },
  // Échafaudages : tour-héros (landmark) + nacelle ciseaux (band near) + grilles de structure (mid).
  landmark: { key: 'landmark_stage06', file: 'stage06/landmarks/scaffold_tower.png', scale: 1.5, count: 1 },
  // Nacelle jaune hero (proche, bande 'near') + grilles de cadres métal réparties (bande 'mid').
  // Ordre = ordre des angles scriptés (structureAngles).
  structures: [
    { key: 'struct_stage06_nacelle', file: 'stage06/props/boom_lift.png',          scale: 1.1,  count: 1, band: 'near' },
    { key: 'struct_stage06_grid',    file: 'stage06/structures/scaffold_grid.png', scale: 0.80, count: 5, band: 'mid'  }
  ],
  ambient: { key: 'npc_stage06', file: 'stage06/npc/echafaudeur_work.png', frame: 256, scale: 0.68, framePeriodMs: 260 },
  // ── Composition scriptée stage 06 (échafaudages) ─────────────────────────────
  // Géographie : nacelle jaune (idx0) côté NE proche imposante, 5 grilles de cadres
  // réparties en arc O-SO-S-N (structures géométriques autour de l'arène).
  // Landmark (tour complète) au Nord. PNJ monteur près de la nacelle NE, serrant un boulon.
  geometry: {
    // structureAngles[i] → structure i, dans l'ordre de `structures[]` :
    //   0 = boom_lift / nacelle (NE, ~50°) — héros jaune visible côté NE
    //   1-5 = scaffold_grid (arc O-SO-S-N : 170°, 215°, 260°, 85°, 320°)
    structureAngles: [50, 170, 215, 260, 85, 320],
    landmarkAngle: 75,    // tour d'échafaudage-héros au Nord-Est
    ambientAngle:  55     // monteur près de la nacelle NE, boulon en main
  },
  // Zones métier : 3 secteurs complémentaires
  zones: [
    // Secteur Montage NE — dense en planchers + cadres autour de la nacelle
    {
      angleCenter: 50,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0, 1],    // scaffold frame + plancher
      dominantDecalIndices: [0],      // bolt_scatter
      density: 1.5
    },
    // Secteur Structures (Ouest) — grilles métal + ombres de tubes
    {
      angleCenter: 200,
      angleSpread: 65,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0, 2],    // scaffold frame + garde_corps
      dominantDecalIndices: [1],      // tube_shadow
      density: 1.3
    },
    // Passage échelles (SE) — échelles + garde-corps légers
    {
      angleCenter: 315,
      angleSpread: 50,
      distMin: 320,
      distMax: 700,
      dominantPropIndices: [3, 2],    // echelle + garde_corps
      dominantDecalIndices: [1, 0],   // tube_shadow + bolt_scatter
      density: 1.2
    }
  ],
  baseTileIndex: 2,            // tuile gris neutre (index 2)
  decalDensityMultiplier: 0.9  // échafaudages semi-ordonnés, densité légère (géométrique)
}

const CHARPENTE_TOITURE_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_stage07_${i}`, file: `stage07/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_stage07_sawdust',      file: 'stage07/decals/sawdust_fine.png' },
    { key: 'decal_stage07_truss_shadow', file: 'stage07/decals/truss_shadow.png' }
  ],
  // Seul clutter streamé : poutres + tuiles rouges + isolant + gouttières.
  // La charge suspendue (landmark grue) et les fermes de toit sont dans `structures` (placées UNE fois).
  props: [
    { key: 'prop_stage07_beam',      file: 'stage07/props/beam.png',           scale: 0.90, count: 4 },
    { key: 'prop_stage07_tile_pile', file: 'stage07/props/tile_pile.png',      scale: 0.85, count: 5 },
    { key: 'prop_stage07_insul',     file: 'stage07/props/insulation_roll.png', scale: 0.80, count: 3 },
    { key: 'prop_stage07_gutter',    file: 'stage07/props/gutter.png',         scale: 0.75, count: 3 }
  ],
  enemies: {
    copeau:  { key: 'enemy_stage07_base', file: 'stage07/enemies/base_walk.png', frame: 256, scale: 0.5 },
    chevron: { key: 'enemy_stage07_fast', file: 'stage07/enemies/fast_walk.png', frame: 256, scale: 0.66 },
    poutre:  { key: 'enemy_stage07_tank', file: 'stage07/enemies/tank_walk.png', frame: 256, scale: 0.78 }
  },
  boss: { key: 'boss_stage07', file: 'stage07/boss/boss_walk.png', frame: 256, scale: 1.22 },
  // Charpente : landmark « charge suspendue » sur crochet grue + fermes de toit en fond.
  // Lecture en 2 s : bois brun + tuiles rouges (signature) + jaune isolant.
  landmark: { key: 'landmark_stage07', file: 'stage07/landmarks/roof_frame.png', scale: 1.5, count: 1 },
  // Charge suspendue hero (band 'near', côté NE) + 5 fermes de toit réparties (band 'mid').
  // Ordre = ordre des angles scriptés (structureAngles).
  structures: [
    { key: 'struct_stage07_load', file: 'stage07/structures/suspended_load.png', scale: 1.1,  count: 1, band: 'near' },
    { key: 'struct_stage07_truss', file: 'stage07/structures/roof_trusses.png',  scale: 0.85, count: 5, band: 'mid'  }
  ],
  ambient: { key: 'npc_stage07', file: 'stage07/npc/couvreur_work.png', frame: 256, scale: 0.72, framePeriodMs: 240 },
  // ── Composition scriptée stage 07 (charpente/toiture) ────────────────────────
  // Géographie : charge suspendue (idx0) côté NE proche (grue au-dessus),
  // 5 fermes de toit réparties en arc O-SO-S-NO (structure bois partout).
  // Landmark (charpente hero) au Nord. PNJ couvreur posant des tuiles rouges près du NE.
  geometry: {
    // structureAngles[i] → structure i, dans l'ordre de `structures[]` :
    //   0 = suspended_load (NE, ~50°) — charge visible côté NE, grue imaginée hors champ
    //   1-5 = roof_trusses : O (175°), SO (220°), S (260°), NO (110°), ENE (30°)
    structureAngles: [50, 175, 220, 260, 110, 30],
    landmarkAngle: 70,    // charpente-hero au Nord-Est
    ambientAngle:  55     // couvreur posant des tuiles rouges, près de la charge NE
  },
  // Zones métier : 3 secteurs complémentaires
  zones: [
    // Secteur Pose tuiles (NE) — dense en tuiles rouges + sciure autour de la charge
    {
      angleCenter: 50,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [1, 0],    // tile_pile + beam
      dominantDecalIndices: [0],      // sawdust_fine
      density: 1.5
    },
    // Secteur Isolation (SO) — rouleaux d'isolant + ombres de charpente
    {
      angleCenter: 220,
      angleSpread: 60,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [2, 3],    // insulation_roll + gutter
      dominantDecalIndices: [1],      // truss_shadow
      density: 1.3
    },
    // Passage poutres (SE-E) — poutres + sciure
    {
      angleCenter: 315,
      angleSpread: 50,
      distMin: 320,
      distMax: 700,
      dominantPropIndices: [0, 1],    // beam + tile_pile
      dominantDecalIndices: [0, 1],   // sawdust_fine + truss_shadow
      density: 1.2
    }
  ],
  baseTileIndex: 1,            // tuile brun clair (index 1 — bois chantier)
  decalDensityMultiplier: 0.9  // charpente légère, densité légère (bois aéré)
}

export const STAGE_RENDER: Record<string, StageRender> = {
  terrain_vierge: TERRAIN_VIERGE_RENDER,
  terrassement: TERRASSEMENT_RENDER,
  fondations: FONDATIONS_RENDER,
  reseaux_enterres: RESEAUX_ENTERRES_RENDER,
  gros_oeuvre: GROS_OEUVRE_RENDER,
  echafaudages: ECHAFAUDAGES_RENDER,
  charpente_toiture: CHARPENTE_TOITURE_RENDER,
  second_oeuvre: makeStage(
    'stage08',
    ['platras', 'gainard', 'cloison'],
    [
      ['forklift', 0.8, 1],
      ['drywall', 0.8, 4],
      ['insulation', 0.7, 3]
    ],
    ['plaster_dust', 'scrap'],
    [0.72, 0.63, 0.8],
    1.30,
    {
      // Second œuvre : cloisons/pièces en pose partout + plaquiste qui lisse le plâtre.
      landmark: { key: 'landmark_stage08', file: 'stage08/landmarks/partition.png', scale: 1.5, count: 1 },
      structures: [
        { key: 'struct_stage08_partition', file: 'stage08/structures/partition_room.png', scale: 0.8, count: 5, band: 'mid' }
      ],
      ambient: { key: 'npc_stage08', file: 'stage08/npc/plaquiste_work.png', frame: 256, scale: 0.69, framePeriodMs: 280 }
    }
  ),
  finitions: makeStage(
    'stage09',
    ['goutte', 'pinceau', 'pot'],
    [
      ['van', 0.8, 1],
      ['paint', 0.7, 4],
      ['tile_pallet', 0.75, 3]
    ],
    ['paint_spot'],
    [0.68, 0.63, 0.8],
    1.09,
    {
      // Finitions : pièces finies (carrelage, fenêtres) partout + peintre au rouleau.
      landmark: { key: 'landmark_stage09', file: 'stage09/landmarks/finished_corner.png', scale: 1.5, count: 1 },
      structures: [
        { key: 'struct_stage09_room', file: 'stage09/structures/finished_room.png', scale: 0.8, count: 4, band: 'mid' }
      ],
      ambient: { key: 'npc_stage09', file: 'stage09/npc/painter_work.png', frame: 256, scale: 0.74, framePeriodMs: 260 }
    }
  ),
  livraison_audit: makeStage(
    'stage10',
    ['formulaire', 'auditeur', 'commission'],
    [
      ['inspection_van', 1.0, 1],
      ['sign_ok', 0.9, 2],
      ['cones', 0.6, 5]
    ],
    ['tape_line'],
    [0.65, 0.65, 0.88],
    1.25,
    {
      // Livraison/audit : bâtiments livrés « CONFORME » partout + inspecteur qui note.
      landmark: { key: 'landmark_stage10', file: 'stage10/landmarks/gate.png', scale: 1.5, count: 1 },
      structures: [
        { key: 'struct_stage10_building', file: 'stage10/structures/building.png', scale: 0.7, count: 5, band: 'mid' }
      ],
      ambient: { key: 'npc_stage10', file: 'stage10/npc/inspecteur_work.png', frame: 256, scale: 0.71, framePeriodMs: 340 }
    }
  )
}

/** Config de rendu d'un stage, avec repli sur le terrain vierge. */
export function stageRender(stageId: string): StageRender {
  return STAGE_RENDER[stageId] ?? TERRAIN_VIERGE_RENDER
}
