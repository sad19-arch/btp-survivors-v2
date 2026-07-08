/**
 * Modèle de prefabs (clusters) de chantier — DATA PURE.
 *
 * T1 : définitions typées des clusters + association stage → clusters.
 * Aucun Phaser, aucun DOM, aucun Math.random, aucune logique de placement.
 * Le placement (T2) et le rendu (T3) lisent ces données ; elles n'en dépendent pas.
 */

/** Qui peut être bloqué par un élément. */
export type CollideKind = 'both' | 'enemies' | 'none'

/** Forme collidable d'un élément, en coordonnées LOCALES au cluster (origine = ancre). */
export type ObstacleShape =
  | { kind: 'circle'; r: number }
  | { kind: 'segment'; x2: number; y2: number; thickness: number } // segment de (dx,dy) à (dx+x2, dy+y2)

export interface ClusterElement {
  assetKey: string // clé d'asset (le rendu la résoudra ; ici juste une chaîne non vide)
  dx: number // offset px depuis l'ancre du cluster
  dy: number
  scale: number
  collide: CollideKind
  shape?: ObstacleShape // requis si collide !== 'none' ; interdit si 'none'
}

export interface ClusterDef {
  id: string
  elements: ClusterElement[]
  footprintRadius: number // rayon d'encombrement (pour l'espacement en T2)
  gates: { dx: number; dy: number }[] // ouverture(s) de l'enclos (position locale du portail)
}

// ─────────────────────────────────────────────────────────────────────────────
// Fabriques de clusters (évitent la répétition pour les stages 03-10)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zone de travail clôturée : anneau fence_panel (both, 5 segments, gate sud)
 * + site_gate cosmétique + centre cosmétique + engin + 2 matériaux.
 * Géométrie calquée sur cluster_excavation (gabarit). footprintRadius = 200.
 */
function workCluster(
  id: string,
  centerKey: string,
  machineKey: string,
  mat1: string,
  mat2: string
): ClusterDef {
  return {
    id,
    footprintRadius: 200,
    gates: [{ dx: 0, dy: 80 }],
    elements: [
      // Asset central cosmétique (landmark local)
      { assetKey: centerKey, dx: 0, dy: 0, scale: 0.9, collide: 'none' },
      // Palissade N
      { assetKey: 'fence_panel', dx: 0, dy: -110, scale: 1.0, collide: 'both', shape: { kind: 'segment', x2: 80, y2: 0, thickness: 10 } },
      // Palissade NO
      { assetKey: 'fence_panel', dx: -90, dy: -85, scale: 1.0, collide: 'both', shape: { kind: 'segment', x2: 40, y2: -40, thickness: 10 } },
      // Palissade O
      { assetKey: 'fence_panel', dx: -120, dy: 0, scale: 1.0, collide: 'both', shape: { kind: 'segment', x2: 0, y2: 80, thickness: 10 } },
      // Palissade NE
      { assetKey: 'fence_panel', dx: 90, dy: -85, scale: 1.0, collide: 'both', shape: { kind: 'segment', x2: -40, y2: -40, thickness: 10 } },
      // Palissade E
      { assetKey: 'fence_panel', dx: 120, dy: 0, scale: 1.0, collide: 'both', shape: { kind: 'segment', x2: 0, y2: 80, thickness: 10 } },
      // Engin (décoration NE)
      { assetKey: machineKey, dx: 105, dy: -90, scale: 1.0, collide: 'none' },
      // Matériau 1 (NO)
      { assetKey: mat1, dx: -95, dy: -70, scale: 0.85, collide: 'none' },
      // Matériau 2 (SO)
      { assetKey: mat2, dx: -85, dy: 60, scale: 0.85, collide: 'none' },
      // Poteau de coin NE
      { assetKey: 'fence_post', dx: 100, dy: -100, scale: 0.8, collide: 'none' },
      // Portail cosmétique sud
      { assetKey: 'site_gate', dx: 0, dy: 80, scale: 0.6, collide: 'none' }
    ]
  }
}

/**
 * Stockage cosmétique : 3 tas de matériaux alignés, sans collision.
 * footprintRadius = 90.
 */
function storageCluster(id: string, keys: [string, string, string]): ClusterDef {
  return {
    id,
    footprintRadius: 90,
    gates: [],
    elements: [
      { assetKey: keys[0], dx: 0,   dy: 0,  scale: 0.85, collide: 'none' },
      { assetKey: keys[1], dx: 65,  dy: 20, scale: 0.75, collide: 'none' },
      { assetKey: keys[2], dx: -55, dy: 25, scale: 0.80, collide: 'none' }
    ]
  }
}

/**
 * Parc engins cosmétique : 1-2 engins alignés, sans collision.
 * footprintRadius = 100.
 */
function plantCluster(id: string, keys: [string, string]): ClusterDef {
  return {
    id,
    footprintRadius: 100,
    gates: [],
    elements: [
      { assetKey: keys[0], dx: -55, dy: 0, scale: 1.0, collide: 'none' },
      { assetKey: keys[1], dx:  55, dy: 0, scale: 1.0, collide: 'none' }
    ]
  }
}

/** Registre global des prefabs par id. */
export const CLUSTERS: Record<string, ClusterDef> = {
  // ─────────────────────────────────────────────────────────────────────────
  // cluster_excavation : fosse centrale + palissade + engins + terre
  // Géographie locale : fosse au centre, anneau de panneaux sauf côté sud
  // (gate à dy=+80), pelleteuse NE, benne SE, 2 tas de terre NO/SO
  // ─────────────────────────────────────────────────────────────────────────
  cluster_excavation: {
    id: 'cluster_excavation',
    footprintRadius: 200,
    gates: [{ dx: 0, dy: 80 }], // ouverture côté sud
    elements: [
      // Fosse centrale (collision 'both' — joueur ET ennemis)
      {
        assetKey: 'struct_stage02_pit',
        dx: 0,
        dy: 0,
        scale: 0.85,
        collide: 'both',
        shape: { kind: 'circle', r: 70 }
      },
      // Palissade N
      {
        assetKey: 'fence_panel',
        dx: 0,
        dy: -110,
        scale: 1.0,
        collide: 'both',
        shape: { kind: 'segment', x2: 80, y2: 0, thickness: 10 }
      },
      // Palissade NO
      {
        assetKey: 'fence_panel',
        dx: -90,
        dy: -85,
        scale: 1.0,
        collide: 'both',
        shape: { kind: 'segment', x2: 40, y2: -40, thickness: 10 }
      },
      // Palissade O
      {
        assetKey: 'fence_panel',
        dx: -120,
        dy: 0,
        scale: 1.0,
        collide: 'both',
        shape: { kind: 'segment', x2: 0, y2: 80, thickness: 10 }
      },
      // Palissade NE
      {
        assetKey: 'fence_panel',
        dx: 90,
        dy: -85,
        scale: 1.0,
        collide: 'both',
        shape: { kind: 'segment', x2: -40, y2: -40, thickness: 10 }
      },
      // Palissade E
      {
        assetKey: 'fence_panel',
        dx: 120,
        dy: 0,
        scale: 1.0,
        collide: 'both',
        shape: { kind: 'segment', x2: 0, y2: 80, thickness: 10 }
      },
      // Pelleteuse côté NE (décoration, pas de collision)
      {
        assetKey: 'prop_s2_excavator',
        dx: 105,
        dy: -90,
        scale: 1.2,
        collide: 'none'
      },
      // Benne côté E près de l'ouverture (décoration)
      {
        assetKey: 'prop_s2_truck',
        dx: 100,
        dy: 50,
        scale: 1.05,
        collide: 'none'
      },
      // Tas de terre NO
      {
        assetKey: 'prop_s2_dirt',
        dx: -95,
        dy: -70,
        scale: 0.85,
        collide: 'none'
      },
      // Tas de terre SO
      {
        assetKey: 'prop_s2_dirt',
        dx: -85,
        dy: 60,
        scale: 0.85,
        collide: 'none'
      },
      // Traces d'engins (decal, décoration)
      {
        assetKey: 'decal_s2_tracks',
        dx: 30,
        dy: 90,
        scale: 1.0,
        collide: 'none'
      },
      // 2e trace côté NO
      {
        assetKey: 'decal_s2_tracks',
        dx: -60,
        dy: -20,
        scale: 1.0,
        collide: 'none'
      },
      // Portail d'entrée côté sud (cosmétique — marque l'ouverture de l'enclos)
      {
        assetKey: 'site_gate',
        dx: 0,
        dy: 80,
        scale: 0.6,
        collide: 'none'
      }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // cluster_spoil : remblai / stockage de terre — décoratif, sans collision
  // ─────────────────────────────────────────────────────────────────────────
  cluster_spoil: {
    id: 'cluster_spoil',
    footprintRadius: 80,
    gates: [],
    elements: [
      { assetKey: 'prop_s2_dirt', dx: 0, dy: 0, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: 60, dy: 20, scale: 0.75, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: -50, dy: 25, scale: 0.80, collide: 'none' },
      { assetKey: 'decal_s2_puddle', dx: 35, dy: -30, scale: 1.0, collide: 'none' }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // cluster_plant : engins de compactage alignés — décoratif
  // ─────────────────────────────────────────────────────────────────────────
  cluster_plant: {
    id: 'cluster_plant',
    footprintRadius: 100,
    gates: [],
    elements: [
      { assetKey: 'prop_s2_roller', dx: -55, dy: 0, scale: 1.0, collide: 'none' },
      { assetKey: 'prop_s2_dozer', dx: 55, dy: 0, scale: 1.0, collide: 'none' }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // cluster_pause : base de vie / algeco — décoratif
  // ─────────────────────────────────────────────────────────────────────────
  cluster_pause: {
    id: 'cluster_pause',
    footprintRadius: 90,
    gates: [],
    elements: [
      // Réutilise la clé algeco du stage 01 (déjà chargée en mémoire GPU stage 01)
      { assetKey: 'struct_stage01_cabin', dx: 0, dy: 0, scale: 1.1, collide: 'none' }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // cluster_route : tuile de route cosmétique (se répète le long du bord sud)
  // Pas de collision — la route est purement décorative.
  // road_strip ~128px × 1.7 ≈ 218px, ROUTE_TILE=210 → légère superposition → bande continue.
  // ─────────────────────────────────────────────────────────────────────────
  cluster_route: {
    id: 'cluster_route',
    footprintRadius: 120,
    gates: [],
    elements: [
      { assetKey: 'road_strip', dx: 0, dy: 0, scale: 1.7, collide: 'none' }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 01 — Terrain vierge (INSTALLATION DE CHANTIER)
  // Sémantique : la parcelle vient d'être prise ; le chantier s'INSTALLE.
  // Pas encore d'engins lourds (ils arrivent au terrassement) → la « zone de
  // travail » est la BASE-VIE clôturée (algeco au centre, panneau de chantier,
  // piquets de bornage, premier tas de cailloux) ; le « stockage » = premiers
  // approvisionnements (cailloux/terre/broussailles dégagées) ; le « parc » =
  // barrières de périmètre + parcelle piquetée. Réutilise les assets premium
  // stage 01 (site_cabin/site_sign/boundary_tape/plot + prop_stakes/rocks/…).
  // ─────────────────────────────────────────────────────────────────────────
  ...Object.fromEntries([
    workCluster('cluster_work_terrain', 'struct_stage01_cabin', 'struct_stage01_sign', 'prop_stakes', 'prop_rocks'),
    storageCluster('cluster_storage_terrain', ['prop_rocks', 'prop_soft', 'prop_weeds']),
    plantCluster('cluster_plant_terrain', ['struct_stage01_tape', 'struct_stage01_plot'])
  ].map((c) => [c.id, c])),

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 03 — Fondations
  // ─────────────────────────────────────────────────────────────────────────
  ...Object.fromEntries([
    workCluster('cluster_work_fondations', 'landmark_stage03', 'struct_stage03_pump', 'prop_stage03_rebar', 'prop_stage03_formwork'),
    storageCluster('cluster_storage_fondations', ['prop_stage03_rebar', 'prop_stage03_formwork', 'prop_stage03_concrete_mixer']),
    plantCluster('cluster_plant_fondations', ['struct_stage03_mixer', 'struct_stage03_bay'])
  ].map((c) => [c.id, c])),

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 04 — Réseaux enterrés
  // ─────────────────────────────────────────────────────────────────────────
  ...Object.fromEntries([
    workCluster('cluster_work_reseaux', 'landmark_stage04', 'struct_stage04_excavator', 'prop_stage04_pipes', 'prop_stage04_cable'),
    storageCluster('cluster_storage_reseaux', ['prop_stage04_pipes', 'prop_stage04_cable', 'prop_stage04_regard']),
    plantCluster('cluster_plant_reseaux', ['prop_stage04_trencher', 'struct_stage04_trench'])
  ].map((c) => [c.id, c])),

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 05 — Gros œuvre
  // ─────────────────────────────────────────────────────────────────────────
  ...Object.fromEntries([
    workCluster('cluster_work_gros_oeuvre', 'landmark_stage05', 'struct_stage05_crane', 'prop_stage05_block_pallet', 'prop_stage05_concrete_pole'),
    storageCluster('cluster_storage_gros_oeuvre', ['prop_stage05_block_pallet', 'prop_stage05_concrete_pole', 'prop_stage05_crane_hook']),
    plantCluster('cluster_plant_gros_oeuvre', ['struct_stage05_mixer', 'struct_stage05_wall'])
  ].map((c) => [c.id, c])),

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 06 — Échafaudages
  // ─────────────────────────────────────────────────────────────────────────
  ...Object.fromEntries([
    workCluster('cluster_work_echafaudages', 'landmark_stage06', 'struct_stage06_nacelle', 'prop_stage06_scaffold', 'prop_stage06_tubes'),
    storageCluster('cluster_storage_echafaudages', ['prop_stage06_scaffold', 'prop_stage06_plancher', 'prop_stage06_echelle']),
    plantCluster('cluster_plant_echafaudages', ['prop_stage06_garde_corps', 'struct_stage06_grid'])
  ].map((c) => [c.id, c])),

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 07 — Charpente / toiture
  // ─────────────────────────────────────────────────────────────────────────
  ...Object.fromEntries([
    workCluster('cluster_work_charpente', 'landmark_stage07', 'struct_stage07_load', 'prop_stage07_beam', 'prop_stage07_tile_pile'),
    storageCluster('cluster_storage_charpente', ['prop_stage07_beam', 'prop_stage07_tile_pile', 'prop_stage07_insul']),
    plantCluster('cluster_plant_charpente', ['prop_stage07_gutter', 'struct_stage07_truss'])
  ].map((c) => [c.id, c])),

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 08 — Second œuvre
  // ─────────────────────────────────────────────────────────────────────────
  ...Object.fromEntries([
    workCluster('cluster_work_second_oeuvre', 'landmark_stage08', 'struct_stage08_van', 'prop_stage08_drywall', 'prop_stage08_pvc'),
    storageCluster('cluster_storage_second_oeuvre', ['prop_stage08_drywall', 'prop_stage08_pvc', 'prop_stage08_cables']),
    plantCluster('cluster_plant_second_oeuvre', ['prop_stage08_elecpanel', 'struct_stage08_partition'])
  ].map((c) => [c.id, c])),

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 09 — Finitions
  // ─────────────────────────────────────────────────────────────────────────
  ...Object.fromEntries([
    workCluster('cluster_work_finitions', 'landmark_stage09', 'struct_stage09_station', 'prop_stage09_paint', 'prop_stage09_tile_pallet'),
    storageCluster('cluster_storage_finitions', ['prop_stage09_paint', 'prop_stage09_roller', 'prop_stage09_tarp']),
    plantCluster('cluster_plant_finitions', ['prop_stage09_tile_cutter', 'struct_stage09_room'])
  ].map((c) => [c.id, c])),

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 10 — Livraison / audit
  // ─────────────────────────────────────────────────────────────────────────
  ...Object.fromEntries([
    workCluster('cluster_work_livraison', 'landmark_stage10', 'struct_stage10_van', 'prop_stage10_cones', 'prop_stage10_barrier'),
    storageCluster('cluster_storage_livraison', ['prop_stage10_cones', 'prop_stage10_sign_ok', 'prop_stage10_barrier']),
    plantCluster('cluster_plant_livraison', ['prop_stage10_projector', 'struct_stage10_building'])
  ].map((c) => [c.id, c]))
}

// ─────────────────────────────────────────────────────────────────────────────
// Association stage → liste de (rôle de zone, clusterId à y placer).
// Les stages non définis ici n'ont PAS de clusters (terrain_vierge = garde).
// ─────────────────────────────────────────────────────────────────────────────

/** Association stage → liste de (rôle de zone, clusterId à y placer). */
export interface StageClusterEntry {
  role: string
  clusterId: string
}

export const STAGE_CLUSTERS: Record<string, StageClusterEntry[]> = {
  // Stage 01 (installation de chantier). NB : depuis que terrain_vierge a des
  // clusters, sim:check (qui tourne sur le stage 01) voit collision + flux →
  // la baseline a été re-dérivée (phase 8 du plan terrain). Ce n'est PLUS la
  // garde diff-0 ; le déterminisme reste assuré par le RNG isolé (seed^0x51e0).
  terrain_vierge: [
    { role: 'route',      clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_work_terrain' },
    { role: 'spoil',      clusterId: 'cluster_storage_terrain' },
    { role: 'plant',      clusterId: 'cluster_plant_terrain' },
    { role: 'pause',      clusterId: 'cluster_plant_terrain' }
  ],
  terrassement: [
    { role: 'route', clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_excavation' },
    { role: 'spoil', clusterId: 'cluster_spoil' },
    { role: 'plant', clusterId: 'cluster_plant' },
    { role: 'pause', clusterId: 'cluster_pause' }
  ],
  fondations: [
    { role: 'route',     clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_work_fondations' },
    { role: 'spoil',     clusterId: 'cluster_storage_fondations' },
    { role: 'plant',     clusterId: 'cluster_plant_fondations' },
    { role: 'pause',     clusterId: 'cluster_plant_fondations' }
  ],
  reseaux_enterres: [
    { role: 'route',     clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_work_reseaux' },
    { role: 'spoil',     clusterId: 'cluster_storage_reseaux' },
    { role: 'plant',     clusterId: 'cluster_plant_reseaux' },
    { role: 'pause',     clusterId: 'cluster_plant_reseaux' }
  ],
  gros_oeuvre: [
    { role: 'route',     clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_work_gros_oeuvre' },
    { role: 'spoil',     clusterId: 'cluster_storage_gros_oeuvre' },
    { role: 'plant',     clusterId: 'cluster_plant_gros_oeuvre' },
    { role: 'pause',     clusterId: 'cluster_plant_gros_oeuvre' }
  ],
  echafaudages: [
    { role: 'route',     clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_work_echafaudages' },
    { role: 'spoil',     clusterId: 'cluster_storage_echafaudages' },
    { role: 'plant',     clusterId: 'cluster_plant_echafaudages' },
    { role: 'pause',     clusterId: 'cluster_plant_echafaudages' }
  ],
  charpente_toiture: [
    { role: 'route',     clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_work_charpente' },
    { role: 'spoil',     clusterId: 'cluster_storage_charpente' },
    { role: 'plant',     clusterId: 'cluster_plant_charpente' },
    { role: 'pause',     clusterId: 'cluster_plant_charpente' }
  ],
  second_oeuvre: [
    { role: 'route',     clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_work_second_oeuvre' },
    { role: 'spoil',     clusterId: 'cluster_storage_second_oeuvre' },
    { role: 'plant',     clusterId: 'cluster_plant_second_oeuvre' },
    { role: 'pause',     clusterId: 'cluster_plant_second_oeuvre' }
  ],
  finitions: [
    { role: 'route',     clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_work_finitions' },
    { role: 'spoil',     clusterId: 'cluster_storage_finitions' },
    { role: 'plant',     clusterId: 'cluster_plant_finitions' },
    { role: 'pause',     clusterId: 'cluster_plant_finitions' }
  ],
  livraison_audit: [
    { role: 'route',     clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_work_livraison' },
    { role: 'spoil',     clusterId: 'cluster_storage_livraison' },
    { role: 'plant',     clusterId: 'cluster_plant_livraison' },
    { role: 'pause',     clusterId: 'cluster_plant_livraison' }
  ]
}
