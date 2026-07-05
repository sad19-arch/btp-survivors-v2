/**
 * Util pur : décrit le gain d'un niveau d'arme en langage naturel (FR).
 *
 * Règles :
 * - Zéro Phaser / DOM / Math.random / Date.now / any.
 * - Data-driven : itère sur les clés d'`EffectiveStats` avec un mapping centralisé.
 * - Seuil anti-bruit : ignore les deltas damage < 0.5 après arrondi.
 * - Priorité d'affichage : count > damage > area > cooldown > pierce > bounces > projectileRadius > slow.
 * - fromLevel===0 ⇒ '' (pas de delta à afficher au niveau initial).
 */

import { WEAPONS, weaponStatsAtLevel } from '@content/weapons'
import { effectiveWeaponStats } from '@content/effectiveStats'
import type { EffectiveStats } from '@content/effectiveStats'
import type { PlayerStats } from '@content/passives'

// ---------------------------------------------------------------------------
// Mapping centralisé clé → fragment FR
// ---------------------------------------------------------------------------

type FragmentKey = keyof EffectiveStats

interface FragmentDef {
  /** Priorité d'affichage (plus petit = plus prioritaire). */
  priority: number
  /** Produit le fragment si le delta est significatif. Retourne '' pour ignorer. */
  describe(a: number, b: number): string
}

const FRAGMENTS: Partial<Record<FragmentKey, FragmentDef>> = {
  count: {
    priority: 1,
    describe(a, b) {
      const delta = Math.round(b) - Math.round(a)
      // On n'affiche que les GAINS. Certaines armes régressent en count entre
      // deux paliers (override non propagé par buildLevels : cloueur count 2 au
      // niv 3 → 1 au niv 4) ; on masque ce downgrade plutôt que d'alarmer le
      // joueur. Ces régressions sont un bug de données à corriger en phase de
      // tuning (hors du périmètre « feedback d'abord »).
      if (delta <= 0) { return '' }
      return delta === 1 ? '+1 projectile' : `+${delta} projectiles`
    }
  },
  damage: {
    priority: 2,
    describe(a, b) {
      const delta = Math.round(b - a)
      if (delta < 1) { return '' } // seuil anti-bruit : < 0.5 arrondi → < 1
      return `+${delta} dégâts`
    }
  },
  area: {
    priority: 3,
    describe(a, b) {
      // area=0 sur projectile pur → ignorer si les deux sont 0
      if (a === 0 && b === 0) { return '' }
      const delta = Math.round(b - a)
      if (delta <= 0) { return '' }
      return '+zone'
    }
  },
  cooldownMs: {
    priority: 4,
    describe(a, b) {
      // cooldown diminue = amélioration
      const delta = Math.round(a - b)
      if (delta <= 0) { return '' }
      return 'recharge plus rapide'
    }
  },
  pierce: {
    priority: 5,
    describe(a, b) {
      // pierce=99 = infini, pas de fragment lisible
      if (a >= 99 && b >= 99) { return '' }
      const delta = Math.round(b - a)
      if (delta <= 0) { return '' }
      return '+transperce'
    }
  },
  bounces: {
    priority: 6,
    describe(a, b) {
      const delta = Math.round(b - a)
      if (delta <= 0) { return '' }
      return delta === 1 ? '+1 rebond' : `+${delta} rebonds`
    }
  },
  projectileRadius: {
    priority: 7,
    describe(a, b) {
      if (a === 0 && b === 0) { return '' }
      const delta = Math.round(b - a)
      if (delta <= 0) { return '' }
      return '+rayon'
    }
  },
  // orbitRadius / orbitHitRadius → regroupés sous zone pour la scie
  orbitHitRadius: {
    priority: 8,
    describe(a, b) {
      if (a === 0 && b === 0) { return '' }
      const delta = Math.round(b - a)
      if (delta <= 0) { return '' }
      return '+portée'
    }
  }
}

// Ordre de priorité pour l'itération
const PRIORITY_ORDER: FragmentKey[] = (
  Object.entries(FRAGMENTS) as [FragmentKey, FragmentDef][]
)
  .sort((a, b) => a[1].priority - b[1].priority)
  .map(([k]) => k)

// ---------------------------------------------------------------------------
// Gestion spécifique des lames orbitales (count de la scie)
// ---------------------------------------------------------------------------

const ORBITAL_COUNT_LABELS: Record<number, string> = {
  1: '+1 lame orbitale',
  2: '+2 lames orbitales'
}

/**
 * Décrit le gain du passage de `fromLevel` à `toLevel` pour l'arme `weaponId`,
 * en tenant compte des stats passifs du joueur.
 *
 * @returns Fragment(s) FR séparés par ` · `, ou `''` si fromLevel===0 ou si
 *          l'arme est inconnue.
 */
export function describeWeaponLevelDelta(
  weaponId: string,
  fromLevel: number,
  toLevel: number,
  stats: PlayerStats
): string {
  if (fromLevel === 0) { return '' }

  const def = WEAPONS[weaponId]
  if (def === undefined) { return '' }

  const lvlA = weaponStatsAtLevel(def, fromLevel)
  const lvlB = weaponStatsAtLevel(def, toLevel)
  const a = effectiveWeaponStats(lvlA, stats)
  const b = effectiveWeaponStats(lvlB, stats)

  // Cas spécial : armes orbitales — « count » = nombre de lames, libellé distinct
  const fragments: string[] = []

  for (const key of PRIORITY_ORDER) {
    const def_ = FRAGMENTS[key]
    if (def_ === undefined) { continue }

    const av = a[key] ?? 0
    const bv = b[key] ?? 0

    // Pour les armes orbitales, le count est un nombre de lames
    if (key === 'count' && def.kind === 'orbital') {
      const delta = Math.round(bv) - Math.round(av)
      if (delta > 0) {
        fragments.push(ORBITAL_COUNT_LABELS[delta] ?? `+${delta} lames orbitales`)
      }
      continue
    }

    const frag = def_.describe(av, bv)
    if (frag !== '') { fragments.push(frag) }
  }

  return fragments.join(' · ')
}
