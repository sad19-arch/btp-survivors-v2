/**
 * Modèle de prefabs (clusters) de chantier — DATA PURE.
 *
 * T1 : définitions typées des clusters + association stage → clusters.
 * Aucun Phaser, aucun DOM, aucun Math.random, aucune logique de placement.
 * Le placement (T2) et le rendu (T3) lisent ces données ; elles n'en dépendent pas.
 */
import type { RenderLayer, TilePatch } from './stageLayout'
import { resolveSolidity, type CollideKind, type ObstacleShape, type Solidity } from './assetSolidity'

/**
 * `CollideKind`/`ObstacleShape` vivent désormais dans `assetSolidity` (la source
 * unique de la solidité) et sont ré-exportés ici : les consommateurs historiques
 * importent toujours depuis `@content/clusters`.
 */
export type { CollideKind, ObstacleShape } from './assetSolidity'

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

/**
 * Prefabs TELS QU'ÉCRITS À LA MAIN. **Ne pas consommer directement** : la
 * solidité y est encore celle que l'auteur du cluster a tapée, donc faillible
 * (la même clé s'y contredisait d'un cluster à l'autre). Le registre public
 * `CLUSTERS`, plus bas, est la version dont la solidité est RÉSOLUE.
 */
const RAW_CLUSTERS: Record<string, ClusterDef> = {
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
    // L'ouverture, c'est le portail lui-même : depuis que les poteaux sont des
    // corps solides (solidité déclarée), ce cluster doit dire où l'on passe.
    gates: [{ dx: 0, dy: -20 }],
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
      // Pelleteuse côté NE (décoration, pas de collision) — VIVANTE : le bras
      // creuse. `scale` 1.2 → 1.11 : la feuille animée est sur un canvas 192
      // (figure 137 px) là où la statique est en 176 (figure 127 px) ; à scale
      // égale l'engin GRANDIRAIT de 8 %. 1.11 rend la MÊME hauteur écran
      // (152 px) que l'engin statique qu'elle remplace — swap invisible.
      {
        assetKey: 'prop_s2_excavator_work',
        dx: 105,
        dy: -90,
        scale: 1.11,
        collide: 'none',
        animation: { frameRate: 8 }
      },
      // Benne côté E près de l'ouverture (décoration) — VIVANTE : la benne
      // bascule. 1.05 → 1.02 pour la même raison (figure 142 vs 138 → 145 px).
      // frameRate 6 : une benne qui bascule en 1,2 s, pas en 0,9 s.
      {
        assetKey: 'prop_s2_truck_work',
        dx: 100,
        dy: 50,
        scale: 1.02,
        collide: 'none',
        animation: { frameRate: 6 }
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
      // Bulldozer VIVANT : la lame pousse un tas de terre. scale 1.0 → 0.70 —
      // la feuille animée cadre l'engin bien plus large (figure 151 px contre
      // 105 px pour la statique) ; à scale égale le bulldozer GRANDIRAIT de 44 %.
      // 0.70 rend exactement les 105 px de l'engin statique qu'elle remplace.
      { assetKey: 'prop_s2_dozer_work', dx: 55, dy: 0, scale: 0.7, collide: 'none', animation: { frameRate: 7 } }
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
      // La pompe est un ENGIN : depuis qu'elle bloque (solidité déclarée), sa
      // place historique (155, 92) tombait à 201 px du spawn, sous le contrat
      // « rien de bloquant à moins de 350 px du spawn » (poche de départ libre).
      // Deux contrats l'encadrent désormais (foundationComposition.test) : ≥ 350
      // (poche libre) et ≤ 360 (elle doit rester dans le cadre du 1er écran).
      // Elle se pose donc PILE au bord de la poche — 355 px, au nord-est : on la
      // voit, elle ne barre pas le départ, et le flux toupie(SE) → pompe(NE) →
      // tuyau → dalle reste lisible. ⚠️ Fenêtre de 10 px : la déplacer casse un
      // des deux contrats.
      { assetKey: 'struct_stage03_pump', dx: 218, dy: -60, scale: 0.58, collide: 'none' },
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SCÈNES « PLAN DE CHANTIER » DES STAGES 05 → 10 (SP-T7)
  //
  // Même doctrine que les scènes 02/03 au-dessus : on compose des SCÈNES
  // CAUSALES (un engin + ce sur quoi il travaille + les matériaux qu'il
  // consomme), jamais des assets isolés. Chaque stage a le même squelette —
  // signature (ancrée au spawn) · travail · stock · parc — pour que le joueur
  // relise la même grammaire de chantier d'une phase à l'autre, et que seul le
  // MÉTIER change.
  //
  // ⚠️ CONTRAINTE DE CHARGEMENT : un stage ne charge QUE ses propres clés
  // (`src/render/stages.ts`) + le kit partagé préchargé par `GameScene`
  // (fence_panel/fence_post/site_gate/road_strip/piste_strip/bungalow_shared/
  // piquets_shared). Les clés `prop_s2_*`/`struct_stage02_pit` sont DÉCLARÉES
  // AU SEUL STAGE 02 : les réutiliser ici ne rendrait RIEN (texture absente).
  // D'où des scènes 100 % bâties sur les assets du stage.
  //
  // ⚠️ POCHE DE SPAWN : dans une scène `*_signature` (ancrée à 270 px au NORD du
  // spawn), tout élément COLLIDABLE reste à `dy <= -80` → ≥ 350 px du joueur au
  // démarrage. Le côté joueur n'est que du décor traversable. Même contrat que
  // `scene_dig_active_spawn` (R-F).
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Stage 05 — GROS ŒUVRE : la grue monte les murs ────────────────────────
  scene_gros_oeuvre_signature: {
    id: 'scene_gros_oeuvre_signature',
    footprintRadius: 300,
    gates: [{ dx: 0, dy: 250 }],
    elements: [
      // Le mur qui monte : LE tableau de la phase, face au joueur.
      { assetKey: 'struct_stage05_wall', dx: 0, dy: -30, scale: 1.0, collide: 'none' },
      // La grue à tour qui l'alimente (déclarée bloquante r60 — loin du spawn).
      { assetKey: 'struct_stage05_crane', dx: -70, dy: -200, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 60 } },
      // Le crochet pend au-dessus du mur : on lit le flux grue → mur.
      { assetKey: 'prop_stage05_crane_hook', dx: 60, dy: -120, scale: 0.75, collide: 'none' },
      // Les blocs qu'on maçonne, côté joueur = décor traversable.
      { assetKey: 'prop_stage05_block_pallet', dx: 200, dy: 40, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage05_block_pallet', dx: -190, dy: 60, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage05_concrete_pole', dx: 120, dy: 120, scale: 0.75, collide: 'none' },
    ],
  },
  scene_gros_oeuvre_work: {
    id: 'scene_gros_oeuvre_work',
    footprintRadius: 250,
    gates: [{ dx: 0, dy: 190 }],
    elements: [
      // La grue mobile décharge les poteaux (engin EN TRAVAIL, bloquant r52).
      { assetKey: 'struct_stage05_mixer', dx: 0, dy: -40, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 52 } },
      { assetKey: 'prop_stage05_crane_hook', dx: 70, dy: -150, scale: 0.7, collide: 'none' },
      { assetKey: 'prop_stage05_concrete_pole', dx: -130, dy: 70, scale: 0.8, collide: 'none' },
      { assetKey: 'struct_stage05_wall', dx: 150, dy: 80, scale: 0.7, collide: 'none' },
    ],
  },
  scene_gros_oeuvre_stock: {
    id: 'scene_gros_oeuvre_stock',
    footprintRadius: 200,
    gates: [{ dx: 0, dy: 150 }],
    elements: [
      { assetKey: 'prop_stage05_block_pallet', dx: -120, dy: 0, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage05_block_pallet', dx: 0, dy: 20, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage05_block_pallet', dx: 120, dy: 0, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage05_concrete_pole', dx: -40, dy: 110, scale: 0.75, collide: 'none' },
    ],
  },
  scene_gros_oeuvre_parc: {
    id: 'scene_gros_oeuvre_parc',
    footprintRadius: 280,
    gates: [{ dx: 0, dy: 100 }],
    elements: [
      // Machines PARQUÉES au cordeau (exemption min-dist : c'est un parc).
      { assetKey: 'struct_stage05_mixer', dx: -150, dy: 0, scale: 0.95, collide: 'both', shape: { kind: 'circle', r: 52 } },
      { assetKey: 'prop_stage05_crane_hook', dx: 60, dy: -20, scale: 0.7, collide: 'none' },
      { assetKey: 'fence_post', dx: -240, dy: -80, scale: 0.8, collide: 'none' },
      { assetKey: 'fence_post', dx: 240, dy: -80, scale: 0.8, collide: 'none' },
    ],
  },

  // ── Stage 06 — ÉCHAFAUDAGES : on monte la cage autour du bâtiment ─────────
  scene_echafaudages_signature: {
    id: 'scene_echafaudages_signature',
    footprintRadius: 300,
    gates: [{ dx: 0, dy: 250 }],
    elements: [
      // La travée d'échafaudage en cours de montage — le tableau de la phase.
      { assetKey: 'struct_stage06_grid', dx: 0, dy: -40, scale: 1.0, collide: 'none' },
      // La nacelle qui monte les monteurs (déclarée bloquante r46).
      { assetKey: 'struct_stage06_nacelle', dx: -80, dy: -190, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 46 } },
      // Les tubes qu'on assemble, côté joueur = décor.
      { assetKey: 'prop_stage06_tubes', dx: 190, dy: 30, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage06_plancher', dx: -170, dy: 70, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage06_garde_corps', dx: 110, dy: 120, scale: 0.75, collide: 'none' },
      { assetKey: 'prop_stage06_echelle', dx: -40, dy: 130, scale: 0.75, collide: 'none' },
    ],
  },
  scene_echafaudages_work: {
    id: 'scene_echafaudages_work',
    footprintRadius: 250,
    gates: [{ dx: 0, dy: 190 }],
    elements: [
      { assetKey: 'struct_stage06_nacelle', dx: 0, dy: -40, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 46 } },
      { assetKey: 'prop_stage06_scaffold', dx: 140, dy: 30, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage06_garde_corps', dx: -130, dy: 60, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage06_echelle', dx: 40, dy: 120, scale: 0.75, collide: 'none' },
    ],
  },
  scene_echafaudages_stock: {
    id: 'scene_echafaudages_stock',
    footprintRadius: 200,
    gates: [{ dx: 0, dy: 150 }],
    elements: [
      { assetKey: 'prop_stage06_tubes', dx: -120, dy: 0, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage06_tubes', dx: 10, dy: 20, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage06_plancher', dx: 125, dy: 0, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage06_echelle', dx: -30, dy: 110, scale: 0.75, collide: 'none' },
    ],
  },
  scene_echafaudages_parc: {
    id: 'scene_echafaudages_parc',
    footprintRadius: 280,
    gates: [{ dx: 0, dy: 100 }],
    elements: [
      { assetKey: 'struct_stage06_nacelle', dx: -150, dy: 0, scale: 0.95, collide: 'both', shape: { kind: 'circle', r: 46 } },
      { assetKey: 'prop_stage06_scaffold', dx: 70, dy: -10, scale: 0.8, collide: 'none' },
      { assetKey: 'fence_post', dx: -240, dy: -80, scale: 0.8, collide: 'none' },
      { assetKey: 'fence_post', dx: 240, dy: -80, scale: 0.8, collide: 'none' },
    ],
  },

  // ── Stage 07 — CHARPENTE / TOITURE : on lève les fermes ──────────────────
  scene_charpente_signature: {
    id: 'scene_charpente_signature',
    footprintRadius: 300,
    gates: [{ dx: 0, dy: 250 }],
    elements: [
      // Les fermes posées — le tableau de la phase.
      { assetKey: 'struct_stage07_truss', dx: 0, dy: -40, scale: 1.0, collide: 'none' },
      // Le camion-grue qui les lève (déclaré bloquant r52).
      { assetKey: 'struct_stage07_crane', dx: -80, dy: -195, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 52 } },
      // La charge suspendue entre les deux : on lit le levage.
      { assetKey: 'struct_stage07_load', dx: 70, dy: -130, scale: 0.75, collide: 'none' },
      // Les matériaux au sol, côté joueur = décor.
      { assetKey: 'prop_stage07_beam', dx: 190, dy: 40, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage07_tile_pile', dx: -180, dy: 70, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage07_insul', dx: 100, dy: 125, scale: 0.75, collide: 'none' },
    ],
  },
  scene_charpente_work: {
    id: 'scene_charpente_work',
    footprintRadius: 250,
    gates: [{ dx: 0, dy: 190 }],
    elements: [
      { assetKey: 'struct_stage07_crane', dx: 0, dy: -40, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 52 } },
      { assetKey: 'struct_stage07_load', dx: 80, dy: -140, scale: 0.7, collide: 'none' },
      { assetKey: 'prop_stage07_beam', dx: -130, dy: 60, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage07_gutter', dx: 130, dy: 90, scale: 0.75, collide: 'none' },
    ],
  },
  scene_charpente_stock: {
    id: 'scene_charpente_stock',
    footprintRadius: 200,
    gates: [{ dx: 0, dy: 150 }],
    elements: [
      { assetKey: 'prop_stage07_tile_pile', dx: -120, dy: 0, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage07_tile_pile', dx: 0, dy: 20, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage07_beam', dx: 120, dy: 0, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage07_insul', dx: -40, dy: 110, scale: 0.75, collide: 'none' },
    ],
  },
  scene_charpente_parc: {
    id: 'scene_charpente_parc',
    footprintRadius: 280,
    gates: [{ dx: 0, dy: 100 }],
    elements: [
      { assetKey: 'struct_stage07_crane', dx: -150, dy: 0, scale: 0.95, collide: 'both', shape: { kind: 'circle', r: 52 } },
      { assetKey: 'prop_stage07_gutter', dx: 70, dy: -10, scale: 0.75, collide: 'none' },
      { assetKey: 'fence_post', dx: -240, dy: -80, scale: 0.8, collide: 'none' },
      { assetKey: 'fence_post', dx: 240, dy: -80, scale: 0.8, collide: 'none' },
    ],
  },

  // ── Stage 08 — SECOND ŒUVRE : cloisons, gaines, électricité ──────────────
  scene_second_oeuvre_signature: {
    id: 'scene_second_oeuvre_signature',
    footprintRadius: 300,
    gates: [{ dx: 0, dy: 250 }],
    elements: [
      // La pièce cloisonnée en cours — le tableau de la phase.
      { assetKey: 'struct_stage08_partition', dx: 0, dy: -40, scale: 1.0, collide: 'none' },
      // Le fourgon de l'artisan garé au bord (déclaré bloquant r46).
      { assetKey: 'struct_stage08_van', dx: -90, dy: -190, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 46 } },
      // Ce qu'il décharge : plaques, gaines, câbles — côté joueur = décor.
      { assetKey: 'prop_stage08_drywall', dx: 190, dy: 40, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage08_pvc', dx: -180, dy: 70, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage08_cables', dx: 110, dy: 125, scale: 0.75, collide: 'none' },
      { assetKey: 'prop_stage08_elecpanel', dx: -50, dy: 130, scale: 0.7, collide: 'none' },
    ],
  },
  scene_second_oeuvre_work: {
    id: 'scene_second_oeuvre_work',
    footprintRadius: 250,
    gates: [{ dx: 0, dy: 190 }],
    elements: [
      { assetKey: 'struct_stage08_van', dx: 0, dy: -40, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 46 } },
      { assetKey: 'prop_stage08_drywall', dx: -140, dy: 50, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage08_elecpanel', dx: 130, dy: 40, scale: 0.7, collide: 'none' },
      { assetKey: 'prop_stage08_cables', dx: 20, dy: 120, scale: 0.75, collide: 'none' },
    ],
  },
  scene_second_oeuvre_stock: {
    id: 'scene_second_oeuvre_stock',
    footprintRadius: 200,
    gates: [{ dx: 0, dy: 150 }],
    elements: [
      { assetKey: 'prop_stage08_drywall', dx: -120, dy: 0, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage08_pvc', dx: 0, dy: 20, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage08_cables', dx: 120, dy: 0, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage08_elecpanel', dx: -40, dy: 110, scale: 0.7, collide: 'none' },
    ],
  },
  scene_second_oeuvre_parc: {
    id: 'scene_second_oeuvre_parc',
    footprintRadius: 280,
    gates: [{ dx: 0, dy: 100 }],
    elements: [
      { assetKey: 'struct_stage08_van', dx: -150, dy: 0, scale: 0.95, collide: 'both', shape: { kind: 'circle', r: 46 } },
      { assetKey: 'prop_stage08_pvc', dx: 70, dy: -10, scale: 0.8, collide: 'none' },
      { assetKey: 'fence_post', dx: -240, dy: -80, scale: 0.8, collide: 'none' },
      { assetKey: 'fence_post', dx: 240, dy: -80, scale: 0.8, collide: 'none' },
    ],
  },

  // ── Stage 09 — FINITIONS : peinture, carrelage, la pièce se termine ──────
  scene_finitions_signature: {
    id: 'scene_finitions_signature',
    footprintRadius: 300,
    gates: [{ dx: 0, dy: 250 }],
    elements: [
      // La pièce finie — le tableau de la phase (on VOIT le résultat).
      { assetKey: 'struct_stage09_room', dx: 0, dy: -40, scale: 1.0, collide: 'none' },
      // Le poste de peinture qui l'alimente.
      { assetKey: 'struct_stage09_station', dx: -90, dy: -180, scale: 0.9, collide: 'none' },
      // Les outils du finisseur, côté joueur = décor.
      { assetKey: 'prop_stage09_paint', dx: 180, dy: 40, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage09_tile_pallet', dx: -175, dy: 70, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage09_roller', dx: 100, dy: 125, scale: 0.75, collide: 'none' },
      { assetKey: 'prop_stage09_tarp', dx: -40, dy: 130, scale: 0.75, collide: 'none' },
    ],
  },
  scene_finitions_work: {
    id: 'scene_finitions_work',
    footprintRadius: 250,
    gates: [{ dx: 0, dy: 190 }],
    elements: [
      { assetKey: 'struct_stage09_station', dx: 0, dy: -40, scale: 0.9, collide: 'none' },
      { assetKey: 'prop_stage09_tile_cutter', dx: 130, dy: 40, scale: 0.75, collide: 'none' },
      { assetKey: 'prop_stage09_paint', dx: -130, dy: 50, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage09_roller', dx: 20, dy: 120, scale: 0.75, collide: 'none' },
    ],
  },
  scene_finitions_stock: {
    id: 'scene_finitions_stock',
    footprintRadius: 200,
    gates: [{ dx: 0, dy: 150 }],
    elements: [
      { assetKey: 'prop_stage09_tile_pallet', dx: -120, dy: 0, scale: 0.85, collide: 'none' },
      { assetKey: 'prop_stage09_paint', dx: 0, dy: 20, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage09_tarp', dx: 120, dy: 0, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage09_roller', dx: -40, dy: 110, scale: 0.75, collide: 'none' },
    ],
  },
  scene_finitions_parc: {
    id: 'scene_finitions_parc',
    footprintRadius: 280,
    gates: [{ dx: 0, dy: 100 }],
    elements: [
      { assetKey: 'prop_stage09_tile_cutter', dx: -150, dy: 0, scale: 0.8, collide: 'none' },
      { assetKey: 'struct_stage09_station', dx: 70, dy: -10, scale: 0.8, collide: 'none' },
      { assetKey: 'fence_post', dx: -240, dy: -80, scale: 0.8, collide: 'none' },
      { assetKey: 'fence_post', dx: 240, dy: -80, scale: 0.8, collide: 'none' },
    ],
  },

  // ── Stage 10 — LIVRAISON / AUDIT : le bâtiment est fini, on inspecte ─────
  scene_livraison_signature: {
    id: 'scene_livraison_signature',
    footprintRadius: 300,
    gates: [{ dx: 0, dy: 250 }],
    elements: [
      // LE bâtiment livré — le tableau de la phase (la récompense du cycle).
      { assetKey: 'struct_stage10_building', dx: 0, dy: -50, scale: 1.0, collide: 'none' },
      // Le fourgon d'inspection garé devant (déclaré bloquant r46).
      { assetKey: 'struct_stage10_van', dx: -95, dy: -185, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 46 } },
      // Le panneau CONFORME : la phase se lit en 2 s.
      { assetKey: 'prop_stage10_sign_ok', dx: 100, dy: -120, scale: 0.8, collide: 'none' },
      // Le balisage de réception, côté joueur = décor traversable.
      { assetKey: 'prop_stage10_cones', dx: 180, dy: 50, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage10_cones', dx: -170, dy: 75, scale: 0.75, collide: 'none' },
      { assetKey: 'prop_stage10_projector', dx: 60, dy: 130, scale: 0.75, collide: 'none' },
    ],
  },
  scene_livraison_work: {
    id: 'scene_livraison_work',
    footprintRadius: 250,
    gates: [{ dx: 0, dy: 190 }],
    elements: [
      { assetKey: 'struct_stage10_van', dx: 0, dy: -40, scale: 1.0, collide: 'both', shape: { kind: 'circle', r: 46 } },
      { assetKey: 'prop_stage10_sign_ok', dx: 120, dy: 40, scale: 0.75, collide: 'none' },
      { assetKey: 'prop_stage10_cones', dx: -130, dy: 60, scale: 0.75, collide: 'none' },
      { assetKey: 'prop_stage10_projector', dx: 30, dy: 120, scale: 0.75, collide: 'none' },
    ],
  },
  scene_livraison_stock: {
    id: 'scene_livraison_stock',
    footprintRadius: 220,
    gates: [{ dx: 0, dy: 150 }],
    elements: [
      // Le balisage qu'on REMBALLE : la barrière (déclarée segment bloquant).
      { assetKey: 'prop_stage10_barrier', dx: -120, dy: -10, scale: 0.85, collide: 'both', shape: { kind: 'segment', x2: 70, y2: 0, thickness: 10 } },
      { assetKey: 'prop_stage10_cones', dx: 40, dy: 20, scale: 0.8, collide: 'none' },
      { assetKey: 'prop_stage10_cones', dx: 140, dy: 0, scale: 0.75, collide: 'none' },
      { assetKey: 'prop_stage10_sign_ok', dx: -40, dy: 110, scale: 0.75, collide: 'none' },
    ],
  },
  scene_livraison_parc: {
    id: 'scene_livraison_parc',
    footprintRadius: 280,
    gates: [{ dx: 0, dy: 100 }],
    elements: [
      { assetKey: 'struct_stage10_van', dx: -150, dy: 0, scale: 0.95, collide: 'both', shape: { kind: 'circle', r: 46 } },
      { assetKey: 'prop_stage10_projector', dx: 70, dy: -10, scale: 0.75, collide: 'none' },
      { assetKey: 'fence_post', dx: -240, dy: -80, scale: 0.8, collide: 'none' },
      { assetKey: 'fence_post', dx: 240, dy: -80, scale: 0.8, collide: 'none' },
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
    // Stock de charpente/toiture : isolant posé dans une opération distincte,
    // jamais mêlé au dépôt de poutres et de tuiles.
    storageCluster('cluster_storage_charpente', ['prop_stage07_beam', 'prop_stage07_tile_pile', 'prop_stage07_tile_pile']),
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
// MACHINES VIVANTES — engin statique → sa feuille animée
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Variante ANIMÉE d'un engin posé (« machines vivantes »).
 *
 * POURQUOI UN REGISTRE, et non un `animation:` tapé dans chaque cluster. Un même
 * engin est posé à ~17 endroits (les scènes des `SITE_PROGRAM` + les fabriques) ;
 * l'animer élément par élément, c'est la garantie d'en oublier — et c'est
 * EXACTEMENT ce qui s'est produit : les 3 feuilles du stage 02 avaient bien été
 * câblées à la main… dans `cluster_excavation` et `cluster_plant`, deux clusters
 * que PLUS AUCUN stage ne place depuis que `terrassement` a un `SITE_PROGRAM`
 * (mesuré : 0 instance sur les 10 stages ; le chemin `STAGE_CLUSTERS` est un
 * repli legacy que seuls `terrain_vierge` et `reseaux_enterres` empruntent
 * encore). Ces feuilles n'ont donc jamais tourné une seule frame. On déclare la
 * variante UNE fois ; la passe l'applique partout où l'engin est réellement posé.
 *
 * `scaleRatio` = hauteur_figure_statique ÷ hauteur_figure_animée, MESURÉ sur les
 * pixels opaques des deux feuilles. Il n'est pas cosmétique : les feuilles
 * animées ne cadrent pas l'engin comme les statiques, donc un swap de clé SEUL
 * change la taille à l'écran (le bulldozer grandissait de 44 %). Le ratio rend
 * la hauteur écran de l'engin statique remplacé — le swap est invisible.
 *
 * ⚠️ `scale` est du RENDU PUR : la collision vient de `ASSET_SOLIDITY`
 * (`extractObstacles` lit `shape.r`, jamais `scale`). Corriger l'échelle ne peut
 * donc pas bouger la sim.
 */
interface LiveEngine {
  /** Feuille animée. DOIT être déclarée en `editorExtras` avec un `frame` :
   *  c'est ce qui la charge en SPRITESHEET, sans quoi `generateFrameNumbers`
   *  ne trouve qu'une frame et rien ne tourne. (Vérifié par clusters.test.ts.) */
  workKey: string
  /** Correction d'échelle : garde la hauteur écran de la statique remplacée. */
  scaleRatio: number
  frameRate: number
}

/**
 * ⚠️ RÉSERVE DA — `struct_stage05_mixer` (la TOUPIE du stage 05) est ABSENT de
 * ce registre, VOLONTAIREMENT. Sa feuille `mobile_crane_work` est en vue de
 * CÔTÉ là où la statique a une vraie 3/4 top-down cohérente avec la caméra :
 * le rapport largeur/hauteur de la figure passe de 1,20 à 1,71 (+43 % d'écrasement),
 * donc aucune échelle ne peut rendre la même silhouette — à hauteur égale l'engin
 * est 43 % plus large et perd sa masse. Jugé sur planche en contexte (vrai sol,
 * joueur 99 px) : c'est une RÉGRESSION, pas un gain. La statique reste posée.
 * Cause connue et isolée : c'est `animate_object` v3 qui aplatit, pas la source
 * (cf. la réserve détaillée dans `render/stages.ts`). La feuille reste déclarée
 * en `editorExtras` (chargée, disponible à l'éditeur), simplement non branchée.
 */
const LIVE_ENGINES: Readonly<Record<string, LiveEngine>> = {
  // Stage 02 — terrassement. Ratios et frameRates repris des valeurs déjà
  // réglées à la main dans les clusters orphelins : mêmes engins, mêmes gestes.
  // Le bras creuse ; la benne bascule (6 = 1,2 s, pas 0,9 s) ; la lame pousse.
  prop_s2_excavator: { workKey: 'prop_s2_excavator_work', scaleRatio: 0.927, frameRate: 8 },
  prop_s2_truck: { workKey: 'prop_s2_truck_work', scaleRatio: 0.972, frameRate: 6 },
  prop_s2_dozer: { workKey: 'prop_s2_dozer_work', scaleRatio: 0.695, frameRate: 7 },
  // Stage 03 — fondations : la toupie tourne, la bétonnière tourne.
  struct_stage03_mixer: { workKey: 'struct_stage03_mixer_work', scaleRatio: 1.808, frameRate: 6 },
  prop_stage03_concrete_mixer: {
    workKey: 'prop_stage03_concrete_mixer_work',
    scaleRatio: 1.0,
    frameRate: 8
  },
  // Stage 04 — réseaux enterrés : le bras de la mini-pelle creuse la tranchée.
  struct_stage04_excavator: {
    workKey: 'struct_stage04_excavator_work',
    scaleRatio: 1.302,
    frameRate: 8
  },
  // Stage 05 — gros œuvre (la toupie est écartée, cf. RÉSERVE DA ci-dessus).
  struct_stage05_crane: { workKey: 'struct_stage05_crane_work', scaleRatio: 1.126, frameRate: 6 },
  // Le crochet TOURNE lentement sur son câble (le modèle a rendu une vrille,
  // pas un balancier) → boucle directe et lente.
  prop_stage05_crane_hook: {
    workKey: 'prop_stage05_crane_hook_work',
    scaleRatio: 0.882,
    frameRate: 4
  },
  // Stage 06 — échafaudages : la nacelle CISEAUX monte et descend.
  struct_stage06_nacelle: { workKey: 'struct_stage06_nacelle_work', scaleRatio: 1.217, frameRate: 6 },
  // Stage 07 — charpente : le bras du camion-grue décharge la charpente.
  struct_stage07_crane: { workKey: 'struct_stage07_crane_work', scaleRatio: 1.099, frameRate: 6 }
}

/** Les engins statiques déclarés dans `LIVE_ENGINES` (lecture seule, pour les tests). */
export const LIVE_ENGINE_KEYS: readonly string[] = Object.keys(LIVE_ENGINES)

/** La variante animée d'un engin statique, ou `undefined` s'il n'en a pas. */
export function liveEngineFor(assetKey: string): LiveEngine | undefined {
  return LIVE_ENGINES[assetKey]
}

/**
 * Engin statique → sa variante ANIMÉE, partout où il est posé. Un asset absent
 * de `LIVE_ENGINES` (y compris la toupie stage 05) ressort strictement inchangé.
 */
function withLiveEngine(el: ClusterElement): ClusterElement {
  const live = LIVE_ENGINES[el.assetKey]
  if (live === undefined) {
    return el
  }
  return {
    ...el,
    assetKey: live.workKey,
    // Arrondi au millième : lisible en test, écart d'affichage < 0,1 px.
    scale: Math.round(el.scale * live.scaleRatio * 1000) / 1000,
    animation: { frameRate: live.frameRate }
  }
}

/**
 * Solidité écrite par l'auteur du cluster → solidité DÉCLARÉE (`assetSolidity`).
 * Un engin écrit `collide:'none'` dans un cluster et `'both'` dans le suivant
 * ressort bloquant dans les DEUX : la contradiction n'est plus représentable.
 */
function withDeclaredSolidity(el: ClusterElement): ClusterElement {
  const written: Solidity =
    el.collide === 'none'
      ? { collide: 'none' }
      : // Invariant T1 : `collide !== 'none'` ⇒ `shape` défini. Le repli garde le
        // fichier chargeable si un futur cluster l'oublie (même défaut que la sim).
        { collide: el.collide, shape: el.shape ?? { kind: 'circle', r: Math.max(16, el.scale * 40) } }
  const solid = resolveSolidity(el.assetKey, written)
  if (solid.collide === 'none') {
    const inert: ClusterElement = { ...el, collide: 'none' }
    // `collide:'none'` ⇒ `shape` absent (invariant vérifié par clusters.test.ts).
    delete inert.shape
    return inert
  }
  return { ...el, collide: solid.collide, shape: solid.shape }
}

/**
 * Registre global des prefabs par id — **engins vivants puis solidité résolue**,
 * donc cohérent avec l'éditeur et avec les compos joueur (tous lisent
 * `assetSolidity`).
 *
 * ORDRE : `withLiveEngine` AVANT `withDeclaredSolidity`. La solidité est ainsi
 * résolue sur la clé RÉELLEMENT posée (`*_work`), et non sur la statique qu'on
 * ne pose plus — `ASSET_SOLIDITY` reste la source unique de « ça bloque ou pas »
 * pour l'asset effectivement en jeu. C'est aussi le piège du lot : une variante
 * animée SANS entrée miroir dans `ASSET_SOLIDITY` retomberait sur ce que le
 * cluster a écrit, et les engins que les fabriques écrivent `collide:'none'`
 * (ils comptent sur la déclaration) deviendraient TRAVERSABLES. Les entrées
 * miroir sont donc vérifiées une à une par `clusters.test.ts`.
 */
export const CLUSTERS: Record<string, ClusterDef> = Object.fromEntries(
  Object.entries(RAW_CLUSTERS).map(([id, def]): [string, ClusterDef] => [
    id,
    { ...def, elements: def.elements.map(withLiveEngine).map(withDeclaredSolidity) }
  ])
)

// ─────────────────────────────────────────────────────────────────────────────
// Association stage → liste de (rôle de zone, clusterId à y placer).
// Les stages non définis ici n'ont PAS de clusters.
// ⚠️ terrain_vierge N'EST PAS une garde diff-0 : il a des clusters (5 rôles,
// ci-dessous), donc 36 obstacles mesurés (`buildSiteLayout(seed, 10240, 7680,
// 'terrain_vierge')` — terrassement=53, fondations=14). sim:check tourne sur
// le stage 01 et voit donc collision + champ de flux. Le déterminisme ne
// vient PAS d'une absence d'obstacles mais du RNG isolé (seed^0x51e0, cf.
// commentaire sur STAGE_CLUSTERS.terrain_vierge ci-dessous).
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
