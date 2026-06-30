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
  paperasse: { id: 'paperasse', name: 'Paperasse', hp: 12, speed: 55, contactDamage: 6, archetype: 'base', xpValue: 5 },
  inspecteur: { id: 'inspecteur', name: 'Inspecteur', hp: 9, speed: 95, contactDamage: 5, archetype: 'fast', xpValue: 4 },
  huissier: { id: 'huissier', name: 'Huissier', hp: 40, speed: 38, contactDamage: 10, archetype: 'tank', xpValue: 12 }
}

/** Liste des ids d'ennemis connus. */
export const ENEMY_IDS: readonly string[] = Object.keys(ENEMIES)
