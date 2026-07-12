/**
 * Évolutions d'armes (data-driven).
 *
 * Une évolution transforme une arme de base + un passif catalyseur en arme surpuissante.
 * Exemple : cloueur maxé (niveau 8) + air_comprimé (niveau 1+) → mitrailleuse_clous (niveau 1).
 */

import { WEAPONS } from '@content/weapons'

/** Niveau max de l'arme de base (dérivé de WEAPONS → pas de drift, sans assertion non-null). */
const baseMaxLevel = (id: string): number => WEAPONS[id]?.maxLevel ?? 1

export interface EvolutionDef {
  base: string
  passive: string
  evolved: string
  reqBaseLevel: number
  reqPassiveLevel: number
}

export const EVOLUTIONS: readonly EvolutionDef[] = [
  {
    base: 'cloueur',
    passive: 'air_comprime',
    evolved: 'mitrailleuse_clous',
    reqBaseLevel: baseMaxLevel('cloueur'),
    reqPassiveLevel: 1
  },
  {
    base: 'court_circuit',
    passive: 'groupe_electrogene',
    evolved: 'haute_tension',
    reqBaseLevel: baseMaxLevel('court_circuit'),
    reqPassiveLevel: 1
  },
  // Phase A — 5 nouvelles évolutions (arme max + catalyseur → arme surpuissante)
  {
    base: 'goudron',
    passive: 'cadence_chantier',
    evolved: 'coulee_bitume',
    reqBaseLevel: baseMaxLevel('goudron'),
    reqPassiveLevel: 1
  },
  {
    base: 'boulons',
    passive: 'aimant_chantier',
    evolved: 'tempete_boulons',
    reqBaseLevel: baseMaxLevel('boulons'),
    reqPassiveLevel: 1
  },
  {
    base: 'cle_molette',
    passive: 'batterie_18v',
    evolved: 'cle_choc',
    reqBaseLevel: baseMaxLevel('cle_molette'),
    reqPassiveLevel: 1
  },
  {
    base: 'extincteur',
    passive: 'casque_homologue',
    evolved: 'canon_mousse',
    reqBaseLevel: baseMaxLevel('extincteur'),
    reqPassiveLevel: 1
  },
  {
    base: 'brouette',
    passive: 'prime_rendement',
    evolved: 'transpalette',
    reqBaseLevel: baseMaxLevel('brouette'),
    reqPassiveLevel: 1
  },
  // Chalumeau maxé + outillage renforcé (flamme de découpe plus chaude) → lance thermique.
  {
    base: 'chalumeau',
    passive: 'outillage_renforce',
    evolved: 'lance_thermique',
    reqBaseLevel: baseMaxLevel('chalumeau'),
    reqPassiveLevel: 1
  }
] as const
