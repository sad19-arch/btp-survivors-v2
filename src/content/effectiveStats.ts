import type { WeaponLevel } from './weapons'
import type { PlayerStats } from './passives'

export interface EffectiveStats {
  damage: number; cooldownMs: number; count: number; area: number; pierce: number
  projectileSpeed: number; projectileLifeMs: number; orbitRadius: number; orbitSpeed: number; orbitHitRadius: number
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
    orbitHitRadius: (lvl.orbitHitRadius ?? 0) * s.area
  }
}
