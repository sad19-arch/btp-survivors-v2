/**
 * Roster d'ennemis (data-driven). Thème : bureaucratie / chantier.
 *
 * Slice 1 : roster minimal. Les archétypes alimentent les pools de phases.
 */

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
}

/**
 * Roster MVP (PRD) : 3 rôles lisibles.
 *  - `inspecteur` = petit rapide   (fast)
 *  - `paperasse`  = moyen standard (base)
 *  - `huissier`   = gros lent      (tank)
 */
export const ENEMIES: Record<string, EnemyDef> = {
  paperasse: { id: 'paperasse', name: 'Paperasse', hp: 12, speed: 90, contactDamage: 5, archetype: 'base', xpValue: 5 },
  inspecteur: { id: 'inspecteur', name: 'Inspecteur', hp: 9, speed: 150, contactDamage: 4, archetype: 'fast', xpValue: 4 },
  huissier: { id: 'huissier', name: 'Huissier', hp: 40, speed: 58, contactDamage: 8, archetype: 'tank', xpValue: 12 },
  // Stage 02 (terrassement) — mêmes STATS que le stage 01 (équilibrage préservé),
  // seul le thème/skin change. base/fast/tank ↔ paperasse/inspecteur/huissier.
  boueux: { id: 'boueux', name: 'Boueux', hp: 12, speed: 90, contactDamage: 5, archetype: 'base', xpValue: 5 },
  foreur: { id: 'foreur', name: 'Foreur', hp: 9, speed: 150, contactDamage: 4, archetype: 'fast', xpValue: 4 },
  rocheux: { id: 'rocheux', name: 'Rocheux', hp: 40, speed: 58, contactDamage: 8, archetype: 'tank', xpValue: 12 },
  // Stages 03-10 : re-skins par phase, STATS IDENTIQUES aux archétypes stage 01
  // (base=paperasse, fast=inspecteur, tank=huissier) → équilibrage préservé.
  // 03 fondations
  gachee: { id: 'gachee', name: 'Gâchée', hp: 12, speed: 90, contactDamage: 5, archetype: 'base', xpValue: 5 },
  ferrailleur: { id: 'ferrailleur', name: 'Ferrailleur', hp: 9, speed: 150, contactDamage: 4, archetype: 'fast', xpValue: 4 },
  massif: { id: 'massif', name: 'Massif', hp: 40, speed: 58, contactDamage: 8, archetype: 'tank', xpValue: 12 },
  // 04 réseaux enterrés
  gaine: { id: 'gaine', name: 'Gaine', hp: 12, speed: 90, contactDamage: 5, archetype: 'base', xpValue: 5 },
  fileur: { id: 'fileur', name: 'Fileur', hp: 9, speed: 150, contactDamage: 4, archetype: 'fast', xpValue: 4 },
  collecteur: { id: 'collecteur', name: 'Collecteur', hp: 40, speed: 58, contactDamage: 8, archetype: 'tank', xpValue: 12 },
  // 05 gros œuvre
  parpaing: { id: 'parpaing', name: 'Parpaing', hp: 12, speed: 90, contactDamage: 5, archetype: 'base', xpValue: 5 },
  truelle: { id: 'truelle', name: 'Truelle', hp: 9, speed: 150, contactDamage: 4, archetype: 'fast', xpValue: 4 },
  banche: { id: 'banche', name: 'Banche', hp: 40, speed: 58, contactDamage: 8, archetype: 'tank', xpValue: 12 },
  // 06 échafaudages
  boulon: { id: 'boulon', name: 'Boulon', hp: 12, speed: 90, contactDamage: 5, archetype: 'base', xpValue: 5 },
  grimpeur: { id: 'grimpeur', name: 'Grimpeur', hp: 9, speed: 150, contactDamage: 4, archetype: 'fast', xpValue: 4 },
  pylone: { id: 'pylone', name: 'Pylône', hp: 40, speed: 58, contactDamage: 8, archetype: 'tank', xpValue: 12 },
  // 07 charpente / toiture
  copeau: { id: 'copeau', name: 'Copeau', hp: 12, speed: 90, contactDamage: 5, archetype: 'base', xpValue: 5 },
  chevron: { id: 'chevron', name: 'Chevron', hp: 9, speed: 150, contactDamage: 4, archetype: 'fast', xpValue: 4 },
  poutre: { id: 'poutre', name: 'Poutre', hp: 40, speed: 58, contactDamage: 8, archetype: 'tank', xpValue: 12 },
  // 08 second œuvre
  platras: { id: 'platras', name: 'Plâtras', hp: 12, speed: 90, contactDamage: 5, archetype: 'base', xpValue: 5 },
  gainard: { id: 'gainard', name: 'Gainard', hp: 9, speed: 150, contactDamage: 4, archetype: 'fast', xpValue: 4 },
  cloison: { id: 'cloison', name: 'Cloison', hp: 40, speed: 58, contactDamage: 8, archetype: 'tank', xpValue: 12 },
  // 09 finitions
  goutte: { id: 'goutte', name: 'Goutte', hp: 12, speed: 90, contactDamage: 5, archetype: 'base', xpValue: 5 },
  pinceau: { id: 'pinceau', name: 'Pinceau', hp: 9, speed: 150, contactDamage: 4, archetype: 'fast', xpValue: 4 },
  pot: { id: 'pot', name: 'Pot de peinture', hp: 40, speed: 58, contactDamage: 8, archetype: 'tank', xpValue: 12 },
  // 10 livraison / audit
  formulaire: { id: 'formulaire', name: 'Formulaire', hp: 12, speed: 90, contactDamage: 5, archetype: 'base', xpValue: 5 },
  auditeur: { id: 'auditeur', name: 'Auditeur', hp: 9, speed: 150, contactDamage: 4, archetype: 'fast', xpValue: 4 },
  commission: { id: 'commission', name: 'Commission', hp: 40, speed: 58, contactDamage: 8, archetype: 'tank', xpValue: 12 },
  // Mini-boss (hors pool de vague — invoqué par le directeur temporel à 5:00).
  contremaitre: {
    id: 'contremaitre',
    name: 'Contremaître',
    hp: 900, // tenace : force un vrai combat de plusieurs secondes au contact (climax)
    speed: 215, // > vitesse joueur (200) : rattrape et reste au contact → dip HP fiable au climax 5:00 (mais tuable = gagnable)
    contactDamage: 20,
    archetype: 'elite',
    xpValue: 80
  }
}

/** Id du mini-boss MVP. */
export const MINI_BOSS_ID = 'contremaitre'

/** Liste des ids d'ennemis connus. */
export const ENEMY_IDS: readonly string[] = Object.keys(ENEMIES)
