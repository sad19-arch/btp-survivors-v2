import type { World } from '../world'
import type { EntityId, Vec2 } from '../types'
import { HITBOX, PICKUP } from '@content/config'

/**
 * Pickups (gemmes d'XP) : aimantation vers le joueur le plus proche quand ils
 * entrent dans son rayon, puis collecte au contact (crédite la progression).
 *
 * Pur et déterministe (pas d'aléa). Les pickups hors rayon restent immobiles.
 */
export function pickupSystem(world: World, dtMs: number): void {
  const dt = dtMs / 1000
  const collectDist = HITBOX.player + PICKUP.collectRadius

  for (const gem of world.query('pickup', 'position')) {
    const gpos = world.get(gem, 'position')
    const pickup = world.get(gem, 'pickup')
    if (gpos === undefined || pickup === undefined) {
      continue
    }

    const target = nearestPlayer(world, gpos)
    if (target === null) {
      continue
    }

    const dx = target.pos.x - gpos.x
    const dy = target.pos.y - gpos.y
    const dist = Math.hypot(dx, dy)

    if (dist <= collectDist) {
      const progress = world.get(target.entity, 'progress')
      if (progress !== undefined) {
        progress.xp += pickup.value
      }
      world.despawn(gem)
      continue
    }

    if (dist <= target.pickupRadius && dist > 0) {
      const step = Math.min(PICKUP.magnetSpeed * dt, dist)
      gpos.x += (dx / dist) * step
      gpos.y += (dy / dist) * step
    }
  }
}

interface NearestPlayer {
  entity: EntityId
  pos: Vec2
  pickupRadius: number
}

/** Joueur vivant le plus proche d'une position (ou null si aucun). */
function nearestPlayer(world: World, from: Vec2): NearestPlayer | null {
  let best: NearestPlayer | null = null
  let bestDist = Infinity
  for (const e of world.query('player', 'position', 'health')) {
    const pos = world.get(e, 'position')
    const health = world.get(e, 'health')
    const player = world.get(e, 'player')
    if (pos === undefined || health === undefined || player === undefined || health.hp <= 0) {
      continue
    }
    const d = (pos.x - from.x) ** 2 + (pos.y - from.y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = { entity: e, pos, pickupRadius: player.pickupRadius }
    }
  }
  return best
}
