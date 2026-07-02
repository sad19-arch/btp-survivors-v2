export type StatKey =
  | 'might' | 'area' | 'amount' | 'cooldown' | 'duration'
  | 'projectileSpeed' | 'moveSpeed' | 'maxHp' | 'recovery' | 'magnet' | 'growth'

export interface PlayerStats {
  might: number; area: number; amount: number; cooldown: number; duration: number
  projectileSpeed: number; moveSpeed: number; maxHp: number; recovery: number; magnet: number; growth: number
}

export interface PassiveDef {
  id: string; name: string; description: string; maxLevel: number
  perLevel: Partial<Record<StatKey, number>>
}

export const BASE_STATS: PlayerStats = {
  might: 1, area: 1, amount: 0, cooldown: 1, duration: 1,
  projectileSpeed: 1, moveSpeed: 1, maxHp: 1, recovery: 0, magnet: 1, growth: 1
}

export const PASSIVES: Record<string, PassiveDef> = {
  air_comprime:        { id: 'air_comprime', name: 'Air comprimé', description: '+10 % de vitesse de projectile.', maxLevel: 5, perLevel: { projectileSpeed: 0.1 } },
  groupe_electrogene:  { id: 'groupe_electrogene', name: 'Groupe électrogène', description: '+1 projectile.', maxLevel: 2, perLevel: { amount: 1 } },
  outillage_renforce:  { id: 'outillage_renforce', name: 'Outillage renforcé', description: '+10 % de dégâts.', maxLevel: 5, perLevel: { might: 0.1 } },
  cadence_chantier:    { id: 'cadence_chantier', name: 'Cadence de chantier', description: '−8 % de temps de recharge.', maxLevel: 5, perLevel: { cooldown: -0.08 } },
  casque_homologue:    { id: 'casque_homologue', name: 'Casque homologué', description: '+10 % de PV max.', maxLevel: 5, perLevel: { maxHp: 0.1 } },
  chaussures_securite: { id: 'chaussures_securite', name: 'Chaussures de sécurité', description: '+10 % de vitesse.', maxLevel: 5, perLevel: { moveSpeed: 0.1 } }
}

export function aggregatePassives(owned: ReadonlyArray<{ id: string; level: number }>): PlayerStats {
  const s: PlayerStats = { ...BASE_STATS }
  for (const { id, level } of owned) {
    const def = PASSIVES[id]
    if (def === undefined) {
      continue
    }
    const lvl = Math.max(0, Math.min(level, def.maxLevel))
    for (const [key, per] of Object.entries(def.perLevel)) {
      s[key as StatKey] += (per ?? 0) * lvl
    }
  }
  return s
}
