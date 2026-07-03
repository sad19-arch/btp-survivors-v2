import type { World } from '../world'
import type { Rng } from '../rng'
import type { PickupKind, Vec2 } from '../types'
import { PICKUP_DROPS } from '@content/config'

/**
 * Récolte les ennemis morts, quelle que soit la source de dégâts (projectile,
 * onde de marteau, lame de scie…). Centralise la mort en un seul endroit :
 * lâche une gemme d'XP (+ parfois un bonus), supprime l'entité et compte le kill.
 *
 * `lootRng` est un RNG DÉDIÉ au loot (séparé du RNG de spawn/upgrade) pour ne pas
 * perturber la séquence d'équilibrage. S'il est absent, seule la gemme d'XP tombe.
 * Retourne le nombre d'ennemis récoltés (pour le score).
 */
export function reapDeadEnemies(world: World, lootRng?: Rng): number {
  const dead: number[] = []
  for (const en of world.query('enemy', 'health')) {
    const health = world.get(en, 'health')
    if (health !== undefined && health.hp <= 0) {
      dead.push(en)
    }
  }
  for (const en of dead) {
    const epos = world.get(en, 'position')
    const ecomp = world.get(en, 'enemy')
    if (epos !== undefined && ecomp !== undefined) {
      dropPickup(world, epos, 'xp', ecomp.xpValue)
      if (ecomp.bossRole === 'mid') {
        // Boss de mi-parcours : lâche un coffre d'évolution (rend une évolution
        // atteignable EN RUN, avant le boss final — cf. Plan B1 split de boss).
        dropPickup(world, epos, 'coffre', 0)
      }
      if (lootRng !== undefined) {
        maybeDropBonus(world, lootRng, epos)
      }
    }
    world.despawn(en)
  }
  return dead.length
}

/** Tire au plus UN bonus (soin / aimant / coffre) selon les chances configurées. */
function maybeDropBonus(world: World, rng: Rng, pos: Vec2): void {
  if (rng.chance(PICKUP_DROPS.heal.chance)) {
    dropPickup(world, pos, 'heal', PICKUP_DROPS.heal.value)
  } else if (rng.chance(PICKUP_DROPS.magnet.chance)) {
    dropPickup(world, pos, 'magnet', PICKUP_DROPS.magnet.value)
  } else if (rng.chance(PICKUP_DROPS.chest.chance)) {
    dropPickup(world, pos, 'chest', PICKUP_DROPS.chest.value)
  }
}

/** Fait apparaître un pickup à une position. */
function dropPickup(world: World, pos: Vec2, type: PickupKind, value: number): void {
  const gem = world.spawn()
  world.add(gem, 'position', { x: pos.x, y: pos.y })
  world.add(gem, 'pickup', { type, value })
}
