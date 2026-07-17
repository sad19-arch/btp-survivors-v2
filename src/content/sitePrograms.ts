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
// ÉTAPE 1 — STAGES 05 → 10 (SP-T7)
//
// Ce qui est COMMUN (et le reste) : l'ENTRÉE du chantier. Route au sud, portail
// unique, base vie à l'entrée, parc engins près de la route. Ça ne dépend pas du
// métier — un chantier s'entre toujours pareil — donc c'est factorisé
// (`entranceZones`) : 6 copies manuelles, ce serait 6 occasions de casser C6.
//
// Ce qui est PROPRE À CHAQUE PHASE : la géométrie du TRAVAIL. Elle raconte le
// métier, et elle est donc écrite à la main, phase par phase :
//   · gros œuvre   → UNE grande zone de levage clôturée, la grue tient le centre ;
//   · échafaudages → un ANNEAU de travées autour du bâtiment (ouest + est + nord) ;
//   · charpente    → levage clôturé + un stock en LONGUE bande (les fermes sont longues) ;
//   · second œuvre → BEAUCOUP de petits lots (corps d'état), plus aucune clôture ;
//   · finitions    → peu de zones, petites, du vide autour (le chantier est calme) ;
//   · livraison    → un AXE portail → bâtiment (le parcours de réception).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zones d'ENTRÉE, identiques sur les 6 phases : base vie collée au portail
 * (on s'équipe en arrivant) et parc engins près de la route (livré par
 * porte-char). `baseVieMaxFromGatePx: 900` (C6) borne la première.
 */
function entranceZones(prefix: string): ZoneSpec[] {
  return [
    {
      id: 'zone_base_vie',
      role: 'base_vie',
      glyph: 'B',
      halfW: 620,
      halfH: 360,
      anchor: { kind: 'near_gate', side: 'east', distPx: 900 },
      prefabs: [{ clusterId: 'cluster_base_vie_terr', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_parc_engins',
      role: 'parc_engins',
      glyph: 'P',
      halfW: 680,
      halfH: 560,
      anchor: { kind: 'near_gate', side: 'west', distPx: 2600 },
      prefabs: [{ clusterId: `scene_${prefix}_parc`, count: 1, arrangement: 'center' }],
    },
  ]
}

/** Règles communes aux 6 phases (aucune n'a de déblais ni de fouille). */
const TRADE_RULES: SiteRules = {
  minMachineDistPx: 600,
  spoilAdjacentMaxPx: 400,
  baseVieMaxFromGatePx: 900,
  baseVieMinFromExcavationPx: 900,
}

/**
 * Contremaître (gros œuvre) : la structure SORT DE TERRE, et TOUT tourne autour
 * de la grue à tour. Sa zone est la plus GRANDE du cycle (1250×820) et la seule
 * vraiment clôturée : sous une charge suspendue, on ne passe pas. Les blocs
 * arrivent par la route et se stockent à l'ouest, à portée de flèche ; la grue
 * mobile décharge à l'est. Deux fronts de maçonnerie au nord : le mur avance.
 */
const GROS_OEUVRE: SiteProgram = {
  rationale:
    'Accès sud unique ; UNE grande zone de levage clôturée au centre (grue à tour ' +
    '+ mur qui monte) — la plus vaste du cycle ; fronts de maçonnerie au nord ; ' +
    'stock de blocs à l\'ouest à portée de flèche ; déchargement à l\'est ; base ' +
    'vie à l\'entrée, hors rayon de levage.',
  zones: [
    {
      id: 'zone_levage_principal',
      role: 'travail',
      glyph: 'A',
      halfW: 1250,
      halfH: 820,
      anchor: { kind: 'north', xFrac: 0.5 },
      signature: true,
      fence: { openings: 3 },
      prefabs: [
        { clusterId: 'scene_gros_oeuvre_signature', count: 1, arrangement: 'anchor_spawn' },
        { clusterId: 'scene_gros_oeuvre_stock', count: 1, arrangement: 'scatter' },
      ],
    },
    {
      id: 'zone_maconnerie_ouest',
      role: 'travail',
      glyph: 'T',
      halfW: 660,
      halfH: 520,
      anchor: { kind: 'north', xFrac: 0.26 },
      prefabs: [{ clusterId: 'scene_gros_oeuvre_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_maconnerie_est',
      role: 'travail',
      glyph: 'W',
      halfW: 640,
      halfH: 500,
      anchor: { kind: 'north', xFrac: 0.74 },
      prefabs: [{ clusterId: 'scene_gros_oeuvre_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_stock_blocs',
      role: 'stockage',
      glyph: 'S',
      halfW: 1150,
      halfH: 720,
      anchor: { kind: 'west', yFrac: 0.42 },
      prefabs: [{ clusterId: 'scene_gros_oeuvre_stock', count: 2, arrangement: 'scatter' }],
    },
    {
      id: 'zone_dechargement',
      role: 'parc_engins',
      glyph: 'L',
      halfW: 980,
      halfH: 740,
      anchor: { kind: 'near_gate', side: 'east', distPx: 2850 },
      prefabs: [{ clusterId: 'scene_gros_oeuvre_work', count: 1, arrangement: 'at_door' }],
    },
    {
      id: 'zone_implantation',
      role: 'survey',
      glyph: 'k',
      halfW: 640,
      halfH: 300,
      anchor: { kind: 'east', yFrac: 0.24 },
      prefabs: [{ clusterId: 'cluster_survey_row', count: 2, arrangement: 'row' }],
    },
    ...entranceZones('gros_oeuvre'),
  ],
  connect: [
    'zone_levage_principal',
    'zone_maconnerie_ouest',
    'zone_maconnerie_est',
    'zone_stock_blocs',
    'zone_dechargement',
    'zone_implantation',
    'zone_base_vie',
    'zone_parc_engins',
  ],
  rules: TRADE_RULES,
}

/**
 * Contremaître (échafaudages) : on CEINTURE le bâtiment. C'est la seule phase où
 * le travail fait le TOUR du centre : une travée en montage au centre (clôturée —
 * on travaille en hauteur, rien ne passe dessous) et des travées sur les DEUX
 * flancs + au nord. Le stock de tubes est le plus lourd du chantier : à l'ouest,
 * au plus court. La nacelle monte les monteurs.
 */
const ECHAFAUDAGES: SiteProgram = {
  rationale:
    'Accès sud unique ; travée d\'échafaudage clôturée au centre (travail en ' +
    'hauteur) ; les travées CEINTURENT le bâtiment — flanc ouest, flanc est et ' +
    'nord ; stock de tubes et planchers à l\'ouest, au plus court ; base vie à ' +
    'l\'entrée.',
  zones: [
    {
      id: 'zone_montage_principal',
      role: 'travail',
      glyph: 'A',
      halfW: 980,
      halfH: 680,
      anchor: { kind: 'north', xFrac: 0.5 },
      signature: true,
      fence: { openings: 3 },
      prefabs: [
        { clusterId: 'scene_echafaudages_signature', count: 1, arrangement: 'anchor_spawn' },
        { clusterId: 'scene_echafaudages_stock', count: 1, arrangement: 'scatter' },
      ],
    },
    // L'ANNEAU : deux travées de flanc à la MÊME hauteur que le centre — c'est
    // ce qui fait lire « on ceinture le bâtiment » plutôt que « on travaille au nord ».
    {
      id: 'zone_travee_flanc_ouest',
      role: 'travail',
      glyph: 'T',
      halfW: 520,
      halfH: 620,
      anchor: { kind: 'west', yFrac: 0.5 },
      prefabs: [{ clusterId: 'scene_echafaudages_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_travee_flanc_est',
      role: 'travail',
      glyph: 'W',
      halfW: 520,
      halfH: 620,
      anchor: { kind: 'east', yFrac: 0.5 },
      prefabs: [{ clusterId: 'scene_echafaudages_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_travee_nord',
      role: 'travail',
      glyph: 'N',
      halfW: 700,
      halfH: 420,
      anchor: { kind: 'north', xFrac: 0.5 },
      prefabs: [{ clusterId: 'scene_echafaudages_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_stock_tubes',
      role: 'stockage',
      glyph: 'S',
      halfW: 900,
      halfH: 560,
      anchor: { kind: 'west', yFrac: 0.16 },
      prefabs: [{ clusterId: 'scene_echafaudages_stock', count: 2, arrangement: 'scatter' }],
    },
    {
      id: 'zone_livraison_tubes',
      role: 'parc_engins',
      glyph: 'L',
      halfW: 900,
      halfH: 700,
      anchor: { kind: 'near_gate', side: 'east', distPx: 2850 },
      prefabs: [{ clusterId: 'scene_echafaudages_work', count: 1, arrangement: 'at_door' }],
    },
    ...entranceZones('echafaudages'),
  ],
  connect: [
    'zone_montage_principal',
    'zone_travee_flanc_ouest',
    'zone_travee_flanc_est',
    'zone_travee_nord',
    'zone_stock_tubes',
    'zone_livraison_tubes',
    'zone_base_vie',
    'zone_parc_engins',
  ],
  rules: TRADE_RULES,
}

/**
 * Contremaître (charpente/toiture) : on LÈVE, et on manipule du LONG. Zone de
 * levage clôturée au centre (une ferme au-dessus d'une tête). La signature de
 * cette phase, c'est le stock : une LONGUE bande (1400×380) — on ne stocke pas
 * des bastaings de 8 m en tas carré, on les range en long.
 */
const CHARPENTE_TOITURE: SiteProgram = {
  rationale:
    'Accès sud unique ; zone de levage clôturée au centre (camion-grue + fermes ' +
    'posées) ; poses secondaires au nord ; stock en LONGUE bande à l\'ouest (les ' +
    'fermes et bastaings sont longs, on les range en long) ; déchargement à ' +
    'l\'est ; base vie à l\'entrée, hors zone de levage.',
  zones: [
    {
      id: 'zone_levage_fermes',
      role: 'travail',
      glyph: 'A',
      halfW: 1100,
      halfH: 700,
      anchor: { kind: 'north', xFrac: 0.5 },
      signature: true,
      fence: { openings: 3 },
      prefabs: [
        { clusterId: 'scene_charpente_signature', count: 1, arrangement: 'anchor_spawn' },
        { clusterId: 'scene_charpente_stock', count: 1, arrangement: 'scatter' },
      ],
    },
    {
      id: 'zone_pose_ouest',
      role: 'travail',
      glyph: 'T',
      halfW: 620,
      halfH: 480,
      anchor: { kind: 'north', xFrac: 0.24 },
      prefabs: [{ clusterId: 'scene_charpente_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_pose_est',
      role: 'travail',
      glyph: 'W',
      halfW: 620,
      halfH: 480,
      anchor: { kind: 'north', xFrac: 0.76 },
      prefabs: [{ clusterId: 'scene_charpente_work', count: 1, arrangement: 'center' }],
    },
    // LA signature géométrique de la phase : le stock est une bande, pas un carré.
    {
      id: 'zone_stock_tuiles',
      role: 'stockage',
      glyph: 'S',
      halfW: 1400,
      halfH: 380,
      anchor: { kind: 'west', yFrac: 0.34 },
      prefabs: [{ clusterId: 'scene_charpente_stock', count: 3, arrangement: 'row' }],
    },
    {
      id: 'zone_stock_bastaings',
      role: 'stockage',
      glyph: 's',
      halfW: 1400,
      halfH: 340,
      anchor: { kind: 'west', yFrac: 0.56 },
      prefabs: [{ clusterId: 'scene_charpente_stock', count: 3, arrangement: 'row' }],
    },
    {
      id: 'zone_dechargement_charpente',
      role: 'parc_engins',
      glyph: 'L',
      halfW: 940,
      halfH: 720,
      anchor: { kind: 'near_gate', side: 'east', distPx: 2850 },
      prefabs: [{ clusterId: 'scene_charpente_work', count: 1, arrangement: 'at_door' }],
    },
    ...entranceZones('charpente'),
  ],
  connect: [
    'zone_levage_fermes',
    'zone_pose_ouest',
    'zone_pose_est',
    'zone_stock_tuiles',
    'zone_stock_bastaings',
    'zone_dechargement_charpente',
    'zone_base_vie',
    'zone_parc_engins',
  ],
  rules: TRADE_RULES,
}

/**
 * Contremaître (second œuvre) : le clos-couvert est fait, LES CLÔTURES TOMBENT.
 * Plus une seule zone clôturée : on travaille à l'intérieur. Et le chantier se
 * FRAGMENTE — ce n'est plus un grand front, c'est une fourmilière de corps
 * d'état qui se marchent dessus : SIX petits lots (électricité, plomberie,
 * cloisons, gaines…) au lieu de deux grands. C'est la phase la plus morcelée du
 * cycle, et le plan doit le montrer.
 */
const SECOND_OEUVRE: SiteProgram = {
  rationale:
    'Accès sud unique ; le bâtiment est clos-couvert donc AUCUNE zone clôturée ' +
    '(on travaille à l\'intérieur) ; le chantier se FRAGMENTE en petits lots de ' +
    'corps d\'état (électricité, plomberie, cloisons) au lieu de grands fronts ; ' +
    'stock de plaques et gaines à l\'ouest ; fourgons à l\'est ; base vie à l\'entrée.',
  zones: [
    {
      id: 'zone_cloisonnement',
      role: 'travail',
      glyph: 'A',
      halfW: 900,
      halfH: 620,
      anchor: { kind: 'north', xFrac: 0.5 },
      signature: true,
      prefabs: [
        { clusterId: 'scene_second_oeuvre_signature', count: 1, arrangement: 'anchor_spawn' },
        { clusterId: 'scene_second_oeuvre_stock', count: 1, arrangement: 'scatter' },
      ],
    },
    // La FRAGMENTATION : 4 petits lots au lieu de 2 grands fronts.
    {
      id: 'zone_lot_electricite',
      role: 'travail',
      glyph: 'E',
      halfW: 440,
      halfH: 380,
      anchor: { kind: 'north', xFrac: 0.22 },
      prefabs: [{ clusterId: 'scene_second_oeuvre_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_lot_plomberie',
      role: 'travail',
      glyph: 'W',
      halfW: 440,
      halfH: 380,
      anchor: { kind: 'north', xFrac: 0.46 },
      prefabs: [{ clusterId: 'scene_second_oeuvre_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_lot_gaines',
      // 'D' (ducts) et non 'G' : le plan ASCII réserve 'G' au PORTAIL.
      role: 'travail',
      glyph: 'D',
      halfW: 440,
      halfH: 380,
      anchor: { kind: 'north', xFrac: 0.7 },
      prefabs: [{ clusterId: 'scene_second_oeuvre_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_lot_menuiserie',
      role: 'travail',
      glyph: 'M',
      halfW: 460,
      halfH: 420,
      anchor: { kind: 'east', yFrac: 0.44 },
      prefabs: [{ clusterId: 'scene_second_oeuvre_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_stock_plaques',
      role: 'stockage',
      glyph: 'S',
      halfW: 1000,
      halfH: 640,
      anchor: { kind: 'west', yFrac: 0.4 },
      prefabs: [{ clusterId: 'scene_second_oeuvre_stock', count: 2, arrangement: 'scatter' }],
    },
    {
      id: 'zone_fourgons',
      role: 'parc_engins',
      glyph: 'L',
      halfW: 900,
      halfH: 700,
      anchor: { kind: 'near_gate', side: 'east', distPx: 2850 },
      prefabs: [{ clusterId: 'scene_second_oeuvre_work', count: 1, arrangement: 'at_door' }],
    },
    ...entranceZones('second_oeuvre'),
  ],
  connect: [
    'zone_cloisonnement',
    'zone_lot_electricite',
    'zone_lot_plomberie',
    'zone_lot_gaines',
    'zone_lot_menuiserie',
    'zone_stock_plaques',
    'zone_fourgons',
    'zone_base_vie',
    'zone_parc_engins',
  ],
  rules: TRADE_RULES,
}

/**
 * Contremaître (finitions) : plus une clôture, plus un engin lourd, et SURTOUT
 * plus grand-chose sur le terrain. Le chantier est PROPRE et presque vide : la
 * pièce témoin au centre, deux ateliers, un stock. C'est la phase la plus calme
 * du cycle — le plan doit respirer, pas se remplir.
 */
const FINITIONS: SiteProgram = {
  rationale:
    'Accès sud unique ; aucune clôture ni engin lourd (chantier propre) ; pièce ' +
    'témoin finie au centre alimentée par le poste de peinture ; deux ateliers ' +
    'seulement ; beaucoup de vide — c\'est la phase la plus calme du cycle et ça ' +
    'doit se voir ; base vie à l\'entrée.',
  zones: [
    {
      id: 'zone_piece_temoin',
      role: 'travail',
      glyph: 'A',
      halfW: 900,
      halfH: 600,
      anchor: { kind: 'north', xFrac: 0.5 },
      signature: true,
      prefabs: [
        { clusterId: 'scene_finitions_signature', count: 1, arrangement: 'anchor_spawn' },
        { clusterId: 'scene_finitions_stock', count: 1, arrangement: 'scatter' },
      ],
    },
    {
      id: 'zone_atelier_peinture',
      role: 'travail',
      glyph: 'T',
      halfW: 560,
      halfH: 440,
      anchor: { kind: 'north', xFrac: 0.28 },
      prefabs: [{ clusterId: 'scene_finitions_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_atelier_carrelage',
      role: 'travail',
      glyph: 'W',
      halfW: 560,
      halfH: 440,
      anchor: { kind: 'north', xFrac: 0.72 },
      prefabs: [{ clusterId: 'scene_finitions_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_stock_finitions',
      role: 'stockage',
      glyph: 'S',
      halfW: 820,
      halfH: 520,
      anchor: { kind: 'west', yFrac: 0.42 },
      prefabs: [{ clusterId: 'scene_finitions_stock', count: 2, arrangement: 'scatter' }],
    },
    {
      id: 'zone_livraison_finitions',
      role: 'parc_engins',
      glyph: 'L',
      halfW: 820,
      halfH: 620,
      anchor: { kind: 'near_gate', side: 'east', distPx: 2850 },
      prefabs: [{ clusterId: 'scene_finitions_work', count: 1, arrangement: 'at_door' }],
    },
    ...entranceZones('finitions'),
  ],
  connect: [
    'zone_piece_temoin',
    'zone_atelier_peinture',
    'zone_atelier_carrelage',
    'zone_stock_finitions',
    'zone_livraison_finitions',
    'zone_base_vie',
    'zone_parc_engins',
  ],
  rules: TRADE_RULES,
}

/**
 * Contremaître (livraison/audit) : le bâtiment est LIVRÉ. Il est au centre, nu,
 * sans clôture — c'est la récompense du cycle, on doit pouvoir en faire le tour.
 * La géométrie de cette phase, c'est un AXE : portail → réception → bâtiment.
 * Le visiteur entre et marche droit dessus. Le balisage, lui, se REMBALLE.
 */
const LIVRAISON_AUDIT: SiteProgram = {
  rationale:
    'Accès sud unique ; le bâtiment livré au centre, SANS clôture (on en fait le ' +
    'tour) ; un AXE portail → réception → bâtiment (le parcours du visiteur) ; ' +
    'points de contrôle au nord ; balisage remballé au stock ouest ; fourgons ' +
    'd\'inspection à l\'est ; base vie à l\'entrée, dernière à partir.',
  zones: [
    {
      id: 'zone_batiment_livre',
      role: 'travail',
      glyph: 'A',
      halfW: 950,
      halfH: 640,
      anchor: { kind: 'north', xFrac: 0.5 },
      signature: true,
      prefabs: [
        { clusterId: 'scene_livraison_signature', count: 1, arrangement: 'anchor_spawn' },
        { clusterId: 'scene_livraison_stock', count: 1, arrangement: 'scatter' },
      ],
    },
    // L'AXE : la réception est posée SUR l'épine, entre le portail et le
    // bâtiment. C'est le seul stage où une zone s'intercale sur le chemin
    // d'entrée — le visiteur la traverse avant de voir l'ouvrage.
    {
      id: 'zone_reception',
      // 'V' (visiteurs) et non 'R' : le plan ASCII réserve 'R' à la ROUTE.
      role: 'travail',
      glyph: 'V',
      halfW: 620,
      halfH: 420,
      anchor: { kind: 'adjacent', to: 'zone_batiment_livre', side: 'south', gapPx: 620 },
      prefabs: [{ clusterId: 'scene_livraison_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_controle_ouest',
      role: 'travail',
      glyph: 'T',
      halfW: 580,
      halfH: 460,
      anchor: { kind: 'north', xFrac: 0.26 },
      prefabs: [{ clusterId: 'scene_livraison_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_controle_est',
      role: 'travail',
      glyph: 'W',
      halfW: 580,
      halfH: 460,
      anchor: { kind: 'north', xFrac: 0.74 },
      prefabs: [{ clusterId: 'scene_livraison_work', count: 1, arrangement: 'center' }],
    },
    {
      id: 'zone_remballage',
      role: 'stockage',
      glyph: 'S',
      halfW: 900,
      halfH: 600,
      anchor: { kind: 'west', yFrac: 0.4 },
      prefabs: [{ clusterId: 'scene_livraison_stock', count: 2, arrangement: 'scatter' }],
    },
    {
      id: 'zone_inspection',
      role: 'parc_engins',
      glyph: 'L',
      halfW: 880,
      halfH: 660,
      anchor: { kind: 'near_gate', side: 'east', distPx: 2850 },
      prefabs: [{ clusterId: 'scene_livraison_work', count: 1, arrangement: 'at_door' }],
    },
    ...entranceZones('livraison'),
  ],
  connect: [
    'zone_batiment_livre',
    'zone_reception',
    'zone_controle_ouest',
    'zone_controle_est',
    'zone_remballage',
    'zone_inspection',
    'zone_base_vie',
    'zone_parc_engins',
  ],
  rules: TRADE_RULES,
}

// ─────────────────────────────────────────────────────────────────────────────
// Registre
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Programmes par stage — les stages absents utilisent le layout legacy (transition).
 *
 * ⚠️ DEUX ABSENCES SONT DES DÉCISIONS, PAS DES OUBLIS (cf. rapport SP-T7) :
 *
 * · `terrain_vierge` — c'est le stage de `sim:check` (MVP) ET le témoin « stage
 *   sans programme » de `tests/unit/keepSitePlan.test.ts`. Lui donner un
 *   programme change le jeu de référence ET force à réécrire le test de
 *   non-régression du bug `keepSitePlan`. Sémantiquement, la phase 1 du cycle
 *   est l'INSTALLATION (algeco, rubalise, piquets) : elle n'a ni zone de
 *   travail, ni engin, ni corridor — un programme la contredirait.
 *
 * · `reseaux_enterres` — il a DÉJÀ son système : `render/scenes/siteStructures.ts`
 *   y streame un réseau ORGANIQUE de tranchées (nœuds jitterés, tuyaux posés
 *   dedans, regards/jonctions, mini-pelle au front) sur tout le monde. Ajouter
 *   un `SiteProgram` ferait tourner DEUX systèmes de placement ignorants l'un de
 *   l'autre sur le même stage — exactement le piège déjà payé sur les PNJ
 *   (ambient + siteWorkers). Un stage = UN système de plan.
 */
export const SITE_PROGRAMS: Record<string, SiteProgram> = {
  terrassement: TERRASSEMENT,
  fondations: FONDATIONS,
  gros_oeuvre: GROS_OEUVRE,
  echafaudages: ECHAFAUDAGES,
  charpente_toiture: CHARPENTE_TOITURE,
  second_oeuvre: SECOND_OEUVRE,
  finitions: FINITIONS,
  livraison_audit: LIVRAISON_AUDIT,
}
