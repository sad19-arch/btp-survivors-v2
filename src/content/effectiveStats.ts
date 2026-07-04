import type { WeaponLevel } from './weapons'
import type { PlayerStats } from './passives'

export interface EffectiveStats {
  damage: number; cooldownMs: number; count: number; area: number; pierce: number
  projectileSpeed: number; projectileLifeMs: number; orbitRadius: number; orbitSpeed: number; orbitHitRadius: number
  /** Nombre de rebonds (ricochet) ; 0 = aucun. */
  bounces: number
  /**
   * Durée aller du boomerang (ms, scalée par `s.duration`).
   * `undefined` si l'arme n'est pas un boomerang.
   */
  boomerangOutMs: number | undefined
  /** Rayon du projectile (px, scalé par `s.area`) ; 0 = non applicable (arme sans kind projectile). */
  projectileRadius: number
  /**
   * Intervalle entre deux ticks de dégâts (ms) pour les armes kind `hazard`.
   * Non scalé (cadence fixe, indépendante des passifs).
   * `undefined` si l'arme n'est pas de kind hazard.
   */
  tickMs: number | undefined
  /**
   * Multiplicateur de vélocité appliqué aux ennemis touchés par une arme de kind `cone`.
   * Non scalé (l'intensité du ralentissement est indépendante des passifs).
   * `undefined` si l'arme ne ralentit pas.
   */
  slowMult: number | undefined
  /**
   * Durée du ralentissement infligé par une arme de kind `cone`, en ms.
   * Non scalé.
   * `undefined` si l'arme ne ralentit pas.
   */
  slowMs: number | undefined
}

const MIN_COOLDOWN_MS = 60

export function effectiveWeaponStats(lvl: WeaponLevel, s: PlayerStats): EffectiveStats {
  return {
    damage: lvl.damage * s.might,
    cooldownMs: Math.max(MIN_COOLDOWN_MS, lvl.cooldownMs * s.cooldown),
    count: lvl.count + s.amount,
    area: lvl.area * s.area,
    pierce: lvl.pierce,
    projectileSpeed: (lvl.projectileSpeed ?? 0) * s.projectileSpeed,
    projectileLifeMs: (lvl.projectileLifeMs ?? 0) * s.duration,
    orbitRadius: (lvl.orbitRadius ?? 0) * s.area,
    orbitSpeed: (lvl.orbitSpeed ?? 0),
    orbitHitRadius: (lvl.orbitHitRadius ?? 0) * s.area,
    bounces: lvl.bounces ?? 0,
    boomerangOutMs: lvl.boomerangOutMs !== undefined ? lvl.boomerangOutMs * s.duration : undefined,
    projectileRadius: (lvl.projectileRadius ?? 0) * s.area,
    tickMs: lvl.tickMs,
    // Ralentissement : non scalé par les passifs (l'intensité / la durée du slow
    // sont des propriétés intrinsèques de l'arme, pas des stats joueur).
    slowMult: lvl.slowMult,
    slowMs: lvl.slowMs
  }
}
