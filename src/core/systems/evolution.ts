/**
 * Système d'évolution d'armes.
 *
 * Transforme une arme base + passif catalyseur en arme surpuissante,
 * si les conditions de niveau sont atteintes.
 */

import type { EntityId } from '@core/types'
import { EVOLUTIONS } from '@content/evolutions'
import type { Inventory } from '@core/systems/cards'
import { World } from '@core/world'

/**
 * Finds the first eligible evolution (by weapon slot order) given an inventory.
 * Returns null if no evolution is eligible.
 *
 * Eligibility: base weapon must be at reqBaseLevel, passive must be at reqPassiveLevel.
 */
export function findEvolution(inv: Inventory): { evolved: string } | null {
  for (const weapon of inv.weapons) {
    for (const evo of EVOLUTIONS) {
      if (
        weapon.id === evo.base &&
        weapon.level >= evo.reqBaseLevel &&
        inv.passives.some(p => p.id === evo.passive && p.level >= evo.reqPassiveLevel)
      ) {
        return { evolved: evo.evolved }
      }
    }
  }
  return null
}

/**
 * Attempts to evolve the player's weapon, if eligible.
 * Replaces the matching weapon slot's id with the evolved id at level 1.
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
  let found = false
  for (const slot of weapons.slots) {
    // Check if this slot matches a base weapon of the evolution
    for (const evo of EVOLUTIONS) {
      if (slot.id === evo.base && evolution.evolved === evo.evolved) {
        slot.id = evo.evolved
        slot.level = 1
        found = true
        break
      }
    }
    if (found) {
      break
    }
  }

  if (found) {
    world.add(playerEntity, 'weapons', weapons)
    return evolution.evolved
  } else {
    return null
  }
}
