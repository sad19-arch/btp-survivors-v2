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

import { CITY_BUILDINGS } from './cityBuildings.generated'

export { CITY_BUILDINGS }

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
 * Les points tombant dans la zone reçoivent un choix prioritaire parmi les
 * indices dominants (la densité globale du stage est réglée par
 * `DecorStreamerOpts.decalDensityMultiplier`, pas par zone).
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
}

/**
 * Ambiance INTÉRIEURE d'un stage (phases 05→10 : on est « dans le bâtiment »).
 * Rendu observer-only, déterministe (grille géométrique, aucun RNG) :
 *  - une GRILLE de colonnes/poteaux structurels streamée sur tout le monde
 *    (dépth sous les entités) → forte lecture « intérieur de bâtiment » ;
 *  - un VOILE de lumière chaude posé sur le sol/décor (sous les entités) →
 *    ambiance « éclairage artificiel intérieur », sans nuire à la lisibilité.
 * N'affecte PAS la simulation (sim:check reste diff 0).
 */
export interface InteriorTheme {
  /** Clé de texture de la colonne structurelle. */
  columnKey: string
  /** Fichier de la colonne (préchargé par GameScene). */
  columnFile: string
  /** Espacement de la grille de colonnes (px). Défaut 760. */
  columnSpacing?: number
  /** Échelle de rendu des colonnes. Défaut 1.0. */
  columnScale?: number
  /** Couleur du voile d'ambiance intérieure (défaut 0xffd9a0 = chaud). */
  tint?: number
  /** Opacité du voile (0..1). Défaut 0.12. 0 = pas de voile. */
  tintAlpha?: number
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
  /** PNJ d'ambiance non-hostiles (feuilles perso, geste métier) — la « vie » du chantier. */
  ambient?: StageAmbientNpc[]
  /** Géographie scriptée (angles fixes) — optionnel, repli aléatoire si absent. */
  geometry?: StageGeometry
  /** Zones de clustering thématique — optionnel, repli uniforme si absent. */
  zones?: DecorZone[]
  /** Indice de la tuile de base du sol (dans `ground[]`, défaut 0). */
  baseTileIndex?: number
  /** Multiplicateur de densité des décalques (défaut 1.0 — brut > fini). */
  decalDensityMultiplier?: number
  /** Ambiance intérieure (phases 05→10) — grille de colonnes + voile chaud. Optionnel. */
  interior?: InteriorTheme
  /**
   * Assets réservés au Stage Composer Editor : préchargés (pour que les compos
   * sauvées soient jouables) et exposés dans la palette, mais JAMAIS placés
   * automatiquement par le jeu (aucun scatter). Le gameplay auto reste inchangé.
   */
  editorExtras?: StageEditorExtra[]
  /**
   * Anneau d'immeubles de bordure de carte. Optionnel — repli sur l'anneau urbain
   * partagé `CITY_PERIMETER` (le voisinage du chantier ne dépend pas de la phase).
   */
  perimeter?: PerimeterRing
}

/** Anneau d'immeubles cadrant les limites de la carte (render-only, streamé au périmètre). */
export interface PerimeterRing {
  /** Clés de textures des façades disponibles (choix déterministe par position). */
  keys: string[]
  /** Pas de la grille le long des bords (px). Défaut 240. */
  spacing?: number
  /** Décalage vers l'intérieur depuis le bord du monde (px). Défaut 130. */
  margin?: number
  /** Échelle des sprites d'immeuble. Défaut 1.0. */
  scale?: number
}

/**
 * Façades d'immeubles PARTAGÉES par tous les stages (anneau urbain de bordure).
 * Fichiers `public/city/*` — façades plates vue de face (PixelLab), coins
 * transparents (QA-clean). Servent au préchargement (`GameScene`), à l'anneau
 * streamé (`CITY_PERIMETER`) et à la palette éditeur (`SHARED_DECOR_ASSETS`).
 */
/** Anneau urbain par défaut appliqué à tous les stages (sauf override `StageRender.perimeter`). */
export const CITY_PERIMETER: PerimeterRing = {
  keys: CITY_BUILDINGS.map((b) => b.key),
  spacing: 240,
  margin: 130,
  scale: 1.0
}

/** Asset exposé dans l'éditeur (préchargé pour les compos) mais jamais scatteré par le jeu. */
export interface StageEditorExtra {
  key: string
  file: string
  role: 'prop' | 'structure' | 'decal'
  /** Largeur d'une frame si l'asset est une feuille horizontale. */
  frame?: number
}

/** PNJ d'ambiance : skin perso + comportement + période d'animation optionnelle. */
export interface StageAmbientNpc extends StageEnemySprite {
  /** Comportement de déplacement : 'work' = errance courte (~24 px), 'patrol' = plus large (~120 px). */
  behavior: 'work' | 'patrol'
  /**
   * Catégorie éditeur : 'trade' = métier fixe animé (défaut) ; 'worker' = ouvrier
   * mobile (feuille marche 4×4, marche + fuite). Sert au Stage Composer à séparer
   * les 2 sections de PNJ et à choisir le rendu.
   */
  kind?: 'trade' | 'worker'
  /** Période d'une frame du geste, en ms (défaut 300). */
  framePeriodMs?: number
  /** Nombre d'instances de ce PNJ (défaut 1 — réservé pour B5+). */
  count?: number
}

/** Ajouts optionnels d'ambiance d'un stage (landmark + structures + PNJ + composition). */
export interface StageExtra {
  landmark?: StageProp
  structures?: StageStructure[]
  ambient?: StageAmbientNpc[]
  geometry?: StageGeometry
  zones?: DecorZone[]
  baseTileIndex?: number
  decalDensityMultiplier?: number
}

export const DEFAULT_STAGE = 'terrain_vierge'

/**
 * PNJ « ouvriers » GÉNÉRIQUES (bleu de chantier, casque blanc) — PARTAGÉS par
 * TOUS les stages (pas spécifiques à une phase). Feuilles marche 4×4 192.
 * Exposés dans l'éditeur sur chaque stage (section « PNJ ouvrier (mobile) ») et
 * préchargés par GameScene partout. Les 3 variantes = diversité (maghrébin/black/est).
 */
/**
 * Ouvriers génériques, partagés par les 10 stages. Ils portent des PRÉNOMS et
 * non « A/B/C » : les trois sprites sont visuellement distincts (peau mate et
 * moustache · peau noire · blond), mais leurs anciens noms ne le disaient pas —
 * dans la palette, il fallait cliquer pour découvrir qui on posait.
 */
export const SHARED_WORKER_NPCS: StageAmbientNpc[] = [
  { key: 'npc_ouvrier_zinedine', file: 'stage01/npc/ouvrier_zinedine_walk.png', frame: 192, scale: 0.62, framePeriodMs: 200, behavior: 'patrol', kind: 'worker' },
  { key: 'npc_ouvrier_marius', file: 'stage01/npc/ouvrier_marius_walk.png', frame: 192, scale: 0.62, framePeriodMs: 200, behavior: 'patrol', kind: 'worker' },
  { key: 'npc_ouvrier_erling', file: 'stage01/npc/ouvrier_erling_walk.png', frame: 192, scale: 0.62, framePeriodMs: 200, behavior: 'patrol', kind: 'worker' }
]

/**
 * Anciennes clés → nouvelles. **Ne pas supprimer** : des compositions déjà
 * sauvegardées posent des PNJ sous `npc_ouvrier_a/b/c`. Sans cette table, elles
 * ne résolvent plus et les PNJ disparaissent SANS la moindre erreur — le rendu
 * teste `textures.exists(skin)` puis `continue` en silence.
 */
export const WORKER_SKIN_ALIASES: Record<string, string> = {
  npc_ouvrier_a: 'npc_ouvrier_zinedine',
  npc_ouvrier_b: 'npc_ouvrier_marius',
  npc_ouvrier_c: 'npc_ouvrier_erling'
}

/** Résout un skin d'ouvrier via les alias. Clé inconnue → rendue telle quelle. */
export function resolveWorkerSkin(key: string): string {
  return WORKER_SKIN_ALIASES[key] ?? key
}

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

/**
 * Skin PARTAGÉ de l'élite « porteur de coffre » (convoyeur), commun à tous les
 * stages (invoqué par le directeur de coffres, hors pools de phase). Costaud et
 * imposant (échelle > ennemis ordinaires) pour signaler l'objectif.
 */
export const CONVOYEUR_SKIN: StageEnemySprite = {
  key: 'convoyeur',
  file: 'shared/convoyeur_walk.png',
  frame: 192,
  scale: 1.5
}

/**
 * Skin PARTAGÉ du camion benne des chemins camion (`truck_path`), commun aux 10
 * stages — même patron que `CONVOYEUR_SKIN` : une const ici + un `load.spritesheet`
 * dans `GameScene.preload`.
 *
 * Pourquoi PARTAGÉ : le repli historique était `prop_s2_truck`, déclaré au SEUL
 * stage 02 — un chemin camion posé sur les 9 autres stages était donc ignoré
 * SANS UN MOT (`siteWorkers` n'avait qu'un `continue`). Un skin commun supprime
 * la cause racine plutôt que de la signaler.
 *
 * Feuille 4×4 de cellules 192 (lignes sud/est/nord/ouest) : contrairement à
 * `prop_s2_truck` (image MONO-frame retournée par `flipX`), le camion a ici 4
 * VRAIES orientations — un camion ne se conduit pas en miroir.
 */
export const CAMION_SKIN: StageEnemySprite = {
  key: 'camion_benne',
  file: 'shared/camion_benne_walk.png',
  frame: 192,
  scale: 1.0
}

const TERRAIN_VIERGE_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_${i}`, file: `stage01/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_puddle',  file: 'stage01/decals/puddle.png' },
    { key: 'decal_weeds',   file: 'stage01/decals/weeds.png' },
    { key: 'decal_pebbles', file: 'stage01/decals/pebbles.png' },
    { key: 'decal_crack',   file: 'stage01/decals/crack.png' },
    { key: 'decal_tracks',  file: 'stage01/decals/tracks.png' }
  ],
  // Clutter streamé : piquets+rubalise, cailloux, herbe sèche, terre molle.
  // La cabane, le panneau de chantier et les barrières sont des `structures`
  // (placées UNE fois, scriptées) pour éviter leur réplication en vrac.
  props: [
    { key: 'prop_stakes', file: 'stage01/props/survey_stakes.png', scale: 1.1, count: 4 },
    { key: 'prop_rocks',  file: 'stage01/props/rock_cluster.png',  scale: 1.0, count: 5 },
    { key: 'prop_weeds',  file: 'stage01/props/dry_weeds.png',     scale: 1.0, count: 6 },
    { key: 'prop_soft',   file: 'stage01/props/soft_ground.png',   scale: 1.1, count: 3 },
    // Végétation (habillage du terrain vierge) — indices 4-7, référencés en zones.
    { key: 'prop_stage01_tree_a', file: 'stage01/props/tree_a.png', scale: 1.0, count: 4 },
    { key: 'prop_stage01_tree_b', file: 'stage01/props/tree_b.png', scale: 1.0, count: 3 },
    { key: 'prop_stage01_bush_a', file: 'stage01/props/bush_a.png', scale: 1.0, count: 5 },
    { key: 'prop_stage01_bush_b', file: 'stage01/props/bush_b.png', scale: 1.0, count: 5 }
  ],
  enemies: {
    huissier:   { key: 'brute',   file: 'stage01/enemies/brute_walk.png',   frame: 192, scale: 1.0 },
    inspecteur: { key: 'imp',     file: 'stage01/enemies/imp_walk.png',     frame: 192, scale: 0.9 },
    paperasse:  { key: 'mudling', file: 'stage01/enemies/mudling_walk.png', frame: 192, scale: 1.25 },
    motton:     { key: 'motton', file: 'stage01/enemies/motton_walk.png', frame: 192, scale: 0.64 },
    enracineur: { key: 'enracineur', file: 'stage01/enemies/enracineur_walk.png', frame: 192, scale: 0.938 }
  },
  boss: GROUND_KEEPER,
  // Terrain vierge : panneau « PERMIS DE CONSTRUIRE » en bordure de parcelle.
  landmark: { key: 'landmark_stage01', file: 'stage01/landmarks/permit.png', scale: 1.5, count: 1 },
  // Structures-héros : panneau chantier (sign NE), algeco (cabin SE),
  // barrières rouge/blanc (tape N), puis 3 parcelles piquetées (plot × 3 mid).
  // Ordre = ordre des angles scriptés (structureAngles).
  structures: [
    { key: 'struct_stage01_sign',  file: 'stage01/props/site_sign.png',     scale: 1.0, count: 1, band: 'near' },
    { key: 'struct_stage01_cabin', file: 'stage01/props/site_cabin.png',    scale: 1.1, count: 1, band: 'near' },
    { key: 'struct_stage01_tape',  file: 'stage01/props/boundary_tape.png', scale: 1.0, count: 2, band: 'near' },
    { key: 'struct_stage01_plot',  file: 'stage01/structures/plot.png',     scale: 0.85, count: 3, band: 'mid'  }
  ],
  ambient: [
    // Métier de la phase (fixe, geste en place) — kind:'trade'. Le géomètre porte
    // son théodolite = vraie action métier. Les faux « ouvriers casqués »
    // (topographe/piqueteur/ouvplan) ont été retirés : un PNJ métier doit porter
    // du matériel et faire une action de métier (creuser à la pelle, peindre…).
    { key: 'npc_stage01', file: 'stage01/npc/geometre_work.png', frame: 256, scale: 0.78, framePeriodMs: 320, behavior: 'work', kind: 'trade' },
    // Métiers « bonne facture » (PixelLab v3, geste 8 frames) — 2 par stage.
    { key: 'npc_stage01_geometre_trade', file: 'stage01/npc/geometre_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage01_chef_trade', file: 'stage01/npc/chef_chantier_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' }
  ],
  // ── Composition scriptée stage 01 (terrain vierge) ───────────────────────
  // Géographie : panneau (sign=idx0) côté NE proche, algeco (cabin=idx1) côté SE,
  // barrières (tape=idx2, count:2) côté N et NO, 3 parcelles (plot=idx3-5) éparse.
  // Landmark (permis) au bord Est. PNJ géomètre près du panneau NE.
  geometry: {
    // structureAngles[i] → 1 instance par angle (count:2 du tape → 2 entrées)
    //   0 = sign NE (50°)    1 = cabin SE (310°)
    //   2 = tape N (90°)     3 = tape NO (145°)
    //   4-6 = plot : NNO (120°), OSO (215°), SSE (280°)
    structureAngles: [50, 310, 90, 145, 120, 215, 280],
    landmarkAngle:   20,   // permis de construire côté Est (lisible en bordure)
    ambientAngle:    50    // géomètre près du panneau NE (il vise le terrain)
  },
  // Zones métier : 3 secteurs complémentaires
  zones: [
    // Secteur Implantation (NE) — dense en piquets + traces de passage
    {
      angleCenter:       50,
      angleSpread:       55,
      distMin:          340,
      distMax:          760,
      dominantPropIndices:  [0],    // survey_stakes (piquets)
      dominantDecalIndices: [4],    // tracks (ornières)
    },
    // Secteur Terrain nu (SO) — herbe sèche + cailloux
    {
      angleCenter:      220,
      angleSpread:       65,
      distMin:          340,
      distMax:          760,
      dominantPropIndices:  [2, 1, 6, 7], // dry_weeds + rock_cluster + buissons
      dominantDecalIndices: [1, 2], // weeds + pebbles
    },
    // Bordure Nord-Ouest — terre molle + arbres (terrain peu foulé, habillé)
    {
      angleCenter:      150,
      angleSpread:       55,
      distMin:          320,
      distMax:          720,
      dominantPropIndices:  [3, 4, 5], // soft_ground + arbres
      dominantDecalIndices: [0, 2], // puddle + pebbles
    }
  ],
  baseTileIndex:          0,   // tuile terre/herbe de base (index 0)
  decalDensityMultiplier: 1.2, // terrain brut début de chantier, densité moyenne
  // Assets d'implantation exposés dans l'éditeur (préchargés, JAMAIS scatterés).
  // Le jeu auto est inchangé ; ils ne servent qu'à composer + jouer une compo.
  editorExtras: [
    { key: 'prop_stage01_theodolite',  file: 'stage01/props/theodolite.png',         role: 'structure' },
    { key: 'prop_stage01_mire',        file: 'stage01/props/measuring_staff.png',     role: 'prop' },
    { key: 'prop_stage01_stake1',      file: 'stage01/props/survey_stake_single.png', role: 'prop' },
    { key: 'prop_stage01_stake_bundle', file: 'stage01/props/stake_bundle.png',       role: 'prop' },
    { key: 'prop_stage01_tape_reel',   file: 'stage01/props/tape_reel.png',           role: 'prop' },
    { key: 'prop_stage01_rubalise',    file: 'stage01/props/rubalise.png',            role: 'prop' },
    { key: 'prop_stage01_sign_speed',  file: 'stage01/props/sign_speed.png',          role: 'prop' },
    { key: 'prop_stage01_cones',       file: 'stage01/props/cone_cluster.png',        role: 'prop' },
    { key: 'struct_stage01_wc',        file: 'stage01/props/site_toilet.png',         role: 'structure' },
    { key: 'struct_stage01_plan_table', file: 'stage01/props/plan_table.png',         role: 'structure' },
    { key: 'decal_stage01_layout_cross',  file: 'stage01/decals/layout_cross.png',    role: 'decal' },
    { key: 'decal_stage01_layout_corner', file: 'stage01/decals/layout_corner.png',   role: 'decal' },
    { key: 'decal_stage01_layout_line',   file: 'stage01/decals/layout_line.png',     role: 'decal' }
  ]
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
  // MACHINES VIVANTES — feuilles animées des engins (les statiques ci-dessus
  // RESTENT déclarés : mêmes engins, clés distinctes). `frame` ⇒ load.spritesheet,
  // condition pour que `animation: { frameRate }` d'un élément de cluster joue.
  // `_work` = engin POSÉ (geste métier, châssis fixe) ; `_move` = engin qui
  // PARCOURT un chemin (chenilles/roues qui défilent, reste en position transport).
  editorExtras: [
    { key: 'prop_s2_excavator_work', file: 'stage02/props/excavator_work.png', role: 'prop', frame: 192 },
    { key: 'prop_s2_excavator_move', file: 'stage02/props/excavator_move.png', role: 'prop', frame: 192 },
    { key: 'prop_s2_truck_work', file: 'stage02/props/dump_truck_work.png', role: 'prop', frame: 192 },
    { key: 'prop_s2_truck_move', file: 'stage02/props/dump_truck_move.png', role: 'prop', frame: 192 },
    { key: 'prop_s2_dozer_work', file: 'stage02/props/bulldozer_work.png', role: 'prop', frame: 192 },
    { key: 'prop_s2_dozer_move', file: 'stage02/props/bulldozer_move.png', role: 'prop', frame: 192 }
  ],
  ambient: [
    { key: 'npc_stage02', file: 'stage02/npc/terrassier_work.png', frame: 180, scale: 0.78, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage02_conducteur_trade', file: 'stage02/npc/conducteur_engins_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage02_signaleur', file: 'stage02/npc/signaleur_work.png', frame: 256, scale: 1.53,  framePeriodMs: 300, behavior: 'patrol' },
    { key: 'npc_stage02_porteur',   file: 'stage02/npc/porteur_work.png',   frame: 256, scale: 1.61,  framePeriodMs: 300, behavior: 'work' },
    { key: 'npc_stage02_macon',     file: 'stage02/npc/macon_work.png',     frame: 256, scale: 1.61,  framePeriodMs: 320, behavior: 'work' }
  ],
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
    },
    // Secteur Déblais (SE) — tas de terre + flaques boueuses
    {
      angleCenter: 310,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0],       // tas de terre
      dominantDecalIndices: [1],      // puddle (flaques)
    },
    // Passage d'engins (Ouest) — ornières marquées
    {
      angleCenter: 180,
      angleSpread: 60,
      distMin: 320,
      distMax: 720,
      dominantPropIndices: [0],
      dominantDecalIndices: [0],      // tracks
    }
  ],
  baseTileIndex: 0,           // tuile boue de base (index 0)
  decalDensityMultiplier: 1.9 // terrassement = dig ACTIF : tas + ornières denses (sinon sol trop nu)
}


const FONDATIONS_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_stage03_${i}`, file: `stage03/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_stage03_spill', file: 'stage03/decals/spill.png' },
    { key: 'decal_stage03_crack', file: 'stage03/decals/crack.png' },
    { key: 'decal_stage03_layout', file: 'stage03/decals/layout_chalk.png' }
  ],
  // Seul clutter streamé : béton mini + ferraillage + coffrage.
  // Les GROS ENGINS (toupies, pompe) sont dans `structures` (placés 1 fois).
  props: [
    { key: 'prop_stage03_concrete_mixer', file: 'stage03/props/concrete_mixer.png', scale: 0.65, count: 3 },
    { key: 'prop_stage03_rebar',          file: 'stage03/props/rebar.png',           scale: 0.75, count: 4 },
    { key: 'prop_stage03_wheelbarrow',    file: 'stage03/props/wheelbarrow_empty.png', scale: 0.78, count: 2 },
    { key: 'prop_stage03_wheelbarrow_concrete', file: 'stage03/props/wheelbarrow_concrete.png', scale: 0.78, count: 2 },
    { key: 'prop_stage03_sand',           file: 'stage03/props/sand_pile.png',        scale: 0.82, count: 2 },
    { key: 'prop_stage03_gravel',         file: 'stage03/props/gravel_pile.png',      scale: 0.82, count: 2 },
    { key: 'prop_stage03_big_bag',        file: 'stage03/props/aggregate_big_bag.png', scale: 0.78, count: 2 },
    { key: 'prop_stage03_hose_coiled',    file: 'stage03/props/pump_hose_coiled.png', scale: 0.72, count: 1 },
    { key: 'prop_stage03_tarp_folded',    file: 'stage03/props/curing_tarp_folded.png', scale: 0.75, count: 1 }
  ],
  enemies: {
    gachee:      { key: 'enemy_stage03_base', file: 'stage03/enemies/base_walk.png', frame: 256, scale: 1.18 },
    ferrailleur: { key: 'enemy_stage03_fast', file: 'stage03/enemies/fast_walk.png', frame: 256, scale: 0.62 },
    massif:      { key: 'enemy_stage03_tank', file: 'stage03/enemies/tank_walk.png', frame: 256, scale: 0.94 }
  },
  boss: { key: 'boss_stage03', file: 'stage03/boss/boss_walk.png', frame: 256, scale: 1.25 },
  // Fondations : dalle-héros + toupies + coulées de béton + ferrailleur au travail.
  landmark: { key: 'landmark_stage03', file: 'stage03/landmarks/slab.png', scale: 1.12, count: 1 },
  // Engins-héros placés UNE fois (toupie jaune NE, pompe orange SE)
  // + travées de coffrage en fond. Ordre = ordre des angles scriptés.
  structures: [
    { key: 'struct_stage03_mixer',    file: 'stage03/props/mixer_truck.png',     scale: 0.72, count: 1, band: 'near' },
    { key: 'struct_stage03_pump',     file: 'stage03/props/concrete_pump.png',   scale: 0.72, count: 1, band: 'near' },
    { key: 'struct_stage03_bay',      file: 'stage03/structures/formwork_bay.png', scale: 0.85, count: 5, band: 'mid'  }
  ],
  ambient: [
    { key: 'npc_stage03', file: 'stage03/npc/ferrailleur_work.png', frame: 180, scale: 0.78, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage03_coffreur_trade', file: 'stage03/npc/coffreur_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage03_coffreur', file: 'stage03/npc/coffreur_work.png',    frame: 256, scale: 1.532, framePeriodMs: 300, behavior: 'work' },
    { key: 'npc_stage03_betonnier',file: 'stage03/npc/betonnier_work.png',   frame: 256, scale: 1.532, framePeriodMs: 300, behavior: 'patrol' },
    { key: 'npc_stage03_cimentier',file: 'stage03/npc/cimentier_work.png',   frame: 256, scale: 1.484, framePeriodMs: 300, behavior: 'work' }
  ],
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
    },
    // Secteur Coffrage (SO) — travées de coffrage + fissures
    {
      angleCenter: 220,
      angleSpread: 60,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [8],       // bache de cure : le coffrage reste compose en scene
      dominantDecalIndices: [1],      // crack (fissures)
    },
    // Passage pompe (SE) — béton frais + ferraillage
    {
      angleCenter: 315,
      angleSpread: 50,
      distMin: 320,
      distMax: 700,
      dominantPropIndices: [0, 1],    // concrete_mixer + rebar
      dominantDecalIndices: [0],      // spill
    }
  ],
  editorExtras: [
    // MACHINES VIVANTES (cf. stage02) — toupie + bétonnière, cuve qui tourne.
    { key: 'struct_stage03_mixer_work', file: 'stage03/props/mixer_truck_work.png', role: 'structure', frame: 192 },
    { key: 'prop_stage03_concrete_mixer_work', file: 'stage03/props/concrete_mixer_work.png', role: 'prop', frame: 128 },
    { key: 'prop_stage03_formwork', file: 'stage03/props/formwork.png', role: 'structure' },
    { key: 'prop_stage03_shovel', file: 'stage03/props/tool_shovel.png', role: 'prop' },
    { key: 'prop_stage03_pickaxe', file: 'stage03/props/tool_pickaxe.png', role: 'prop' },
    { key: 'prop_stage03_trowel', file: 'stage03/props/tool_trowel.png', role: 'prop' },
    { key: 'prop_stage03_mason_rule', file: 'stage03/props/tool_mason_rule.png', role: 'prop' },
    { key: 'prop_stage03_spirit_level', file: 'stage03/props/tool_spirit_level.png', role: 'prop' },
    { key: 'prop_stage03_laser_level', file: 'stage03/props/tool_laser_level.png', role: 'prop' },
    { key: 'prop_stage03_chalk_line', file: 'stage03/props/tool_chalk_line.png', role: 'prop' },
    { key: 'prop_stage03_stakes', file: 'stage03/props/stakes_bundle.png', role: 'prop' },
    { key: 'prop_stage03_marking_spray', file: 'stage03/props/tool_marking_spray.png', role: 'prop' },
    { key: 'prop_stage03_hand_saw', file: 'stage03/props/tool_hand_saw.png', role: 'prop' },
    { key: 'prop_stage03_circular_saw', file: 'stage03/props/tool_circular_saw.png', role: 'prop' },
    { key: 'prop_stage03_hammer', file: 'stage03/props/tool_formwork_hammer.png', role: 'prop' },
    { key: 'prop_stage03_mixing_tub', file: 'stage03/props/mixing_tub.png', role: 'prop' },
    { key: 'prop_stage03_bucket', file: 'stage03/props/mason_bucket.png', role: 'prop' },
    { key: 'prop_stage03_float', file: 'stage03/props/tool_float_trowel.png', role: 'prop' },
    { key: 'prop_stage03_pliers', file: 'stage03/props/tool_rebar_pliers.png', role: 'prop' },
    { key: 'prop_stage03_bag_open', file: 'stage03/props/concrete_bag_open.png', role: 'prop' },
    { key: 'prop_stage03_boards', file: 'stage03/props/formwork_boards_loose.png', role: 'prop' },
    { key: 'prop_stage03_clamps', file: 'stage03/props/formwork_clamps_kit.png', role: 'prop' },
    { key: 'prop_stage03_starter_rebars', file: 'stage03/props/starter_rebars.png', role: 'prop' },
    { key: 'prop_stage03_column_cage', file: 'stage03/props/column_rebar_cage.png', role: 'structure' },
    { key: 'prop_stage03_footing_cage', file: 'stage03/props/footing_rebar_cage.png', role: 'structure' },
    { key: 'prop_stage03_spacers', file: 'stage03/props/rebar_spacers.png', role: 'prop' },
    { key: 'prop_stage03_binding_wire', file: 'stage03/props/binding_wire.png', role: 'prop' },
    { key: 'prop_stage03_vibrator', file: 'stage03/props/concrete_vibrator.png', role: 'prop' },
    { key: 'prop_stage03_hose_active', file: 'stage03/props/pump_hose_active.png', role: 'prop', frame: 32 },
    { key: 'prop_stage03_chute', file: 'stage03/props/concrete_chute.png', role: 'prop' },
    { key: 'prop_stage03_power_trowel', file: 'stage03/props/power_trowel.png', role: 'prop' },
    { key: 'struct_stage03_blinding', file: 'stage03/structures/blinding_concrete.png', role: 'structure' },
    { key: 'struct_stage03_strip_rebar', file: 'stage03/structures/strip_footing_rebar.png', role: 'structure' },
    { key: 'struct_stage03_strip_fresh', file: 'stage03/structures/strip_footing_fresh.png', role: 'structure' },
    { key: 'struct_stage03_pad_starters', file: 'stage03/structures/pad_footing_starters.png', role: 'structure' },
    { key: 'struct_stage03_grade_beam', file: 'stage03/structures/grade_beam.png', role: 'structure' },
    { key: 'struct_stage03_slab_rebar', file: 'stage03/structures/slab_rebar_exposed.png', role: 'structure' },
    { key: 'prop_stage03_tarp_covered', file: 'stage03/props/tarp_covered_materials.png', role: 'prop' },
    { key: 'prop_stage03_steel_props', file: 'stage03/props/steel_props_rack.png', role: 'structure' }
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
  // MACHINES VIVANTES (cf. stage02) — mini-pelle : `_work` = le bras creuse
  // (châssis fixe), `_move` = les chenilles défilent (bras en transport).
  // `frame` ⇒ load.spritesheet : condition pour que `animation: { frameRate }`
  // d'un élément de cluster joue.
  editorExtras: [
    { key: 'struct_stage04_excavator_work', file: 'stage04/props/mini_excavator_work.png', role: 'structure', frame: 192 },
    { key: 'struct_stage04_excavator_move', file: 'stage04/props/mini_excavator_move.png', role: 'structure', frame: 192 }
  ],
  ambient: [
    { key: 'npc_stage04', file: 'stage04/npc/poseur_work.png', frame: 180, scale: 0.78, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage04_electricien_trade', file: 'stage04/npc/electricien_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage04_plombier',    file: 'stage04/npc/plombier_work.png',     frame: 256, scale: 1.583, framePeriodMs: 300, behavior: 'work' },
    { key: 'npc_stage04_poseur_cable',file: 'stage04/npc/poseur_cable_work.png', frame: 256, scale: 1.610, framePeriodMs: 300, behavior: 'patrol' },
    { key: 'npc_stage04_gainier',     file: 'stage04/npc/gainier_work.png',      frame: 256, scale: 1.638, framePeriodMs: 300, behavior: 'work' }
  ],
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
    },
    // Secteur Tirage câbles (SO) — tourets + regards + ornières boueuses
    {
      angleCenter: 225,
      angleSpread: 65,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [2, 3],  // cable_reel + regard
      dominantDecalIndices: [1, 2], // mud + cables
    },
    // Tranchée principale (SE-E) — gaines + regards + tranchée
    {
      angleCenter: 310,
      angleSpread: 55,
      distMin: 320,
      distMax: 720,
      dominantPropIndices: [1, 3],  // trencher + regard
      dominantDecalIndices: [0],    // trench
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
  // MACHINES VIVANTES (cf. stage02) — grue à tour, flèche qui slew autour du mât.
  // NB : `struct_stage05_mixer` pointe sur `mobile_crane.png` qui contient en
  // réalité une TOUPIE (le nom du fichier ment ; la clé dit vrai) : sa feuille
  // animée est donc « cuve qui tourne », pas « flèche ».
  // Le crochet de grue, lui, TOURNE lentement sur son câble (le modèle a rendu
  // une vrille, pas un balancier — d'où une boucle directe et non un aller-retour).
  // ⚠️ RÉSERVE DA sur `struct_stage05_mixer_work` : ses frames sont plus PLATES
  // (angle de caméra plus bas) que la statique, qui a une vraie 3/4. Cause
  // isolée : c'est `animate_object` v3 qui aplatit, PAS la source — testé sur
  // 2 vues source ('low'/'high top-down') × 3 formulations d'animation, dont un
  // « camera locked » explicite. Aucun paramètre d'API ne pilote la vue de
  // l'animation. La statique reste posée ; cette clé n'est branchée nulle part.
  editorExtras: [
    { key: 'struct_stage05_crane_work', file: 'stage05/props/tower_crane_work.png', role: 'structure', frame: 224 },
    { key: 'struct_stage05_mixer_work', file: 'stage05/props/mobile_crane_work.png', role: 'structure', frame: 224 },
    { key: 'prop_stage05_crane_hook_work', file: 'stage05/props/crane_hook_work.png', role: 'prop', frame: 96 },
    { key: 'continuity_stage05_shell', file: 'stage05/landmarks/walls.png', role: 'structure' }
  ],
  ambient: [
    { key: 'npc_stage05', file: 'stage05/npc/macon_work.png', frame: 180, scale: 0.78, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage05_grutier_trade', file: 'stage05/npc/grutier_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage05_parpaingueur', file: 'stage05/npc/parpaingueur_work.png', frame: 256, scale: 1.462, framePeriodMs: 300, behavior: 'work' },
    { key: 'npc_stage05_porteur_blocs',file: 'stage05/npc/porteur_blocs_work.png',frame: 256, scale: 1.508, framePeriodMs: 300, behavior: 'patrol' },
    { key: 'npc_stage05_grutier',      file: 'stage05/npc/grutier_work.png',      frame: 256, scale: 1.610, framePeriodMs: 320, behavior: 'work' }
  ],
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
    },
    // Secteur Maçonnerie (SE-S) — palettes parpaings + mortier + poteaux
    {
      angleCenter: 310,
      angleSpread: 60,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0, 1],    // block_pallet + concrete_pole
      dominantDecalIndices: [0, 3],   // mortar + dust
    },
    // Zone Murs (Ouest) — sections de mur + poussière béton
    {
      angleCenter: 190,
      angleSpread: 70,
      distMin: 320,
      distMax: 720,
      dominantPropIndices: [1],       // concrete_pole
      dominantDecalIndices: [1, 3],   // rubble + dust
    }
  ],
  baseTileIndex: 0,            // tuile poussière béton de base (index 0)
  decalDensityMultiplier: 1.0, // gros œuvre semi-propre : béton frais, densité moyenne
  // Intérieur (on est dans le gros œuvre) : poteaux béton bruts + voile poussière chaude.
  interior: {
    columnKey: 'struct_stage05_column',
    columnFile: 'stage05/structures/column.png',
    columnSpacing: 340,
    columnScale: 1.3,
    tint: 0xffdcae,
    tintAlpha: 0.15
  }
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
  // MACHINES VIVANTES (cf. stage02) — nacelle ciseaux : la plateforme monte et
  // redescend sur les bras en X, base et roues fixes. Pas de `_move` : une
  // nacelle en poste ne parcourt pas le chantier.
  // NB : `boom_lift.png` contient en réalité une nacelle CISEAUX (le nom du
  // fichier ment ; un « boom lift » est une nacelle à bras articulé). La cible
  // « monte/descend » du geste, elle, est juste pour des ciseaux.
  editorExtras: [
    { key: 'struct_stage06_nacelle_work', file: 'stage06/props/boom_lift_work.png', role: 'structure', frame: 176 },
    { key: 'continuity_stage05_shell', file: 'stage05/landmarks/walls.png', role: 'structure' }
  ],
  ambient: [
    { key: 'npc_stage06', file: 'stage06/npc/echafaudeur_work.png', frame: 180, scale: 0.78, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage06_monteur_trade', file: 'stage06/npc/monteur_tube_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage06_monteur_tube',   file: 'stage06/npc/monteur_tube_work.png',   frame: 256, scale: 1.61, framePeriodMs: 300, behavior: 'patrol' },
    { key: 'npc_stage06_porteur_planche',file: 'stage06/npc/porteur_planche_work.png',frame: 256, scale: 1.51, framePeriodMs: 300, behavior: 'patrol' },
    { key: 'npc_stage06_porteur_echelle',file: 'stage06/npc/porteur_echelle_work.png',frame: 256, scale: 1.34, framePeriodMs: 300, behavior: 'patrol' },
  ],
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
    },
    // Secteur Structures (Ouest) — grilles métal + ombres de tubes
    {
      angleCenter: 200,
      angleSpread: 65,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0, 2],    // scaffold frame + garde_corps
      dominantDecalIndices: [1],      // tube_shadow
    },
    // Passage échelles (SE) — échelles + garde-corps légers
    {
      angleCenter: 315,
      angleSpread: 50,
      distMin: 320,
      distMax: 700,
      dominantPropIndices: [3, 2],    // echelle + garde_corps
      dominantDecalIndices: [1, 0],   // tube_shadow + bolt_scatter
    }
  ],
  baseTileIndex: 2,            // tuile gris neutre (index 2)
  decalDensityMultiplier: 1.25, // échafaudages : sol dalle nu → densité relevée pour remplir (était 0.9, trop vide en haut)
  // Intérieur (structure montée, échafaudée) : poteaux béton bruts + voile gris chaud.
  interior: {
    columnKey: 'struct_stage06_column',
    columnFile: 'stage06/structures/column.png',
    columnSpacing: 350,
    columnScale: 1.3,
    tint: 0xf3dcb4,
    tintAlpha: 0.15
  }
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
    // Camion-grue VISIBLE tenant la charge (asset présent mais jusqu'ici non branché) :
    // fini la « grue imaginée hors champ » — la scène signature est causale.
    { key: 'struct_stage07_crane', file: 'stage07/props/crane_truck.png',        scale: 1.15, count: 1, band: 'near' },
    { key: 'struct_stage07_truss', file: 'stage07/structures/roof_trusses.png',  scale: 0.85, count: 5, band: 'mid'  }
  ],
  // MACHINES VIVANTES (cf. stage02) — camion-grue : la flèche balaie un arc
  // large, camion/cabine/charge fixes. Pas de `_move` (il est en poste, béquilles
  // sorties). NB : la statique `crane_truck.png` est une ÉLÉVATION DE CÔTÉ ;
  // cette feuille est en vraie 3/4, comme le reste des engins du jeu.
  editorExtras: [
    { key: 'struct_stage07_crane_work', file: 'stage07/props/crane_truck_work.png', role: 'structure', frame: 224 },
    { key: 'continuity_stage05_shell', file: 'stage05/landmarks/walls.png', role: 'structure' }
  ],
  ambient: [
    { key: 'npc_stage07', file: 'stage07/npc/couvreur_work.png', frame: 180, scale: 0.78, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage07_charpentier_trade', file: 'stage07/npc/charpentier_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage07_charpentier',   file: 'stage07/npc/charpentier_work.png',   frame: 256, scale: 0.779, framePeriodMs: 300, behavior: 'work' },
    { key: 'npc_stage07_porteur_tuiles',file: 'stage07/npc/porteur_tuiles_work.png',frame: 256, scale: 1.638, framePeriodMs: 300, behavior: 'patrol' },
    { key: 'npc_stage07_poseur_liteau', file: 'stage07/npc/poseur_liteau_work.png', frame: 256, scale: 1.484, framePeriodMs: 300, behavior: 'work' }
  ],
  // ── Composition scriptée stage 07 (charpente/toiture) ────────────────────────
  // Géographie : charge suspendue (idx0) côté NE proche (grue au-dessus),
  // 5 fermes de toit réparties en arc O-SO-S-NO (structure bois partout).
  // Landmark (charpente hero) au Nord. PNJ couvreur posant des tuiles rouges près du NE.
  geometry: {
    // structureAngles[i] → structure i, dans l'ordre de `structures[]` :
    //   0 = suspended_load (NE, ~50°) · 1 = crane_truck (E-NE, ~35°, tient la charge)
    //   2-6 = roof_trusses : O (175°), SO (220°), S (260°), NO (110°), ENE (30°)
    structureAngles: [50, 35, 175, 220, 260, 110, 30],
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
    },
    // Secteur Isolation (SO) — rouleaux d'isolant + ombres de charpente
    {
      angleCenter: 220,
      angleSpread: 60,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [2, 3],    // insulation_roll + gutter
      dominantDecalIndices: [1],      // truss_shadow
    },
    // Passage poutres (SE-E) — poutres + sciure
    {
      angleCenter: 315,
      angleSpread: 50,
      distMin: 320,
      distMax: 700,
      dominantPropIndices: [0, 1],    // beam + tile_pile
      dominantDecalIndices: [0, 1],   // sawdust_fine + truss_shadow
    }
  ],
  baseTileIndex: 1,            // tuile brun clair (index 1 — bois chantier)
  decalDensityMultiplier: 0.9, // charpente légère, densité légère (bois aéré)
  // Intérieur (sous charpente/toiture) : poteaux structurels + voile bois chaud.
  interior: {
    columnKey: 'struct_stage07_column',
    columnFile: 'stage07/structures/column.png',
    columnSpacing: 360,
    columnScale: 1.3,
    tint: 0xffca86,
    tintAlpha: 0.18
  }
}

const SECOND_OEUVRE_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_stage08_${i}`, file: `stage08/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_stage08_plaster', file: 'stage08/decals/plaster_dust.png' },
    { key: 'decal_stage08_cables',  file: 'stage08/decals/cables_floor.png' }
  ],
  // Seul clutter streamé : plaques + tableau élec + câbles + tuyaux PVC.
  // Le fourgon artisan (hero) et les zones de cloisons sont dans `structures` (placés 1 fois).
  props: [
    { key: 'prop_stage08_drywall',   file: 'stage08/props/drywall_stack.png',    scale: 0.85, count: 5 },
    { key: 'prop_stage08_elecpanel', file: 'stage08/props/electrical_panel.png', scale: 0.75, count: 3 },
    { key: 'prop_stage08_cables',    file: 'stage08/props/cable_bundle.png',     scale: 0.80, count: 4 },
    { key: 'prop_stage08_pvc',       file: 'stage08/props/pvc_pipes.png',        scale: 0.80, count: 3 }
  ],
  enemies: {
    platras:  { key: 'enemy_stage08_base', file: 'stage08/enemies/base_walk.png', frame: 256, scale: 0.72 },
    gainard:  { key: 'enemy_stage08_fast', file: 'stage08/enemies/fast_walk.png', frame: 256, scale: 0.63 },
    cloison:  { key: 'enemy_stage08_tank', file: 'stage08/enemies/tank_walk.png', frame: 256, scale: 0.80 }
  },
  boss: { key: 'boss_stage08', file: 'stage08/boss/boss_walk.png', frame: 256, scale: 1.30 },
  // Second œuvre : fourgon artisan blanc en héros (landmark visible, band 'near') +
  // zones de cloisons en cours réparties autour (band 'mid').
  landmark: { key: 'landmark_stage08', file: 'stage08/landmarks/partition.png', scale: 1.5, count: 1 },
  // Fourgon artisan hero (band 'near', côté NE) + 5 zones de cloisons en cours (band 'mid').
  // Ordre = ordre des angles scriptés (structureAngles).
  structures: [
    { key: 'struct_stage08_van',       file: 'stage08/structures/artisan_van.png',    scale: 1.1,  count: 1, band: 'near' },
    { key: 'struct_stage08_partition', file: 'stage08/structures/partition_room.png', scale: 0.85, count: 5, band: 'mid'  }
  ],
  editorExtras: [
    { key: 'continuity_stage05_shell', file: 'stage05/landmarks/walls.png', role: 'structure' }
  ],
  ambient: [
    { key: 'npc_stage08',          file: 'stage08/npc/plaquiste_work.png',     frame: 256, scale: 0.78, framePeriodMs: 280, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage08_plaquiste_trade', file: 'stage08/npc/plaquiste_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage08_plombier_trade',  file: 'stage08/npc/plombier_trade.png',  frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage08_plombier', file: 'stage08/npc/plombier_work.png',      frame: 256, scale: 1.64, framePeriodMs: 300, behavior: 'work'   },
    { key: 'npc_stage08_elec',     file: 'stage08/npc/electricien_work.png',   frame: 256, scale: 1.64, framePeriodMs: 300, behavior: 'work'   },
    { key: 'npc_stage08_porteur',  file: 'stage08/npc/porteur_plaque_work.png',frame: 256, scale: 1.67, framePeriodMs: 300, behavior: 'patrol' }
  ],
  // ── Composition scriptée stage 08 (second œuvre) ─────────────────────────────
  // Géographie : fourgon artisan (idx0) côté NE proche (artisan décharge le matériel),
  // 5 zones de cloisons distribuées en arc O-SO-S-NO (chantier intérieur partout).
  // Landmark (zone cloisons-héros) au Nord. PNJ plaquiste/électricien près du fourgon NE.
  geometry: {
    // structureAngles[i] → structure i, dans l'ordre de `structures[]` :
    //   0 = artisan_van (NE, ~50°) — fourgon blanc hero côté NE
    //   1-5 = partition_room : O (175°), SO (220°), S (265°), NO (110°), ENE (30°)
    structureAngles: [50, 175, 220, 265, 110, 30],
    landmarkAngle: 70,    // zone cloisons-hero au Nord-Est
    ambientAngle:  55     // plaquiste lissant le plâtre près du fourgon NE
  },
  // Zones métier : 3 secteurs complémentaires
  zones: [
    // Secteur Pose cloisons (NE) — dense en plaques + câbles autour du fourgon
    {
      angleCenter: 50,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0, 2],    // drywall_stack + cable_bundle
      dominantDecalIndices: [0],      // plaster_dust
    },
    // Secteur Électricité (SO) — tableau élec + câbles + tuyaux PVC
    {
      angleCenter: 220,
      angleSpread: 60,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [1, 2],    // electrical_panel + cable_bundle
      dominantDecalIndices: [1],      // cables_floor
    },
    // Plomberie (SE-E) — tuyaux PVC + plaques de plâtre
    {
      angleCenter: 315,
      angleSpread: 50,
      distMin: 320,
      distMax: 700,
      dominantPropIndices: [3, 0],    // pvc_pipes + drywall_stack
      dominantDecalIndices: [0, 1],   // plaster_dust + cables_floor
    }
  ],
  baseTileIndex: 2,            // tuile dalle intérieure gris clair (index 2)
  decalDensityMultiplier: 1.2, // second œuvre : intérieur en travaux, un peu plus fourni (était trop nu)
  // Intérieur (dans le bâtiment, cloisons en cours) : poteaux clairs + voile chaud doux.
  interior: {
    columnKey: 'struct_stage08_column',
    columnFile: 'stage08/structures/column.png',
    columnSpacing: 340,
    columnScale: 1.25,
    tint: 0xffdca4,
    tintAlpha: 0.17
  }
}

const FINITIONS_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_stage09_${i}`, file: `stage09/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_stage09_paint_spot',    file: 'stage09/decals/paint_spot.png' },
    { key: 'decal_stage09_masking_tape',  file: 'stage09/decals/masking_tape.png' }
  ],
  // Seul clutter streamé : pots de peinture + rouleaux + bâches + carrelage + coupe-carrelage.
  // La station de peinture (héros) est dans `structures` (placée UNE fois).
  props: [
    { key: 'prop_stage09_paint',       file: 'stage09/props/paint.png',       scale: 0.70, count: 5 },
    { key: 'prop_stage09_roller',      file: 'stage09/props/roller.png',      scale: 0.75, count: 4 },
    { key: 'prop_stage09_tarp',        file: 'stage09/props/tarp.png',        scale: 0.80, count: 3 },
    { key: 'prop_stage09_tile_pallet', file: 'stage09/props/tile_pallet.png', scale: 0.80, count: 3 },
    { key: 'prop_stage09_tile_cutter', file: 'stage09/props/tile_cutter.png', scale: 0.85, count: 2 }
  ],
  enemies: {
    goutte:  { key: 'enemy_stage09_base', file: 'stage09/enemies/base_walk.png', frame: 256, scale: 0.68 },
    pinceau: { key: 'enemy_stage09_fast', file: 'stage09/enemies/fast_walk.png', frame: 256, scale: 0.63 },
    pot:     { key: 'enemy_stage09_tank', file: 'stage09/enemies/tank_walk.png', frame: 256, scale: 0.80 }
  },
  boss: { key: 'boss_stage09', file: 'stage09/boss/boss_walk.png', frame: 256, scale: 1.09 },
  // Finitions : station peinture-héros (landmark visible) + pièces finies réparties + peintre au rouleau.
  landmark: { key: 'landmark_stage09', file: 'stage09/landmarks/finished_corner.png', scale: 1.5, count: 1 },
  // Station peinture hero (band 'near', côté NE) + 4 pièces finies réparties (band 'mid').
  // Ordre = ordre des angles scriptés (structureAngles).
  structures: [
    { key: 'struct_stage09_station', file: 'stage09/structures/paint_station.png', scale: 1.1,  count: 1, band: 'near' },
    { key: 'struct_stage09_room',    file: 'stage09/structures/finished_room.png', scale: 0.80, count: 4, band: 'mid'  }
  ],
  editorExtras: [
    { key: 'continuity_stage05_shell', file: 'stage05/landmarks/walls.png', role: 'structure' },
    { key: 'continuity_stage08_partition', file: 'stage08/structures/partition_room.png', role: 'structure' }
  ],
  ambient: [
    { key: 'npc_stage09', file: 'stage09/npc/peintre_work.png', frame: 180, scale: 0.78, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage09_carreleur_trade', file: 'stage09/npc/carreleur_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage09_carreleur', file: 'stage09/npc/carreleur_work.png',    frame: 256, scale: 1.439, framePeriodMs: 300, behavior: 'work' },
    { key: 'npc_stage09_poseur_sol',file: 'stage09/npc/poseur_sol_work.png',   frame: 256, scale: 1.462, framePeriodMs: 300, behavior: 'work' },
    { key: 'npc_stage09_porteur_pots', file: 'stage09/npc/porteur_pots_work.png', frame: 256, scale: 1.583, framePeriodMs: 300, behavior: 'patrol' }
  ],
  // ── Composition scriptée stage 09 (finitions) ─────────────────────────────────
  // Géographie : station peinture (idx0) côté NE proche (peintre travaille ici),
  // 4 pièces finies distribuées en arc O-SO-S-NO (chantier presque propre partout).
  // Landmark (coin fini jaune) au Nord. PNJ peintre près de la station NE, rouleau en main.
  geometry: {
    // structureAngles[i] → structure i, dans l'ordre de `structures[]` :
    //   0 = paint_station (NE, ~50°) — station peinture hero côté NE
    //   1-4 = finished_room : O (175°), SO (220°), S (265°), NO (110°)
    structureAngles: [50, 175, 220, 265, 110],
    landmarkAngle: 70,    // coin fini-hero au Nord-Est
    ambientAngle:  55     // peintre près de la station NE, rouleau levé
  },
  // Zones métier : 3 secteurs (très légère densité — chantier propre)
  zones: [
    // Secteur Peinture (NE) — dense en pots + rouleaux autour de la station
    {
      angleCenter: 50,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0, 1],    // paint + roller
      dominantDecalIndices: [0],      // paint_spot
    },
    // Secteur Carrelage (SO) — piles de carrelage + coupe-carrelage + scotch
    {
      angleCenter: 220,
      angleSpread: 60,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [3, 4],    // tile_pallet + tile_cutter
      dominantDecalIndices: [1],      // masking_tape
    },
    // Zone Bâches (SE-E) — bâches de protection + pots
    {
      angleCenter: 315,
      angleSpread: 50,
      distMin: 320,
      distMax: 700,
      dominantPropIndices: [2, 0],    // tarp + paint
      dominantDecalIndices: [0, 1],   // paint_spot + masking_tape
    }
  ],
  baseTileIndex: 3,            // tuile carrelage lisse (index 3 — finitions propres)
  decalDensityMultiplier: 0.65, // finitions très propres, densité minimale (chantier terminé)
  // Ambiance INTÉRIEURE (on est DANS le bâtiment) : grille de poteaux structurels +
  // voile de lumière chaude sur le sol/décor. Golden du mécanisme intérieur (05→10).
  interior: {
    columnKey: 'struct_stage09_column',
    columnFile: 'stage09/structures/column.png',
    columnSpacing: 330,
    columnScale: 1.25,
    tint: 0xffce9c,
    tintAlpha: 0.18
  }
}

const LIVRAISON_AUDIT_RENDER: StageRender = {
  ground: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `ground_stage10_${i}`, file: `stage10/ground/tile_${i}.png` })),
  decals: [
    { key: 'decal_stage10_crack',  file: 'stage10/decals/crack_orange.png' },
    { key: 'decal_stage10_tape',   file: 'stage10/decals/tape_line.png' }
  ],
  // Clutter streamé : cônes alignés + panneau OK + projecteur + barrières propres.
  // Le fourgon d'inspection (héros) et les bâtiments finis sont dans `structures` (placés 1 fois).
  props: [
    { key: 'prop_stage10_cones',     file: 'stage10/props/cones.png',     scale: 0.80, count: 5 },
    { key: 'prop_stage10_sign_ok',   file: 'stage10/props/sign_ok.png',   scale: 0.85, count: 3 },
    { key: 'prop_stage10_projector', file: 'stage10/props/projector.png', scale: 0.90, count: 2 },
    { key: 'prop_stage10_barrier',   file: 'stage10/props/barrier.png',   scale: 0.85, count: 3 }
  ],
  enemies: {
    formulaire: { key: 'enemy_stage10_base', file: 'stage10/enemies/base_walk.png', frame: 256, scale: 0.65 },
    auditeur:   { key: 'enemy_stage10_fast', file: 'stage10/enemies/fast_walk.png', frame: 256, scale: 0.65 },
    commission: { key: 'enemy_stage10_tank', file: 'stage10/enemies/tank_walk.png', frame: 256, scale: 0.88 }
  },
  boss: { key: 'boss_stage10', file: 'stage10/boss/boss_walk.png', frame: 256, scale: 1.25 },
  // Livraison/audit : portail/ruban-héros (landmark) + fourgon d'inspection (band 'near') +
  // bâtiments finis en fond (band 'mid') + fissures orange discrètes (menace narrative).
  landmark: { key: 'landmark_stage10', file: 'stage10/landmarks/gate.png', scale: 1.5, count: 1 },
  // Fourgon d'inspection hero (band 'near', côté NE) + 4 bâtiments finis répartis (band 'mid').
  // Ordre = ordre des angles scriptés (structureAngles).
  structures: [
    { key: 'struct_stage10_van',      file: 'stage10/props/inspection_van.png',  scale: 1.1,  count: 1, band: 'near' },
    { key: 'struct_stage10_building', file: 'stage10/structures/building.png',   scale: 0.80, count: 4, band: 'mid'  }
  ],
  ambient: [
    { key: 'npc_stage10', file: 'stage10/npc/inspecteur_work.png', frame: 256, scale: 0.78, framePeriodMs: 340, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage10_inspecteur_trade', file: 'stage10/npc/inspecteur_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage10_technicien_trade', file: 'stage10/npc/technicien_trade.png', frame: 256, scale: 0.62, framePeriodMs: 110, behavior: 'work', kind: 'trade' },
    { key: 'npc_stage10_agent_reception', file: 'stage10/npc/agent_reception_work.png', frame: 256, scale: 1.462, framePeriodMs: 300, behavior: 'work' },
    { key: 'npc_stage10_technicien', file: 'stage10/npc/technicien_work.png', frame: 256, scale: 1.532, framePeriodMs: 300, behavior: 'work' },
    { key: 'npc_stage10_porteur_carton', file: 'stage10/npc/porteur_carton_work.png', frame: 256, scale: 1.610, framePeriodMs: 300, behavior: 'patrol' }
  ],
  // ── Composition scriptée stage 10 (livraison/audit) ───────────────────────────
  // Géographie : fourgon (idx0) côté NE proche (réception en cours), 4 bâtiments
  // livrés répartis en arc O-SO-S-NO (propre, aéré). Landmark (portail ruban rouge/jaune)
  // au Nord. PNJ agent de réception près du fourgon NE, note en main.
  // Tension narrative : fissures orange discrètes au sol dans la zone SE (malfaçon cachée).
  geometry: {
    // structureAngles[i] → structure i, dans l'ordre de `structures[]` :
    //   0 = inspection_van (NE, ~50°) — fourgon d'inspection hero côté NE
    //   1-4 = building : O (175°), SO (225°), S (265°), NO (110°)
    structureAngles: [50, 175, 225, 265, 110],
    landmarkAngle: 70,    // portail ruban-hero au Nord-Est
    ambientAngle:  55     // agent de réception près du fourgon NE, note en main
  },
  // Zones métier : 3 secteurs (densité minimale — livraison propre, tension sous-jacente)
  zones: [
    // Secteur Réception (NE) — cônes + panneaux OK autour du fourgon
    {
      angleCenter: 50,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [0, 1],    // cones + sign_ok
      dominantDecalIndices: [1],      // tape_line (balisage propre)
    },
    // Secteur Malfaçon cachée (SE) — fissures orange + projecteurs (audit nocturne)
    {
      angleCenter: 315,
      angleSpread: 55,
      distMin: 340,
      distMax: 760,
      dominantPropIndices: [2, 3],    // projector + barrier
      dominantDecalIndices: [0],      // crack_orange (fissures = menace narrative)
    },
    // Zone Périmètre (Ouest) — barrières propres + fissures discrètes
    {
      angleCenter: 185,
      angleSpread: 60,
      distMin: 320,
      distMax: 720,
      dominantPropIndices: [3, 1],    // barrier + sign_ok
      dominantDecalIndices: [0, 1],   // crack_orange + tape_line
    }
  ],
  baseTileIndex: 2,            // tuile propre/clair (index 2 — livraison nette)
  decalDensityMultiplier: 0.6, // densité minimale (chantier livré, propre + tension discrète)
  // Intérieur (bâtiment livré) : poteaux clairs finis + voile clair (lumière neutre-chaude).
  interior: {
    columnKey: 'struct_stage10_column',
    columnFile: 'stage10/structures/column.png',
    columnSpacing: 380,
    columnScale: 1.25,
    tint: 0xffe6c4,
    tintAlpha: 0.14
  }
}

export const STAGE_RENDER: Record<string, StageRender> = {
  terrain_vierge: TERRAIN_VIERGE_RENDER,
  terrassement: TERRASSEMENT_RENDER,
  fondations: FONDATIONS_RENDER,
  reseaux_enterres: RESEAUX_ENTERRES_RENDER,
  gros_oeuvre: GROS_OEUVRE_RENDER,
  echafaudages: ECHAFAUDAGES_RENDER,
  charpente_toiture: CHARPENTE_TOITURE_RENDER,
  second_oeuvre: SECOND_OEUVRE_RENDER,
  finitions: FINITIONS_RENDER,
  livraison_audit: LIVRAISON_AUDIT_RENDER
}

/** Config de rendu d'un stage, avec repli sur le terrain vierge. */
export function stageRender(stageId: string): StageRender {
  return STAGE_RENDER[stageId] ?? TERRAIN_VIERGE_RENDER
}
