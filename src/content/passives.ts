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

// LIVE (consommés par au moins un système) : might, area, amount, cooldown, duration,
// projectileSpeed (weaponSystem/effectiveWeaponStats) ; moveSpeed, magnet, maxHp
// (playerStats.recomputePlayerStats) ; growth (pickup : gain d'XP × growth, passif
// « Prime de rendement »). RÉSERVÉ (agrégé ici mais lu par AUCUN système) : recovery.
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
  chaussures_securite: { id: 'chaussures_securite', name: 'Chaussures de sécurité', description: '+10 % de vitesse.', maxLevel: 5, perLevel: { moveSpeed: 0.1 } },
  // Passifs phase A — catalyseurs de mobilité et de rendement (obtenables par carte).
  aimant_chantier:     { id: 'aimant_chantier', name: 'Aimant de chantier', description: '+7 % de rayon d\'aimantation.', maxLevel: 5, perLevel: { magnet: 0.07 } },
  batterie_18v:        { id: 'batterie_18v', name: 'Batterie 18V', description: '+12 % de durée des effets.', maxLevel: 5, perLevel: { duration: 0.12 } },
  prime_rendement:     { id: 'prime_rendement', name: 'Prime de rendement', description: '+5 % d\'XP gagnée.', maxLevel: 5, perLevel: { growth: 0.05 } },
  surcharge_gaz:       { id: 'surcharge_gaz', name: 'Surcharge de gaz', description: '+8 % de dégâts (pression accumulée dans les bonbonnes).', maxLevel: 5, perLevel: { might: 0.08 } },
  // Catalyseurs des évolutions scie/marteau/pied-de-biche (armes MVP historiques).
  disque_diamant:          { id: 'disque_diamant', name: 'Disque diamant', description: '+9 % de dégâts (lame affûtée).', maxLevel: 5, perLevel: { might: 0.09 } },
  compresseur_pneumatique: { id: 'compresseur_pneumatique', name: 'Compresseur pneumatique', description: '−8 % de temps de recharge.', maxLevel: 5, perLevel: { cooldown: -0.08 } },
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
