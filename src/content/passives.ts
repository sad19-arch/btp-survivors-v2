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
  air_comprime:        { id: 'air_comprime', name: 'Air comprimé', description: '+10 % de vitesse de projectile ; au niveau max, +10 % de portée.', maxLevel: 5, perLevel: { projectileSpeed: 0.1 } },
  groupe_electrogene:  { id: 'groupe_electrogene', name: 'Groupe électrogène', description: '+1 projectile.', maxLevel: 2, perLevel: { amount: 1 } },
  outillage_renforce:  { id: 'outillage_renforce', name: 'Outillage renforcé', description: '+10 % de dégâts.', maxLevel: 5, perLevel: { might: 0.1 } },
  cadence_chantier:    { id: 'cadence_chantier', name: 'Cadence de chantier', description: '−8 % de temps de recharge.', maxLevel: 5, perLevel: { cooldown: -0.08 } },
  casque_homologue:    { id: 'casque_homologue', name: 'Casque homologué', description: '+10 % de PV max ; au niveau max, repousse périodiquement les ennemis au contact.', maxLevel: 5, perLevel: { maxHp: 0.1 } },
  chaussures_securite: { id: 'chaussures_securite', name: 'Chaussures de sécurité', description: '+10 % de vitesse ; au niveau max, les balayages en mouvement repoussent davantage.', maxLevel: 5, perLevel: { moveSpeed: 0.1 } },
  // Passifs phase A — catalyseurs de mobilité et de rendement (obtenables par carte).
  aimant_chantier:     { id: 'aimant_chantier', name: 'Aimant de chantier', description: '+8 % de rayon et +5 % de vitesse d\'attraction des gemmes.', maxLevel: 5, perLevel: { magnet: 0.08 } },
  batterie_18v:        { id: 'batterie_18v', name: 'Batterie 18V', description: '+12 % de durée des projectiles, zones, boomerangs et ralentissements.', maxLevel: 5, perLevel: { duration: 0.12 } },
  prime_rendement:     { id: 'prime_rendement', name: 'Prime de rendement', description: '+5 % d\'XP gagnée ; au niveau max, une chaîne de kills enrichit temporairement les gemmes.', maxLevel: 5, perLevel: { growth: 0.05 } },
  surcharge_gaz:       { id: 'surcharge_gaz', name: 'Surcharge de gaz', description: 'Agrandit les explosions ; au niveau max, les victimes centrales réexplosent.', maxLevel: 5, perLevel: {} },
  // Catalyseurs des évolutions scie/marteau/pied-de-biche (armes MVP historiques).
  disque_diamant:          { id: 'disque_diamant', name: 'Disque diamant', description: 'Agrandit scies et balayages ; au niveau max, ils réimpactent.', maxLevel: 5, perLevel: {} },
  compresseur_pneumatique: { id: 'compresseur_pneumatique', name: 'Compresseur pneumatique', description: 'Les impacts lourds réussis accélèrent la prochaine frappe.', maxLevel: 5, perLevel: {} },
}

export interface SignaturePassiveEffects {
  surchargeLevel: number
  /** Multiplicateur du rayon d'explosion, borné à +40 %. */
  explosionScale: number
  secondaryExplosions: boolean
  disqueLevel: number
  /** Multiplicateur de taille des armes orbitales et balayages, borné à +32 %. */
  contactSizeScale: number
  /** Multiplicateur de recul à partir du niveau 3. */
  contactKnockbackScale: number
  contactReimpact: boolean
  compresseurLevel: number
  /** Nombre minimal de cibles uniques pour déclencher l'accélération lourde. */
  heavyImpactThreshold: number
  /** Fraction retirée au prochain délai de l'arme lourde concernée. */
  heavyImpactHaste: number
}

export interface UtilityPassiveEffects {
  airLevel: number
  projectileRangeScale: number
  casqueLevel: number
  contactRepulseForce: number
  contactRepulseCooldownMs: number
  chaussuresLevel: number
  movingSweepKnockbackScale: number
  aimantLevel: number
  magnetPullScale: number
  primeLevel: number
  rendementBurstThreshold: number
  rendementBurstXpScale: number
}

export const UTILITY_PASSIVE_TUNING = {
  airRangeScaleAtMax: 1.1,
  casqueRepulseForceAtMax: 140,
  casqueRepulseCooldownMs: 600,
  chaussuresSweepKnockbackScaleAtMax: 1.2,
  aimantPullBonusPerLevel: 0.05,
  rendementComboKills: 10,
  rendementComboWindowMs: 3000,
  rendementBoostMs: 5000,
  rendementBoostXpScale: 1.25
} as const

/** Capstones simples et bornés des six passifs utilitaires du point 4. */
export function utilityPassiveEffects(
  owned: ReadonlyArray<{ id: string; level: number }>
): UtilityPassiveEffects {
  const levelOf = (id: string): number => {
    const def = PASSIVES[id]
    const level = owned.find((passive) => passive.id === id)?.level ?? 0
    return def === undefined ? 0 : Math.max(0, Math.min(level, def.maxLevel))
  }
  const airLevel = levelOf('air_comprime')
  const casqueLevel = levelOf('casque_homologue')
  const chaussuresLevel = levelOf('chaussures_securite')
  const aimantLevel = levelOf('aimant_chantier')
  const primeLevel = levelOf('prime_rendement')
  return {
    airLevel,
    projectileRangeScale: airLevel === 5 ? UTILITY_PASSIVE_TUNING.airRangeScaleAtMax : 1,
    casqueLevel,
    contactRepulseForce: casqueLevel === 5 ? UTILITY_PASSIVE_TUNING.casqueRepulseForceAtMax : 0,
    contactRepulseCooldownMs: UTILITY_PASSIVE_TUNING.casqueRepulseCooldownMs,
    chaussuresLevel,
    movingSweepKnockbackScale: chaussuresLevel === 5
      ? UTILITY_PASSIVE_TUNING.chaussuresSweepKnockbackScaleAtMax
      : 1,
    aimantLevel,
    magnetPullScale: 1 + aimantLevel * UTILITY_PASSIVE_TUNING.aimantPullBonusPerLevel,
    primeLevel,
    rendementBurstThreshold: UTILITY_PASSIVE_TUNING.rendementComboKills,
    rendementBurstXpScale: primeLevel === 5 ? UTILITY_PASSIVE_TUNING.rendementBoostXpScale : 1
  }
}

/**
 * Effets spécialisés des trois catalyseurs qui ne doivent plus alimenter les
 * statistiques globales. Leurs niveaux restent ceux du loadout normal : aucune
 * nouvelle ressource, aucun nouveau système d'inventaire.
 */
export function signaturePassiveEffects(
  owned: ReadonlyArray<{ id: string; level: number }>
): SignaturePassiveEffects {
  const levelOf = (id: string): number => {
    const def = PASSIVES[id]
    const level = owned.find((passive) => passive.id === id)?.level ?? 0
    return def === undefined ? 0 : Math.max(0, Math.min(level, def.maxLevel))
  }
  const surchargeLevel = levelOf('surcharge_gaz')
  const disqueLevel = levelOf('disque_diamant')
  const compresseurLevel = levelOf('compresseur_pneumatique')
  const explosionBonusByLevel = [0, 0.1, 0.2, 0.3, 0.4, 0.4] as const
  const contactSizeBonusByLevel = [0, 0.08, 0.16, 0.24, 0.32, 0.32] as const
  const heavyThresholdByLevel = [Number.POSITIVE_INFINITY, 5, 5, 4, 4, 3] as const
  const heavyHasteByLevel = [0, 0.1, 0.15, 0.2, 0.25, 0.3] as const
  return {
    surchargeLevel,
    explosionScale: 1 + (explosionBonusByLevel[surchargeLevel] ?? 0),
    secondaryExplosions: surchargeLevel === 5,
    disqueLevel,
    contactSizeScale: 1 + (contactSizeBonusByLevel[disqueLevel] ?? 0),
    contactKnockbackScale: disqueLevel >= 3 ? 1.15 : 1,
    contactReimpact: disqueLevel === 5,
    compresseurLevel,
    heavyImpactThreshold: heavyThresholdByLevel[compresseurLevel] ?? Number.POSITIVE_INFINITY,
    heavyImpactHaste: heavyHasteByLevel[compresseurLevel] ?? 0
  }
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
