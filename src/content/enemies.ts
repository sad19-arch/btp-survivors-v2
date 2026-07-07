/**
 * Roster d'ennemis (data-driven). Thème : bureaucratie / chantier.
 *
 * Slice 1 : roster minimal. Les archétypes alimentent les pools de phases.
 */

import type { EnemyBehavior } from '@core/types'

export type EnemyArchetype = 'base' | 'fast' | 'tank' | 'elite'

export interface EnemyDef {
  id: string
  name: string
  hp: number
  speed: number // px/seconde
  contactDamage: number
  archetype: EnemyArchetype
  /** XP lâchée à la mort. */
  xpValue: number
  /** Comportement d'IA. Si absent, 'chase' est utilisé par défaut au spawn. */
  behavior?: EnemyBehavior
}

/**
 * Roster (PRD) : 3 rôles lisibles, STATS PARTAGÉES par archétype (source unique
 * → tuning en un seul endroit ; les 24 re-skins de stage héritent des mêmes stats).
 *
 * Équilibrage « tendu mais gagnable » (refonte playtest) :
 *  - `fast` va aussi vite que le joueur (200) → on ne peut plus tout distancer,
 *    il faut louvoyer et on ENCAISSE ⇒ le kite gratuit est cassé.
 *  - `base` moins lent qu'avant, `tank` moins escargot ; dégâts de contact revus
 *    à la hausse (contact = vraie menace). Les stats montent aussi avec le temps
 *    (voir `difficultyScaleAt` dans spawnRamp) → la fin de run devient un mur.
 */
type EnemyStats = Omit<EnemyDef, 'id' | 'name'>
const BASE: EnemyStats = { hp: 18, speed: 150, contactDamage: 6, archetype: 'base', xpValue: 5 }
const FAST: EnemyStats = { hp: 11, speed: 210, contactDamage: 5, archetype: 'fast', xpValue: 4 }
const TANK: EnemyStats = { hp: 60, speed: 96, contactDamage: 11, archetype: 'tank', xpValue: 12 }
const mk = (id: string, name: string, stats: EnemyStats): EnemyDef => ({ id, name, ...stats })

export const ENEMIES: Record<string, EnemyDef> = {
  // Stage 01 — terrain vierge
  paperasse: mk('paperasse', 'Paperasse', BASE),
  inspecteur: mk('inspecteur', 'Inspecteur', FAST),
  huissier: mk('huissier', 'Huissier', TANK),
  // 02 terrassement
  boueux: mk('boueux', 'Boueux', BASE),
  foreur: mk('foreur', 'Foreur', FAST),
  rocheux: mk('rocheux', 'Rocheux', TANK),
  // 03 fondations
  gachee: mk('gachee', 'Gâchée', BASE),
  ferrailleur: mk('ferrailleur', 'Ferrailleur', FAST),
  massif: mk('massif', 'Massif', TANK),
  // 04 réseaux enterrés
  gaine: mk('gaine', 'Gaine', BASE),
  fileur: mk('fileur', 'Fileur', FAST),
  collecteur: mk('collecteur', 'Collecteur', TANK),
  // 05 gros œuvre
  parpaing: mk('parpaing', 'Parpaing', BASE),
  truelle: mk('truelle', 'Truelle', FAST),
  banche: mk('banche', 'Banche', TANK),
  // 06 échafaudages
  boulon: mk('boulon', 'Boulon', BASE),
  grimpeur: mk('grimpeur', 'Grimpeur', FAST),
  pylone: mk('pylone', 'Pylône', TANK),
  // 07 charpente / toiture
  copeau: mk('copeau', 'Copeau', BASE),
  chevron: mk('chevron', 'Chevron', FAST),
  poutre: mk('poutre', 'Poutre', TANK),
  // 08 second œuvre
  platras: mk('platras', 'Plâtras', BASE),
  gainard: mk('gainard', 'Gainard', FAST),
  cloison: mk('cloison', 'Cloison', TANK),
  // 09 finitions
  goutte: mk('goutte', 'Goutte', BASE),
  pinceau: mk('pinceau', 'Pinceau', FAST),
  pot: mk('pot', 'Pot de peinture', TANK),
  // 10 livraison / audit
  formulaire: mk('formulaire', 'Formulaire', BASE),
  auditeur: mk('auditeur', 'Auditeur', FAST),
  commission: mk('commission', 'Commission', TANK),
  // Boss de fin (invoqué par le directeur temporel ~5:00). Le vaincre = victoire.
  // Non affecté par le scaling temporel (stats propres, tunées séparément).
  contremaitre: {
    id: 'contremaitre',
    name: 'Contremaître',
    hp: 1800,
    speed: 215, // > joueur (200) : rattrape et reste au contact → vrai combat de climax
    contactDamage: 22,
    archetype: 'elite',
    xpValue: 80
  }
}

/**
 * Paramètres de tuning pour les comportements d'ennemis.
 * Importé par les fonctions de steering dans `src/core/systems/enemyAi.ts`.
 */
export const BEHAVIOR_TUNING = {
  zigzag: {
    /** Amplitude de l'oscillation perpendiculaire (ratio de la vitesse). */
    amp: 0.65,
    /** Fréquence angulaire (rad/s). 1.3 Hz ≈ oscillation rapide visible. */
    omega: 2.0 * Math.PI * 1.3,
  },
  circler: {
    /** Rayon de l'anneau orbital autour du joueur (px). */
    orbitR: 90,
    /** Vitesse angulaire de rotation sur l'anneau (rad/s). */
    rotSpeed: 0.35,
  },
} as const

/** Id du mini-boss MVP. */
export const MINI_BOSS_ID = 'contremaitre'

/** Liste des ids d'ennemis connus. */
export const ENEMY_IDS: readonly string[] = Object.keys(ENEMIES)
