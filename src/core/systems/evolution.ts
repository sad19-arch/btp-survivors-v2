/**
 * Système d'évolution d'armes.
 *
 * Transforme une arme base + passif catalyseur en arme surpuissante,
 * si les conditions de niveau sont atteintes.
 */

import type { EntityId } from '@core/types'
import { EVOLUTIONS, type EvolutionDef } from '@content/evolutions'
import type { Inventory } from '@core/systems/cards'
import { World } from '@core/world'

/** État d'évolution pour une arme de base possédée par le joueur. */
export interface EvolutionStatus {
  /** Id de l'arme de base. */
  base: string
  /** Id de l'arme évoluée. */
  evolved: string
  /** Id du passif catalyseur. */
  passive: string
  /** Niveau actuel de l'arme de base possédée. */
  baseLevel: number
  /** Niveau requis de l'arme de base pour évoluer. */
  reqBaseLevel: number
  /** Vrai si le passif catalyseur est possédé au niveau requis. */
  hasPassive: boolean
  /** Vrai si l'arme est prête à évoluer (baseLevel >= reqBaseLevel && hasPassive). */
  ready: boolean
}

/**
 * Pour chaque définition dans EVOLUTIONS dont l'arme `base` est possédée par le joueur,
 * renvoie l'état d'évolution. Pur (aucune mutation). Ordre = ordre de EVOLUTIONS.
 */
export function evolutionStatuses(inv: Inventory): EvolutionStatus[] {
  const result: EvolutionStatus[] = []
  for (const evo of EVOLUTIONS) {
    const baseWeapon = inv.weapons.find((w) => w.id === evo.base)
    if (baseWeapon === undefined) {
      continue
    }
    const hasPassive = inv.passives.some(
      (p) => p.id === evo.passive && p.level >= evo.reqPassiveLevel
    )
    result.push({
      base: evo.base,
      evolved: evo.evolved,
      passive: evo.passive,
      baseLevel: baseWeapon.level,
      reqBaseLevel: evo.reqBaseLevel,
      hasPassive,
      ready: baseWeapon.level >= evo.reqBaseLevel && hasPassive
    })
  }
  return result
}

/**
 * Finds the first eligible evolution (by weapon slot order) given an inventory.
 * Returns null if no evolution is eligible.
 *
 * Eligibility: base weapon must be at reqBaseLevel, passive must be at reqPassiveLevel.
 */
export function findEvolution(inv: Inventory): EvolutionDef | null {
  for (const weapon of inv.weapons) {
    for (const evo of EVOLUTIONS) {
      if (
        weapon.id === evo.base &&
        weapon.level >= evo.reqBaseLevel &&
        inv.passives.some(p => p.id === evo.passive && p.level >= evo.reqPassiveLevel)
      ) {
        return evo
      }
    }
  }
  return null
}

/**
 * Attempts to evolve the player's weapon, if eligible.
 * Replaces the matching weapon slot's id with the evolved id at level 1,
 * and resets cooldownLeftMs to 0.
 * Returns the evolved id or null if no evolution applied.
 */
export function tryEvolve(world: World, playerEntity: EntityId): string | null {
  const weapons = world.get(playerEntity, 'weapons')
  const passives = world.get(playerEntity, 'passives')

  if (!weapons || !passives) {
    return null
  }

  // Build inventory from slots
  const inv: Inventory = {
    weapons: weapons.slots.map(s => ({ id: s.id, level: s.level })),
    passives: passives.list
  }

  const evolution = findEvolution(inv)
  if (!evolution) {
    return null
  }

  // Find the matching base weapon slot and replace it
  const slot = weapons.slots.find(s => s.id === evolution.base)
  if (!slot) {
    return null
  }

  slot.id = evolution.evolved
  slot.level = 1
  slot.cooldownLeftMs = 0

  return evolution.evolved
}
