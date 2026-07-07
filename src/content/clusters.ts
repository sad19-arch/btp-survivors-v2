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
  // cluster_route : couloir de passage balisé + portail
  // Clôtures le long du passage (collision 'both') + une ouverture (gate)
  // ─────────────────────────────────────────────────────────────────────────
  cluster_route: {
    id: 'cluster_route',
    footprintRadius: 150,
    gates: [{ dx: 0, dy: -120 }], // portail côté nord = entrée du couloir
    elements: [
      // Revêtement de route (décoration)
      { assetKey: 'road_strip', dx: 0, dy: 0, scale: 1.0, collide: 'none' },
      // Clôture côté ouest
      {
        assetKey: 'fence_panel',
        dx: -90,
        dy: -60,
        scale: 1.0,
        collide: 'both',
        shape: { kind: 'segment', x2: 0, y2: 120, thickness: 10 }
      },
      // Clôture côté est
      {
        assetKey: 'fence_panel',
        dx: 90,
        dy: -60,
        scale: 1.0,
        collide: 'both',
        shape: { kind: 'segment', x2: 0, y2: 120, thickness: 10 }
      },
      // Portail nord (asset de portail, décoration)
      { assetKey: 'site_gate', dx: 0, dy: -120, scale: 1.0, collide: 'none' }
    ]
  }
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
  // ⚠️ IMPÉRATIF : terrain_vierge = [] garantit que sim:check (stage 01) ne voit
  // aucun cluster → aucune collision/modification de flux → diff 0.
  terrain_vierge: [],
  terrassement: [
    { role: 'route', clusterId: 'cluster_route' },
    { role: 'excavation', clusterId: 'cluster_excavation' },
    { role: 'spoil', clusterId: 'cluster_spoil' },
    { role: 'plant', clusterId: 'cluster_plant' },
    { role: 'pause', clusterId: 'cluster_pause' }
  ],
  // Rollout ultérieur — vide pour l'instant :
  fondations: [],
  reseaux_enterres: [],
  gros_oeuvre: [],
  echafaudages: [],
  charpente: [],
  second_oeuvre: [],
  finitions: [],
  'livraison/audit': []
}
