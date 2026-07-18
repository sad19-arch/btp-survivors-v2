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
// Retour playtest : le jeu est trop facile hors boss/mini-boss → PV des 3 archétypes
// de base ×1.5 (flat, demande explicite ; pas de re-tuning sim:check — le user teste
// lui-même). Boss/mini-boss (définitions séparées, hors ce fichier) non touchés.
const BASE: EnemyStats = { hp: 27, speed: 150, contactDamage: 6, archetype: 'base', xpValue: 5 }
const FAST: EnemyStats = { hp: 16.5, speed: 210, contactDamage: 5, archetype: 'fast', xpValue: 4 }
const TANK: EnemyStats = { hp: 90, speed: 96, contactDamage: 11, archetype: 'tank', xpValue: 12 }
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
  // Élite « porteur de coffre » (générique, réutilisé tous stages). N'apparaît PAS
  // dans les pools de phase : invoqué uniquement par le directeur de coffres
  // (`tickChestBearer`) sur cadence. Costaud (~5× tank) et lent → mini-objectif « tue-moi
  // pour libérer le coffre ». `archetype:'elite'` ⇒ aura argentée + dégâts orange.
  // Sa mort lâche un coffre GARANTI (marqué `chestBearer` au spawn). PV mis à l'échelle
  // temporelle comme une vague (reste pertinent en fin de run).
  convoyeur: {
    id: 'convoyeur',
    name: 'Convoyeur',
    hp: 300,
    speed: 108, // < joueur (200) : kitable en le mitraillant
    contactDamage: 16,
    archetype: 'elite',
    xpValue: 45,
    behavior: 'chase'
  },
  // Boss de fin (invoqué par le directeur temporel ~5:00). Le vaincre = victoire.
  // Non affecté par le scaling temporel (stats propres, tunées séparément).
  contremaitre: {
    id: 'contremaitre',
    name: 'Contremaître',
    hp: 1800,
    speed: 170, // < joueur (200) : ESQUIVABLE ; la pression vient des charges télégraphiées (behavior 'boss')
    contactDamage: 22,
    archetype: 'elite',
    xpValue: 80,
    behavior: 'boss' // machine à états : chase lent → télégraphe → charge (steerBoss) + invocations/enrage (bossSystem)
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
  charger: {
    /** Durée de la phase d'approche (ms) avant de télégraphier. */
    approachMs: 1400,
    /** Durée du télégraphe (quasi-arrêt, mémorisation de la direction) (ms). */
    telegraphMs: 300,
    /** Durée du dash (ms). */
    dashMs: 450,
    /** Multiplicateur de vitesse pendant le dash. */
    dashMult: 2.6,
    /** Durée de la récupération après le dash (ms). */
    recoverMs: 700,
    /** Multiplicateur de vitesse pendant la récupération. */
    recoverMult: 0.45,
  },
  /** Boss « mini-événement » : chase lent + charges télégraphiées + invocation d'add + enrage. */
  boss: {
    /** Délai entre deux charges (ms). */
    chargeCooldownMs: 3200,
    /** Durée du télégraphe avant la charge (quasi-arrêt, mémorise la direction) (ms). */
    chargeTelegraphMs: 650,
    /** Durée de la charge/dash (ms). */
    chargeMs: 500,
    /** Multiplicateur de vitesse pendant la charge (rattrape brièvement le joueur). */
    chargeMult: 3.2,
    /** Seuils de PV (fraction du max) déclenchant une invocation d'add. */
    summonAtHpPct: [0.75, 0.5, 0.25] as readonly number[],
    /** Nombre d'add invoqués à chaque seuil franchi. */
    summonCount: 4,
    /** Rayon (px) autour du boss où apparaissent les add invoqués (à l'écran, autour de lui). */
    summonRadius: 260,
    /** Fraction de PV sous laquelle le boss enrage. */
    enrageHpPct: 0.30,
    /** Multiplicateur de vitesse en enrage. */
    enrageSpeedMult: 1.35,
    /** Multiplicateur du cooldown de charge en enrage (<1 = charges plus fréquentes). */
    enrageChargeCooldownMult: 0.6,
  },
} as const

/** Id du mini-boss MVP. */
export const MINI_BOSS_ID = 'contremaitre'

/** Liste des ids d'ennemis connus. */
export const ENEMY_IDS: readonly string[] = Object.keys(ENEMIES)
