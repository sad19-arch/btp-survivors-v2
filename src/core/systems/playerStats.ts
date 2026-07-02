import type { World } from '../world'
import type { EntityId } from '../types'
import { aggregatePassives } from '@content/passives'
import { PLAYER_BASE } from '@content/config'

/**
 * Recalcule les stats dérivées d'un joueur à partir de ses passifs possédés.
 *
 * Écrit `player.speed`, `player.pickupRadius`, `health.maxHp` (ratio hp/maxHp
 * conservé) et stocke le `PlayerStats` agrégé dans le composant `stats` pour
 * lecture par le weaponSystem (might/area/amount/cooldown/duration/...).
 */
export function recomputePlayerStats(world: World, entity: EntityId): void {
  const passives = world.get(entity, 'passives')
  const player = world.get(entity, 'player')
  const health = world.get(entity, 'health')
  if (passives === undefined || player === undefined) return
  const s = aggregatePassives(passives.list)
  world.add(entity, 'stats', s)
  player.speed = PLAYER_BASE.speed * s.moveSpeed
  player.pickupRadius = PLAYER_BASE.pickupRadius * s.magnet
  if (health !== undefined) {
    const ratio = health.maxHp > 0 ? health.hp / health.maxHp : 1
    health.maxHp = PLAYER_BASE.hp * s.maxHp
    health.hp = Math.min(health.maxHp, health.maxHp * ratio)
  }
}
