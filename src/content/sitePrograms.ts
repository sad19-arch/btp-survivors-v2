/**
 * sitePrograms — programmes SÉMANTIQUES de chantier par stage (ÉTAPE 1 + 2 de la
 * méthode « plan de chantier »).
 *
 * Un vrai chantier a une logique : accès route → portail → base vie/parc engins
 * près de l'accès → zones de travail clôturées plus loin → déblais ADJACENTS à la
 * fouille → chemins continus reliant tout au portail. Ce fichier encode ce
 * raisonnement de contremaître en DONNÉES : le planificateur (`src/core/sitePlan.ts`)
 * les place déterministiquement, et les contraintes sont VÉRIFIÉES par tests
 * (`tests/unit/sitePlan.test.ts`) — un plan incohérent ne compile pas la CI.
 *
 * Contenu pur : zéro Phaser/DOM, zéro Math.random/Date. Données typées seulement.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Ancrage sémantique d'une zone dans le monde (résolu par le planificateur). */
export type ZoneAnchor =
  /** Bande nord (loin de la route), centrée sur xFrac de la largeur monde. */
  | { kind: 'north'; xFrac: number }
  /** Bord ouest, centrée sur yFrac de la hauteur monde. */
  | { kind: 'west'; yFrac: number }
  /** Bord est, centrée sur yFrac de la hauteur monde. */
  | { kind: 'east'; yFrac: number }
  /** Près du portail (bande sud), à distPx à l'est/ouest du portail. */
  | { kind: 'near_gate'; side: 'east' | 'west'; distPx: number }
  /** Collée à une autre zone (id), côté donné, avec un espace gapPx entre bords. */
  | { kind: 'adjacent'; to: string; side: 'east' | 'west' | 'north' | 'south'; gapPx: number }

/** Disposition d'un prefab DANS sa zone (résolue par siteLayout). */
export type PrefabArrangement =
  /** Au front de creusement : bord nord intérieur de la zone (engin au bord du trou). */
  | 'front_north'
  /** Alignés au cordeau le long du grand axe de la zone (parc, stocks, piquets). */
  | 'row'
  /** Répartis dans la zone avec espacement minimal (jamais deux collés). */
  | 'scatter'
  /** Au centre de la zone. */
  | 'center'
  /** Près de la porte, côté intérieur (camion à la rampe). */
  | 'at_door'
  /** Juste à côté du spawn (dans la zone signature) — ancre l'étape au démarrage. */
  | 'anchor_spawn'

/** Prefab à placer dans une zone : on place des CLUSTERS, jamais des assets isolés. */
export interface ZonePrefab {
  clusterId: string
  count: number
  arrangement: PrefabArrangement
}

/** Spécification d'une zone du chantier. */
export interface ZoneSpec {
  id: string
  /** Rôle sémantique (documentation + choix de prefabs en aval). */
  role: 'excavation' | 'spoil' | 'base_vie' | 'parc_engins' | 'stockage' | 'survey' | 'travail'
  /** Caractère du plan ASCII (majuscule = zone majeure). */
  glyph: string
  /** Demi-dimensions du rectangle de zone (px). */
  halfW: number
  halfH: number
  anchor: ZoneAnchor
  /** Clôturée en anneau FERMÉ avec N ouvertures (aucune clôture si absent). */
  fence?: { openings: number }
  /** Jitter seedé du centre (px, défaut 0) — irrégularité contrôlée, jamais le chaos. */
  jitterPx?: number
  /** Prefabs à placer dans la zone (ÉTAPE 3 — clusters Lego). */
  prefabs?: ZonePrefab[]
  /**
   * Zone SIGNATURE (R-F) : ancrée ADJACENTE au spawn pour que la scène
   * définitive de la phase soit face au joueur au démarrage (identifiable en 2 s).
   * Le planificateur écrase l'ancrage : bord sud de la zone ≈ spawn − SIGNATURE_GAP.
   */
  signature?: boolean
}

/** Paramètres des contraintes vérifiées par tests (ÉTAPE 2). */
export interface SiteRules {
  /** Distance minimale entre deux machines EN TRAVAIL (px). */
  minMachineDistPx: number
  /** Distance max bord-à-bord entre déblais et une excavation (px). */
  spoilAdjacentMaxPx: number
  /** Distance max bord de base vie → portail (px). */
  baseVieMaxFromGatePx: number
  /** Distance min bord de base vie → toute excavation (px). */
  baseVieMinFromExcavationPx: number
}

/** Programme complet d'un stage. */
export interface SiteProgram {
  /** Raisonnement contremaître (ÉTAPE 1) — documentation vivante du POURQUOI. */
  rationale: string
  zones: ZoneSpec[]
  /**
   * Ordre de raccordement des chemins depuis le portail (ids de zones).
   * Le planificateur trace une épine portail→nord + branches en L ; le BFS
   * de connexité est testé (contrainte 3).
   */
  connect: string[]
  rules: SiteRules
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 1 — TERRASSEMENT (golden)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contremaître : les camions arrivent par la route au SUD et passent LE portail.
 * À l'est du portail, la base vie (bungalow — on s'équipe en arrivant). À l'ouest,
 * le parc engins (machines parquées au cordeau, livrées par porte-char, près de la
 * route). Le travail : UNE grande fouille principale au NORD (loin de la route,
 * clôturée en anneau continu — c'est dangereux), ouverture/rampe orientée vers le
 * portail. Les déblais partent sur une zone ADJACENTE à l'EST de la fouille
 * (rotation courte pelle→camion→tas). Une fouille secondaire à l'OUEST (le
 * chantier avance par fronts). Des lignes de piquets topo au NE marquent les
 * zones futures. Chemins continus : portail → chaque zone.
 */
const TERRASSEMENT: SiteProgram = {
  rationale:
    'Accès sud unique ; base vie et parc engins près du portail ; fouille principale ' +
    'clôturée au nord avec rampe vers le portail ; déblais adjacents est ; fouille ' +
    'secondaire ouest ; piquets topo NE ; tout relié par pistes.',
  zones: [
    {
      id: 'fouille_principale',
      role: 'excavation',
      glyph: 'E',
      // Grande fouille CENTRÉE sur le spawn (le joueur démarre dedans) — assez
      // vaste pour plusieurs fronts, mais pas au point d'écraser les autres zones.
      halfW: 1500,
      halfH: 950,
      anchor: { kind: 'north', xFrac: 0.5 },
      // 3 ouvertures (le joueur spawn DEDANS → les ennemis entrent par plusieurs
      // côtés, pas de forteresse) débouchant sur les pistes.
      fence: { openings: 3 },
      jitterPx: 100,
      signature: true,
      prefabs: [
        // Le front ACTIF ancré JUSTE À CÔTÉ du spawn : le joueur démarre au bord
        // d'un trou avec sa pelleteuse → l'étape « terrassement » est lue en 2 s.
        // Scène dédiée (trou près du joueur, pelleteuse au bord nord = dans le cadre).
        { clusterId: 'scene_dig_active_spawn', count: 1, arrangement: 'anchor_spawn' },
        // Le chantier VIT : d'autres fronts + fouilles creusées + un compactage.
        { clusterId: 'scene_dig_active', count: 1, arrangement: 'scatter' },
        { clusterId: 'scene_dig_done', count: 2, arrangement: 'scatter' },
        { clusterId: 'scene_roll', count: 1, arrangement: 'scatter' },
      ],
    },
    {
      id: 'deblais',
      role: 'spoil',
      glyph: 'S',
      halfW: 900,
      halfH: 900,
      anchor: { kind: 'adjacent', to: 'fouille_principale', side: 'east', gapPx: 350 },
      jitterPx: 80,
      prefabs: [
        // Le bull régale les déblais + un stock de terre à côté.
        { clusterId: 'scene_spoil', count: 1, arrangement: 'center' },
        { clusterId: 'scene_stock', count: 1, arrangement: 'scatter' },
      ],
    },
    {
      id: 'fouille_secondaire',
      role: 'excavation',
      glyph: 'e',
      halfW: 750,
      halfH: 850,
      anchor: { kind: 'west', yFrac: 0.45 },
      fence: { openings: 1 },
      jitterPx: 100,
      prefabs: [
        // Un second front actif (le chantier avance par fronts).
        { clusterId: 'scene_dig_active', count: 1, arrangement: 'center' },
      ],
    },
    {
      id: 'parc_engins',
      role: 'parc_engins',
      glyph: 'P',
      halfW: 850,
      halfH: 550,
      anchor: { kind: 'near_gate', side: 'west', distPx: 2600 },
      jitterPx: 60,
      prefabs: [
        // Machines PARQUÉES au cordeau (exemption min-dist : c'est un parc).
        { clusterId: 'cluster_parc_row_terr', count: 1, arrangement: 'center' },
      ],
    },
    {
      id: 'base_vie',
      role: 'base_vie',
      glyph: 'B',
      halfW: 700,
      halfH: 500,
      anchor: { kind: 'near_gate', side: 'east', distPx: 1360 },
      jitterPx: 40,
      prefabs: [{ clusterId: 'cluster_base_vie_terr', count: 1, arrangement: 'center' }],
    },
    {
      id: 'piquets_ne',
      role: 'survey',
      glyph: 'k',
      halfW: 650,
      halfH: 250,
      anchor: { kind: 'east', yFrac: 0.33 },
      jitterPx: 80,
      prefabs: [{ clusterId: 'cluster_survey_row', count: 2, arrangement: 'row' }],
    },
    {
      id: 'stock_terre_se',
      role: 'stockage',
      glyph: 'M',
      halfW: 850,
      halfH: 520,
      anchor: { kind: 'east', yFrac: 0.62 },
      jitterPx: 80,
      prefabs: [{ clusterId: 'scene_stock', count: 2, arrangement: 'row' }],
    },
    {
      id: 'piquets_so',
      role: 'survey',
      glyph: 'k',
      halfW: 520,
      halfH: 230,
      anchor: { kind: 'west', yFrac: 0.72 },
      jitterPx: 80,
      prefabs: [{ clusterId: 'cluster_survey_row', count: 2, arrangement: 'row' }],
    },
  ],
  connect: [
    'fouille_principale',
    'deblais',
    'fouille_secondaire',
    'parc_engins',
    'base_vie',
    'piquets_ne',
    'stock_terre_se',
    'piquets_so',
  ],
  rules: {
    minMachineDistPx: 600,
    spoilAdjacentMaxPx: 400,
    baseVieMaxFromGatePx: 800,
    // La fouille signature étant centrale, la base vie (à l'entrée sud) en reste
    // à bonne distance mais pas 1500 px : 850 suffit à la séparer du danger.
    baseVieMinFromExcavationPx: 850,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// ETAPE 1 — FONDATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contremaitre : la route reste au SUD avec un portail unique. Le coeur du stage
 * est une zone de coulage au centre, autour du spawn : dalle, coffrage,
 * ferraillage, pompe et toupie doivent se lire ensemble. Le stock de ferraillage
 * est a l'ouest, assez proche pour alimenter la dalle sans etre pose au hasard.
 * L'acces toupie arrive du sud-est depuis la route ; la base vie reste au sud,
 * eloignee du beton frais ; une petite reprise beton au sud-ouest reste
 * secondaire. Tout passe par des chemins connectes au portail.
 */
const FONDATIONS: SiteProgram = {
  rationale:
    'Acces sud unique ; coulage principal centre sur le spawn ; toupie et pompe ' +
    'reliees a la dalle ; stock ferraillage ouest ; acces toupie sud-est ; reprise ' +
    'beton secondaire sud-ouest ; base vie au sud hors beton frais.',
  zones: [
    {
      id: 'zone_coulage_principal',
      role: 'travail',
      glyph: 'A',
      halfW: 1180,
      halfH: 780,
      anchor: { kind: 'north', xFrac: 0.5 },
      signature: true,
      prefabs: [
        { clusterId: 'scene_foundation_pour_spawn', count: 1, arrangement: 'anchor_spawn' },
      ],
    },
    {
      id: 'zone_coffrage',
      role: 'travail',
      glyph: 'F',
      halfW: 620,
      halfH: 480,
      anchor: { kind: 'west', yFrac: 0.25 },
      prefabs: [{ clusterId: 'scene_formwork_bay_active', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_semelle',
      role: 'travail',
      glyph: 'M',
      halfW: 660,
      halfH: 500,
      anchor: { kind: 'east', yFrac: 0.26 },
      prefabs: [{ clusterId: 'scene_footing_reinforced', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_dalle',
      role: 'travail',
      glyph: 'D',
      halfW: 660,
      halfH: 500,
      anchor: { kind: 'north', xFrac: 0.28 },
      prefabs: [{ clusterId: 'scene_slab_in_progress', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_acces_beton',
      role: 'parc_engins',
      glyph: 'L',
      halfW: 1000,
      halfH: 760,
      anchor: { kind: 'near_gate', side: 'east', distPx: 2850 },
      prefabs: [{ clusterId: 'scene_mixer_waiting', count: 1, arrangement: 'at_door' }],
    },
    {
      id: 'zone_stock_ferraillage',
      role: 'stockage',
      glyph: 'S',
      halfW: 1100,
      halfH: 700,
      anchor: { kind: 'west', yFrac: 0.42 },
      prefabs: [{ clusterId: 'scene_rebar_stock', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_prepa_secondaire',
      role: 'travail',
      glyph: 'P',
      halfW: 680,
      halfH: 560,
      anchor: { kind: 'near_gate', side: 'west', distPx: 2600 },
      prefabs: [{ clusterId: 'scene_concrete_preparation', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_cure',
      role: 'travail',
      glyph: 'C',
      halfW: 620,
      halfH: 480,
      anchor: { kind: 'north', xFrac: 0.72 },
      prefabs: [{ clusterId: 'scene_curing_zone', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_base_vie',
      role: 'base_vie',
      glyph: 'B',
      halfW: 620,
      halfH: 360,
      anchor: { kind: 'near_gate', side: 'east', distPx: 900 },
      prefabs: [{ clusterId: 'scene_layout_implantation', count: 1, arrangement: 'center' }],
    },
  ],
  connect: [
    'zone_coulage_principal',
    'zone_coffrage',
    'zone_semelle',
    'zone_dalle',
    'zone_acces_beton',
    'zone_stock_ferraillage',
    'zone_prepa_secondaire',
    'zone_cure',
    'zone_base_vie',
  ],
  rules: {
    minMachineDistPx: 600,
    spoilAdjacentMaxPx: 400,
    baseVieMaxFromGatePx: 900,
    baseVieMinFromExcavationPx: 900,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Registre
// ─────────────────────────────────────────────────────────────────────────────

/** Programmes par stage — les stages absents utilisent le layout legacy (transition). */
export const SITE_PROGRAMS: Record<string, SiteProgram> = {
  terrassement: TERRASSEMENT,
  fondations: FONDATIONS,
}
