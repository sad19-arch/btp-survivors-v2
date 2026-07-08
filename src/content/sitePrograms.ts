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
      halfW: 2400,
      halfH: 1150,
      anchor: { kind: 'north', xFrac: 0.5 },
      fence: { openings: 1 },
      jitterPx: 120,
    },
    {
      id: 'deblais',
      role: 'spoil',
      glyph: 'S',
      halfW: 900,
      halfH: 900,
      anchor: { kind: 'adjacent', to: 'fouille_principale', side: 'east', gapPx: 350 },
      jitterPx: 80,
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
    },
    {
      id: 'parc_engins',
      role: 'parc_engins',
      glyph: 'P',
      halfW: 850,
      halfH: 550,
      anchor: { kind: 'near_gate', side: 'west', distPx: 2600 },
      jitterPx: 60,
    },
    {
      id: 'base_vie',
      role: 'base_vie',
      glyph: 'B',
      halfW: 700,
      halfH: 500,
      anchor: { kind: 'near_gate', side: 'east', distPx: 1360 },
      jitterPx: 40,
    },
    {
      id: 'piquets_ne',
      role: 'survey',
      glyph: 'k',
      halfW: 650,
      halfH: 250,
      anchor: { kind: 'east', yFrac: 0.33 },
      jitterPx: 80,
    },
  ],
  connect: ['fouille_principale', 'deblais', 'fouille_secondaire', 'parc_engins', 'base_vie', 'piquets_ne'],
  rules: {
    minMachineDistPx: 600,
    spoilAdjacentMaxPx: 400,
    baseVieMaxFromGatePx: 800,
    baseVieMinFromExcavationPx: 1500,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Registre
// ─────────────────────────────────────────────────────────────────────────────

/** Programmes par stage — les stages absents utilisent le layout legacy (transition). */
export const SITE_PROGRAMS: Record<string, SiteProgram> = {
  terrassement: TERRASSEMENT,
}
