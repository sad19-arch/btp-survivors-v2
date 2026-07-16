/**
 * Modèle de prefabs (clusters) de chantier — DATA PURE.
 *
 * T1 : définitions typées des clusters + association stage → clusters.
 * Aucun Phaser, aucun DOM, aucun Math.random, aucune logique de placement.
 * Le placement (T2) et le rendu (T3) lisent ces données ; elles n'en dépendent pas.
 */
import type { RenderLayer, TilePatch } from './stageLayout'

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
  flipX?: boolean
  /** Couche d'affichage (rendu seul). Absent = déduite par le rendu. */
  layer?: RenderLayer
  /** Si présent : texture RÉPÉTÉE sur w×h px (plaque de sol), et non étirée. */
  tile?: TilePatch
  rotation?: number
  collide: CollideKind
  shape?: ObstacleShape // requis si collide !== 'none' ; interdit si 'none'
  /** Surface circulaire qui ralentit les joueurs sans infliger de degats. */
  surfaceSlow?: { radius: number; multiplier: number }
  animation?: { frameRate: number }
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
  // PREFABS « PLAN DE CHANTIER » (méthode 6-étapes) — placés PAR ZONE via
  // sitePrograms/sitePlan (plus jamais d'assets isolés éparpillés).
  // ─────────────────────────────────────────────────────────────────────────

  // ═══ SCÈNES D'ACTIVITÉ (R-E : composer des scènes, pas des objets) ═══════
  // Chaque trou porte TOUJOURS son anneau de déblais + l'engin qui l'a creusé :
  // un trou n'apparaît jamais par magie céleste.

  // SCÈNE « fouille active » : LE front de creusement. Fosse + anneau de 5 mottes
  // (les déblais sortis du trou) + pelleteuse AU BORD nord + camion-benne à charger
  // + traces. C'est le tableau signature du terrassement.
  scene_dig_active: {
    id: 'scene_dig_active',
    footprintRadius: 270,
    gates: [{ dx: 0, dy: 270 }],
    elements: [
      // Le trou.
      { assetKey: 'struct_stage02_pit', dx: 0, dy: 10, scale: 1.05, collide: 'both', shape: { kind: 'circle', r: 82 } },
      // Anneau de déblais (côté sud + flancs — le nord reste au front de la pelle).
      { assetKey: 'prop_s2_dirt', dx: 152, dy: 30, scale: 0.9, collide: 'both', shape: { kind: 'circle', r: 34 } },
      { assetKey: 'prop_s2_dirt', dx: 100, dy: 140, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: 0, dy: 168, scale: 0.95, collide: 'both', shape: { kind: 'circle', r: 34 } },
      { assetKey: 'prop_s2_dirt', dx: -105, dy: 140, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: -150, dy: 25, scale: 0.88, collide: 'none' },
      // La pelleteuse qui creuse, au bord nord du trou (adjacente, jamais dedans).
      { assetKey: 'prop_s2_excavator', dx: -10, dy: -168, scale: 1.25, collide: 'both', shape: { kind: 'circle', r: 56 } },
      // Le camion-benne qu'on charge, sur le flanc.
      { assetKey: 'prop_s2_truck', dx: 205, dy: -70, scale: 1.05, collide: 'both', shape: { kind: 'circle', r: 48 } },
      // Traces de va-et-vient.
      { assetKey: 'decal_s2_tracks', dx: 120, dy: -30, scale: 1.15, collide: 'none' },
      { assetKey: 'decal_s2_puddle', dx: -60, dy: 90, scale: 1.0, collide: 'none' },
    ],
  },

  // SCÈNE « front actif FACE AU SPAWN » (R-F) : variante de scene_dig_active
  // arrangée pour être LUE depuis le spawn au sud. Le trou est l'élément le plus
  // proche du joueur (origine), la pelleteuse + le camion sont au bord NORD (loin,
  // dans le cadre), et l'anneau de déblais du côté joueur est DÉCORATIF
  // (collide:'none') pour garder la poche de spawn libre — le joueur démarre au
  // bord du trou, pas dedans. Utilisée seulement en arrangement `anchor_spawn`,
  // ancrée à ~270 px au nord du spawn.
  scene_dig_active_spawn: {
    id: 'scene_dig_active_spawn',
    footprintRadius: 250,
    gates: [{ dx: 0, dy: 250 }],
    elements: [
      // Le trou — élément le PLUS proche du joueur (origine de la scène).
      { assetKey: 'struct_stage02_pit', dx: 0, dy: 0, scale: 1.05, collide: 'both', shape: { kind: 'circle', r: 82 } },
      // La pelleteuse qui creuse, au bord NORD du trou (loin du joueur, bien visible).
      { assetKey: 'prop_s2_excavator', dx: -15, dy: -120, scale: 1.25, collide: 'both', shape: { kind: 'circle', r: 56 } },
      // Le camion-benne qu'on charge, sur le flanc nord-est.
      { assetKey: 'prop_s2_truck', dx: 195, dy: -50, scale: 1.05, collide: 'both', shape: { kind: 'circle', r: 48 } },
      // Anneau de déblais : flancs + nord COLLIDABLES ; le côté SUD (vers le
      // joueur) est décoratif pour ne pas fermer la poche de spawn.
      { assetKey: 'prop_s2_dirt', dx: 150, dy: -6, scale: 0.9, collide: 'both', shape: { kind: 'circle', r: 34 } },
      { assetKey: 'prop_s2_dirt', dx: -120, dy: -96, scale: 0.85, collide: 'both', shape: { kind: 'circle', r: 32 } },
      { assetKey: 'prop_s2_dirt', dx: -150, dy: 28, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: -40, dy: 135, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: 70, dy: 120, scale: 0.8, collide: 'none' },
      // Traces de va-et-vient + flaque au bord.
      { assetKey: 'decal_s2_tracks', dx: 110, dy: -20, scale: 1.15, collide: 'none' },
      { assetKey: 'decal_s2_puddle', dx: -30, dy: 80, scale: 1.0, collide: 'none' },
    ],
  },

  // SCÈNE « fouille creusée » : un trou DÉJÀ fait — expliqué par son anneau
  // complet de déblais (pas d'engin, le front est ailleurs).
  scene_dig_done: {
    id: 'scene_dig_done',
    footprintRadius: 190,
    gates: [{ dx: 0, dy: 190 }],
    elements: [
      { assetKey: 'struct_stage02_pit', dx: 0, dy: 0, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 80 } },
      // Anneau COMPLET de 5 mottes autour du trou.
      { assetKey: 'prop_s2_dirt', dx: 140, dy: 0, scale: 0.85, collide: 'both', shape: { kind: 'circle', r: 32 } },
      { assetKey: 'prop_s2_dirt', dx: 62, dy: 128, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: -110, dy: 92, scale: 0.85, collide: 'both', shape: { kind: 'circle', r: 32 } },
      { assetKey: 'prop_s2_dirt', dx: -120, dy: -80, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: 40, dy: -132, scale: 0.82, collide: 'none' },
      { assetKey: 'decal_s2_puddle', dx: 20, dy: 60, scale: 0.9, collide: 'none' },
    ],
  },

  // SCÈNE « déblais » : les tas déchargés + LE bulldozer qui régale + traces.
  scene_spoil: {
    id: 'scene_spoil',
    footprintRadius: 190,
    gates: [{ dx: 0, dy: 150 }],
    elements: [
      { assetKey: 'prop_s2_dirt', dx: -110, dy: 20, scale: 0.9, collide: 'both', shape: { kind: 'circle', r: 36 } },
      { assetKey: 'prop_s2_dirt', dx: 0, dy: 8, scale: 0.98, collide: 'both', shape: { kind: 'circle', r: 40 } },
      { assetKey: 'prop_s2_dirt', dx: 110, dy: 24, scale: 0.86, collide: 'both', shape: { kind: 'circle', r: 34 } },
      // Le bull qui pousse les tas (au bord nord de la zone de dépôt).
      { assetKey: 'prop_s2_dozer', dx: 20, dy: -110, scale: 1.05, collide: 'both', shape: { kind: 'circle', r: 48 } },
      { assetKey: 'decal_s2_tracks', dx: -30, dy: 95, scale: 1.1, collide: 'none' },
    ],
  },

  // SCÈNE « stock de terre » : tas alignés stockés, SANS engin ni trou (dépôt pur).
  scene_stock: {
    id: 'scene_stock',
    footprintRadius: 160,
    gates: [{ dx: 0, dy: 120 }],
    elements: [
      { assetKey: 'prop_s2_dirt', dx: -120, dy: 6, scale: 0.82, collide: 'both', shape: { kind: 'circle', r: 32 } },
      { assetKey: 'prop_s2_dirt', dx: -20, dy: -6, scale: 0.9, collide: 'both', shape: { kind: 'circle', r: 34 } },
      { assetKey: 'prop_s2_dirt', dx: 80, dy: 4, scale: 0.84, collide: 'both', shape: { kind: 'circle', r: 30 } },
      { assetKey: 'prop_s2_dirt', dx: 155, dy: 12, scale: 0.78, collide: 'none' },
      { assetKey: 'decal_s2_tracks', dx: 0, dy: 90, scale: 1.0, collide: 'none' },
    ],
  },

  // SCÈNE « compactage » : le rouleau compresseur nivelle une bande de terre
  // déjà remblayée (une zone lissée + traces derrière). Machine EN TRAVAIL.
  scene_roll: {
    id: 'scene_roll',
    footprintRadius: 150,
    gates: [{ dx: 0, dy: 120 }],
    elements: [
      { assetKey: 'prop_s2_roller', dx: 0, dy: -10, scale: 1.05, collide: 'both', shape: { kind: 'circle', r: 46 } },
      // Bande lissée devant le rouleau (terre tassée = 2 petites mottes aplaties).
      { assetKey: 'prop_s2_dirt', dx: -70, dy: 70, scale: 0.6, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: 75, dy: 74, scale: 0.62, collide: 'none' },
    ],
  },

  // Parc engins : machines PARQUÉES au cordeau, piquets de coin.
  cluster_parc_row_terr: {
    id: 'cluster_parc_row_terr',
    footprintRadius: 250,
    gates: [{ dx: 0, dy: 90 }],
    elements: [
      { assetKey: 'prop_s2_roller', dx: -170, dy: 0, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 42 } },
      { assetKey: 'prop_s2_dozer', dx: 0, dy: 6, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 44 } },
      { assetKey: 'prop_s2_truck', dx: 170, dy: 0, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 44 } },
      { assetKey: 'fence_post', dx: -230, dy: -70, scale: 0.8, collide: 'none' },
      { assetKey: 'fence_post', dx: 230, dy: -70, scale: 0.8, collide: 'none' },
      { assetKey: 'decal_s2_tracks', dx: -80, dy: 95, scale: 1.1, collide: 'none' },
    ],
  },

  // Base vie : bungalow + panneau d'entrée (près du portail).
  cluster_base_vie_terr: {
    id: 'cluster_base_vie_terr',
    footprintRadius: 150,
    gates: [{ dx: 0, dy: 95 }],
    elements: [
      { assetKey: 'bungalow_shared', dx: 0, dy: 0, scale: 1.15, collide: 'both', shape: { kind: 'circle', r: 64 } },
      { assetKey: 'site_gate', dx: 130, dy: 55, scale: 0.55, collide: 'none' },
      { assetKey: 'fence_post', dx: -110, dy: 60, scale: 0.8, collide: 'none' },
    ],
  },

  // Ligne de piquets topo (bornage des zones futures).
  cluster_survey_row: {
    id: 'cluster_survey_row',
    footprintRadius: 130,
    gates: [],
    elements: [
      { assetKey: 'piquets_shared', dx: -100, dy: 0, scale: 1.0, collide: 'none' },
      { assetKey: 'piquets_shared', dx: 0, dy: -6, scale: 1.0, collide: 'none' },
      { assetKey: 'piquets_shared', dx: 100, dy: 2, scale: 1.0, collide: 'none' },
    ],
  },

  // Portail principal du chantier (sur la route, cosmétique — c'est LE passage).
  cluster_gate_main: {
    id: 'cluster_gate_main',
    footprintRadius: 185,
    gates: [],
    elements: [
      { assetKey: 'site_gate', dx: 0, dy: -20, scale: 1.35, collide: 'none' },
      { assetKey: 'fence_post', dx: -170, dy: -10, scale: 0.9, collide: 'none' },
      { assetKey: 'fence_post', dx: 170, dy: -10, scale: 0.9, collide: 'none' },
    ],
  },

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
      // Anneau de déblais autour de la fosse (R-E : un trou = ses déblais).
      { assetKey: 'prop_s2_dirt', dx: -95, dy: -70, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: -85, dy: 60, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: 95, dy: -60, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_s2_dirt', dx: 55, dy: 95, scale: 0.78, collide: 'none' },
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
  // road_strip fait 192×64 (le commentaire annonçait 128, faux) : 192 × 1.7 ≈ 326 px
  // posés tous les ROUTE_TILE=210 px → recouvrement large, donc bande continue.
  // ─────────────────────────────────────────────────────────────────────────
  cluster_route: {
    id: 'cluster_route',
    footprintRadius: 120,
    gates: [],
    elements: [
      { assetKey: 'road_strip', dx: 0, dy: 0, scale: 1.7, collide: 'none', layer: 'decal' }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 03 - Fondations: named causal scenes.
  scene_foundation_pour_spawn: {
    id: 'scene_foundation_pour_spawn',
    footprintRadius: 460,
    gates: [{ dx: 0, dy: 310 }],
    elements: [
      // Le spawn est juste au sud de cette dalle : le premier ecran doit lire
      // "coulage de fondations", pas "carrefour de pistes".
      { assetKey: 'struct_stage03_slab_rebar', dx: 0, dy: 68, scale: 1.0, collide: 'none', surfaceSlow: { radius: 105, multiplier: 0.62 } },
      { assetKey: 'landmark_stage03', dx: -100, dy: 74, scale: 0.72, collide: 'none' },
      { assetKey: 'struct_stage03_bay', dx: -15, dy: 48, scale: 0.78, collide: 'none' },
      { assetKey: 'prop_stage03_rebar', dx: -86, dy: 56, scale: 0.84, collide: 'none' },
      { assetKey: 'prop_stage03_formwork', dx: -190, dy: 112, scale: 0.68, collide: 'none' },
      // Flux beton : route sud-est -> toupie active -> pompe -> dalle.
      { assetKey: 'struct_stage03_pump', dx: 155, dy: 92, scale: 0.58, collide: 'none' },
      { assetKey: 'struct_stage03_mixer', dx: 420, dy: 126, scale: 0.58, flipX: true, collide: 'none' },
      { assetKey: 'prop_stage03_chute', dx: 92, dy: 92, scale: 0.72, collide: 'none' },
      { assetKey: 'prop_stage03_vibrator', dx: 34, dy: 146, scale: 0.66, collide: 'none' },
      { assetKey: 'prop_stage03_hose_active', dx: 112, dy: 126, scale: 2.1, collide: 'none', animation: { frameRate: 8 } },
      { assetKey: 'decal_stage03_spill', dx: 330, dy: 124, scale: 0.65, collide: 'none' },
      { assetKey: 'decal_stage03_spill', dx: 235, dy: 112, scale: 0.76, collide: 'none' },
      { assetKey: 'decal_stage03_spill', dx: 105, dy: 106, scale: 0.62, collide: 'none' },
    ],
  },

  scene_formwork_bay_active: {
    id: 'scene_formwork_bay_active',
    footprintRadius: 280,
    gates: [{ dx: 0, dy: 210 }],
    elements: [
      { assetKey: 'struct_stage03_bay', dx: 0, dy: -20, scale: 0.8, collide: 'none' },
      { assetKey: 'struct_stage03_strip_rebar', dx: -20, dy: 18, scale: 0.88, collide: 'both', shape: { kind: 'segment', x2: 142, y2: 0, thickness: 24 } },
      { assetKey: 'prop_stage03_boards', dx: -120, dy: 78, scale: 0.72, collide: 'none' },
      { assetKey: 'prop_stage03_circular_saw', dx: 116, dy: 82, scale: 0.64, collide: 'none' },
      { assetKey: 'prop_stage03_hammer', dx: 62, dy: 102, scale: 0.86, collide: 'none' },
      { assetKey: 'prop_stage03_clamps', dx: -48, dy: 110, scale: 0.68, collide: 'none' },
    ],
  },

  scene_rebar_ready: {
    id: 'scene_rebar_ready',
    footprintRadius: 240,
    gates: [{ dx: 0, dy: 150 }],
    elements: [
      { assetKey: 'prop_stage03_rebar', dx: -112, dy: -22, scale: 0.78, collide: 'none' },
      { assetKey: 'prop_stage03_rebar', dx: 0, dy: 0, scale: 0.78, collide: 'none' },
      { assetKey: 'prop_stage03_rebar', dx: 108, dy: 22, scale: 0.78, collide: 'none' },
      { assetKey: 'prop_stage03_formwork', dx: -24, dy: 96, scale: 0.72, collide: 'none' },
    ],
  },

  scene_rebar_stock: {
    id: 'scene_rebar_stock',
    footprintRadius: 290,
    gates: [{ dx: 0, dy: 120 }],
    elements: [
      { assetKey: 'prop_stage03_steel_props', dx: -170, dy: -34, scale: 0.82, collide: 'both', shape: { kind: 'circle', r: 52 } },
      { assetKey: 'prop_stage03_footing_cage', dx: 12, dy: -8, scale: 0.82, collide: 'both', shape: { kind: 'segment', x2: 116, y2: 0, thickness: 34 } },
      { assetKey: 'prop_stage03_column_cage', dx: 182, dy: -28, scale: 0.78, collide: 'both', shape: { kind: 'circle', r: 34 } },
      { assetKey: 'prop_stage03_pliers', dx: -40, dy: 92, scale: 0.82, collide: 'none' },
      { assetKey: 'prop_stage03_binding_wire', dx: 46, dy: 94, scale: 0.82, collide: 'none' },
      { assetKey: 'prop_stage03_spacers', dx: 124, dy: 92, scale: 0.72, collide: 'none' },
    ],
  },

  scene_mixer_waiting: {
    id: 'scene_mixer_waiting',
    footprintRadius: 260,
    gates: [{ dx: 0, dy: 150 }],
    elements: [
      // `layer: 'decal'` explicite : `piste_strip` ne commence ni par `road_` ni
      // par `decal_`, donc l'ancienne déduction par préfixe le hissait à hauteur
      // de prop — une bande de terre flottant au-dessus du sol.
      { assetKey: 'piste_strip', dx: 0, dy: 44, scale: 1.35, collide: 'none', layer: 'decal' },
      { assetKey: 'struct_stage03_mixer', dx: 0, dy: -22, scale: 1.05, collide: 'none' },
      { assetKey: 'decal_stage03_spill', dx: 118, dy: 66, scale: 0.65, collide: 'none' },
    ],
  },

  scene_small_mixer_patch: {
    id: 'scene_small_mixer_patch',
    footprintRadius: 260,
    gates: [{ dx: 0, dy: 170 }],
    elements: [
      { assetKey: 'prop_stage03_concrete_mixer', dx: -78, dy: -18, scale: 0.65, collide: 'none' },
      { assetKey: 'prop_stage03_formwork', dx: 80, dy: 42, scale: 0.72, collide: 'none' },
      { assetKey: 'decal_stage03_spill', dx: 18, dy: 96, scale: 0.78, collide: 'none' },
    ],
  },

  scene_concrete_defect_minor: {
    id: 'scene_concrete_defect_minor',
    footprintRadius: 170,
    gates: [{ dx: 0, dy: 110 }],
    elements: [
      { assetKey: 'decal_stage03_crack', dx: 0, dy: 0, scale: 0.7, collide: 'none' },
      { assetKey: 'decal_stage03_spill', dx: 64, dy: 30, scale: 0.58, collide: 'none' },
    ],
  },

  scene_layout_implantation: {
    id: 'scene_layout_implantation',
    footprintRadius: 230,
    gates: [{ dx: 0, dy: 150 }],
    elements: [
      { assetKey: 'decal_stage03_layout', dx: 0, dy: 0, scale: 1.0, collide: 'none' },
      { assetKey: 'prop_stage03_laser_level', dx: -118, dy: -42, scale: 0.72, collide: 'none' },
      { assetKey: 'prop_stage03_stakes', dx: 108, dy: -42, scale: 0.68, collide: 'none' },
      { assetKey: 'prop_stage03_marking_spray', dx: -76, dy: 86, scale: 0.82, collide: 'none' },
      { assetKey: 'prop_stage03_mason_rule', dx: 58, dy: 94, scale: 0.72, collide: 'none' },
      { assetKey: 'prop_stage03_chalk_line', dx: 126, dy: 72, scale: 0.68, collide: 'none' },
    ],
  },

  scene_concrete_preparation: {
    id: 'scene_concrete_preparation',
    footprintRadius: 250,
    gates: [{ dx: 0, dy: 170 }],
    elements: [
      { assetKey: 'prop_stage03_concrete_mixer', dx: -78, dy: -30, scale: 0.72, collide: 'both', shape: { kind: 'circle', r: 38 } },
      { assetKey: 'prop_stage03_wheelbarrow_concrete', dx: 88, dy: -16, scale: 0.74, collide: 'none' },
      { assetKey: 'prop_stage03_bag_open', dx: -154, dy: 76, scale: 0.74, collide: 'none' },
      { assetKey: 'prop_stage03_mixing_tub', dx: -30, dy: 92, scale: 0.72, collide: 'none' },
      { assetKey: 'prop_stage03_bucket', dx: 72, dy: 92, scale: 0.78, collide: 'none' },
      { assetKey: 'prop_stage03_shovel', dx: 146, dy: 82, scale: 0.9, rotation: 0.35, collide: 'none' },
      { assetKey: 'prop_stage03_trowel', dx: 16, dy: 126, scale: 0.86, collide: 'none' },
    ],
  },

  scene_footing_reinforced: {
    id: 'scene_footing_reinforced',
    footprintRadius: 300,
    gates: [{ dx: 0, dy: 210 }],
    elements: [
      { assetKey: 'struct_stage03_blinding', dx: 0, dy: 8, scale: 1.0, collide: 'none' },
      { assetKey: 'prop_stage03_footing_cage', dx: -76, dy: -6, scale: 0.82, collide: 'both', shape: { kind: 'segment', x2: 142, y2: 0, thickness: 34 } },
      { assetKey: 'struct_stage03_pad_starters', dx: 116, dy: 12, scale: 0.72, collide: 'both', shape: { kind: 'circle', r: 52 } },
      { assetKey: 'prop_stage03_starter_rebars', dx: -154, dy: 84, scale: 0.7, collide: 'none' },
      { assetKey: 'prop_stage03_pliers', dx: 12, dy: 112, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage03_spirit_level', dx: 118, dy: 106, scale: 0.72, collide: 'none' },
    ],
  },

  scene_slab_in_progress: {
    id: 'scene_slab_in_progress',
    footprintRadius: 300,
    gates: [{ dx: 0, dy: 210 }],
    elements: [
      { assetKey: 'struct_stage03_slab_rebar', dx: 0, dy: 0, scale: 1.0, collide: 'none', surfaceSlow: { radius: 110, multiplier: 0.62 } },
      { assetKey: 'prop_stage03_vibrator', dx: -138, dy: 72, scale: 0.7, collide: 'none' },
      { assetKey: 'prop_stage03_power_trowel', dx: 132, dy: 54, scale: 0.72, collide: 'none' },
      { assetKey: 'prop_stage03_chute', dx: 142, dy: -60, scale: 0.68, collide: 'none' },
      { assetKey: 'prop_stage03_float', dx: -24, dy: 126, scale: 0.84, collide: 'none' },
    ],
  },

  scene_curing_zone: {
    id: 'scene_curing_zone',
    footprintRadius: 270,
    gates: [{ dx: 0, dy: 190 }],
    elements: [
      { assetKey: 'struct_stage03_strip_fresh', dx: -34, dy: -34, scale: 0.9, collide: 'none', surfaceSlow: { radius: 92, multiplier: 0.62 } },
      { assetKey: 'struct_stage03_grade_beam', dx: 64, dy: 48, scale: 0.78, collide: 'both', shape: { kind: 'segment', x2: 132, y2: 0, thickness: 28 } },
      { assetKey: 'prop_stage03_tarp_covered', dx: -126, dy: 80, scale: 0.72, collide: 'both', shape: { kind: 'circle', r: 46 } },
      { assetKey: 'prop_stage03_tarp_folded', dx: 82, dy: 112, scale: 0.76, collide: 'none' },
      { assetKey: 'prop_stage03_bucket', dx: 154, dy: 88, scale: 0.74, collide: 'none' },
    ],
  },

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
