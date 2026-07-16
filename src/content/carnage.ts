/**
 * MODE CARNAGE — données et sélecteurs PURS.
 *
 * Le mode est un secret arcade (code Konami au titre) : chaque ennemi tué laisse
 * une projection immédiate et une flaque persistante. C'est du **spectacle**, pas
 * de l'équilibrage — rien ici n'est lu par la simulation.
 *
 * Module PUR : aucun `Math.random`, aucun `Date.now`, aucun Phaser/DOM. Les tirages
 * sont fournis par l'appelant (`roll` dans [0,1)), comme `deathQuotes`/`victoryQuotes`.
 * Le rendu, lui, a le droit à `Math.random` (précédent `vfxManager`).
 */

/** Gabarit d'ennemi, dérivé au rendu (la sim n'a AUCUNE notion de taille). */
export type CarnageSize = 'small' | 'medium' | 'large' | 'boss'

/** Forme de la projection au moment de la mort. */
export type SplatterKind = 'short' | 'long' | 'radial'

/** Clés d'assets des flaques (2 variantes par gabarit — brief §14). */
export const POOL_KEYS: Readonly<Record<CarnageSize, readonly string[]>> = {
  small: ['blood_pool_small_01', 'blood_pool_small_02'],
  medium: ['blood_pool_medium_01', 'blood_pool_medium_02'],
  large: ['blood_pool_large_01', 'blood_pool_large_02'],
  boss: ['blood_pool_boss_01', 'blood_pool_boss_02']
}

/** Clés d'assets des projections. */
export const SPLATTER_KEYS: Readonly<Record<SplatterKind, readonly string[]>> = {
  short: ['blood_splatter_short_01', 'blood_splatter_short_02'],
  long: ['blood_splatter_long_01', 'blood_splatter_long_02'],
  radial: ['blood_splatter_radial_01', 'blood_splatter_radial_02']
}

/** Gouttes secondaires (brief §9.1) — cassent la forme trop propre d'une flaque. */
export const DROP_CLUSTER_KEYS: readonly string[] = [
  'blood_drop_cluster_01',
  'blood_drop_cluster_02',
  'blood_drop_cluster_03'
]

/**
 * Arme → forme de projection (brief §7).
 *
 * Table VOLONTAIREMENT partielle : tout ce qui n'y figure pas retombe sur `short`.
 * Le brief est explicite — « il ne faut pas créer une mécanique différente pour
 * chaque arme si une simple variation d'effet suffit ». Les ids sont ceux de
 * `src/content/weapons.ts` (armes de base ET évoluées).
 */
const WEAPON_SPLATTER: Readonly<Record<string, SplatterKind>> = {
  // Scie : coup très directionnel → longue traînée.
  scie: 'long',
  // Projectiles lourds → traînée dans le sens de l'impact.
  cloueur: 'long',
  mitrailleuse_clous: 'long',
  brouette: 'long',
  transpalette: 'long',
  // Zone / explosion / percussion → gerbe radiale.
  marteau: 'radial',
  marteau_piqueur: 'radial',
  air_comprime: 'radial',
  goudron: 'radial',
  coulee_bitume: 'radial',
  chalumeau: 'radial',
  lance_thermique: 'radial',
  tempete_boulons: 'radial'
}

/**
 * Choisit la forme de projection.
 *
 * Un gabarit `large`/`boss` force le radial quelle que soit l'arme : le brief §4.2
 * associe la gerbe radiale au poids de l'ennemi autant qu'au type de coup.
 */
export function splatterFor(weapon: string | undefined, size: CarnageSize, critical = false): SplatterKind {
  if (size === 'boss' || size === 'large' || critical) {
    return 'radial'
  }
  return (weapon !== undefined ? WEAPON_SPLATTER[weapon] : undefined) ?? 'short'
}

/** Indexe un pool par un roll [0,1), borné aux extrémités (roll=1 → dernier). */
function pick(pool: readonly string[], roll: number): string {
  const n = pool.length
  if (n === 0) {
    return ''
  }
  const i = Math.min(n - 1, Math.max(0, Math.floor(roll * n)))
  return pool[i] ?? ''
}

/** Variante de flaque pour un gabarit. */
export function poolKey(size: CarnageSize, roll: number): string {
  return pick(POOL_KEYS[size], roll)
}

/** Variante de projection pour une forme. */
export function splatterKey(kind: SplatterKind, roll: number): string {
  return pick(SPLATTER_KEYS[kind], roll)
}

/** Variante de gouttes secondaires. */
export function dropClusterKey(roll: number): string {
  return pick(DROP_CLUSTER_KEYS, roll)
}

/** Réglages de rendu et de performance. */
export const CARNAGE = {
  /**
   * Plafond de flaques VIVANTES. Au-delà, la plus ancienne s'efface (FIFO) — jamais
   * de purge en masse (brief §13). Ordres de grandeur du brief, à re-mesurer sur
   * vrai device : le mobile est une cible perf requise, pas un bonus.
   */
  maxPoolsDesktop: 320,
  maxPoolsMobile: 140,
  /** Flaques posées au plus par frame : une vague tue en paquet. */
  maxPoolsPerFrame: 6,
  /** Projections (plus coûteuses) au plus par frame ; au-delà, la flaque reste, la gerbe saute. */
  maxSplattersPerFrame: 3,
  /** Proportion de morts « critiques » (brief §8 : 3 à 5 %). */
  criticalChance: 0.04,
  /** Multiplicateur d'échelle d'une flaque critique (brief §8 : ~×2). */
  criticalScale: 2,
  /** Échelle de base par gabarit (l'asset fait déjà la moitié du travail). */
  scaleBySize: { small: 0.5, medium: 0.75, large: 1.05, boss: 1.7 } as Readonly<Record<CarnageSize, number>>,
  /** Amplitude de la variation aléatoire d'échelle, en fraction (brief §6). */
  scaleJitter: 0.18,
  /** Opacité d'une flaque, et son jitter (brief §6 : éviter le jeton rouge identique). */
  poolAlpha: 0.9,
  alphaJitter: 0.12,
  /** Durée de vie d'une projection (courte : c'est un accent d'impact). */
  splatterMs: 260,
  /** Fondu d'une flaque évincée par le FIFO. */
  evictFadeMs: 700,
  /** Gouttes secondaires autour des gros gabarits (brief §9.1). */
  dropClusterCount: { large: 2, boss: 5 } as Readonly<Record<'large' | 'boss', number>>
} as const

/** Sous-phrases d'activation (brief §3.2). */
export const CARNAGE_ON_QUOTES: readonly string[] = [
  'La propreté du chantier vient d’être annulée.',
  'Le registre sécurité a quitté la partie.',
  'Le nettoyage sera facturé en supplément.',
  'Le chef de chantier ne veut rien savoir.',
  'La moquette rouge est désormais comprise.'
]

/** Textes arcade des morts critiques (brief §8) — très courts, rares. */
export const CRITICAL_TEXTS: readonly string[] = [
  'DOSSIER CLASSÉ',
  'INCIDENT CLOS',
  'CONTRAT RÉSILIÉ',
  'VALIDATION DÉFINITIVE',
  'DÉLAI RESPECTÉ',
  'PROPRE',
  'FIN DE MISSION'
]

/** Sous-phrase d'activation, déterministe pour un roll donné. */
export function selectCarnageOnQuote({ roll }: { roll: number }): string {
  return pick(CARNAGE_ON_QUOTES, roll)
}

/** Texte de mort critique, déterministe pour un roll donné. */
export function selectCriticalText({ roll }: { roll: number }): string {
  return pick(CRITICAL_TEXTS, roll)
}

/**
 * Surface « repeinte » estimée, en m² (brief §12 — humoristique, pas physique).
 *
 * Une flaque moyenne couvre grosso modo un mètre carré de chantier ; on pondère par
 * le gabarit. Le chiffre n'a pas à être juste, il a à être drôle et croissant.
 */
export function paintedSurfaceM2(counts: Readonly<Record<CarnageSize, number>>): number {
  const w: Record<CarnageSize, number> = { small: 0.4, medium: 1, large: 2.2, boss: 6 }
  const total = (Object.keys(w) as CarnageSize[]).reduce((sum, k) => sum + counts[k] * w[k], 0)
  return Math.round(total * 10) / 10
}
