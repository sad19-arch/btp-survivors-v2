import type { World } from '../world'
import type { Vec2 } from '../types'
import type { WeaponDef } from '@content/weapons'
import { WEAPONS } from '@content/weapons'
import { HITBOX } from '@content/config'

/**
 * Système d'armes : chaque arme du joueur tire automatiquement vers l'ennemi
 * vivant le plus proche dans sa portée, à la cadence de son cooldown.
 * Déterministe (pas d'aléa) ; le mouvement des projectiles est géré ailleurs.
 */
export function weaponSystem(world: World, dtMs: number): void {
  for (const e of world.query('player', 'position', 'weapons', 'health')) {
    const health = world.get(e, 'health')
    const pos = world.get(e, 'position')
    const loadout = world.get(e, 'weapons')
    const player = world.get(e, 'player')
    if (health === undefined || pos === undefined || loadout === undefined || player === undefined) {
      continue
    }
    if (health.hp <= 0) {
      continue
    }

    for (const slot of loadout.slots) {
      const def = WEAPONS[slot.id]
      if (def === undefined) {
        continue
      }
      slot.cooldownLeftMs -= dtMs
      if (slot.cooldownLeftMs > 0) {
        continue
      }
      const target = findNearestEnemy(world, pos, def.range)
      if (target === null) {
        slot.cooldownLeftMs = 0 // prêt à tirer dès qu'une cible entre en portée
        continue
      }
      fireProjectile(world, pos, target, def, player.playerId)
      slot.cooldownLeftMs = def.cooldownMs
    }
  }
}

function findNearestEnemy(world: World, from: Vec2, range: number): Vec2 | null {
  let best: Vec2 | null = null
  let bestDist = range * range
  for (const e of world.query('enemy', 'position', 'health')) {
    const pos = world.get(e, 'position')
    const health = world.get(e, 'health')
    if (pos === undefined || health === undefined || health.hp <= 0) {
      continue
    }
    const d = (pos.x - from.x) ** 2 + (pos.y - from.y) ** 2
    if (d <= bestDist) {
      bestDist = d
      best = { x: pos.x, y: pos.y }
    }
  }
  return best
}

function fireProjectile(world: World, from: Vec2, target: Vec2, def: WeaponDef, ownerId: number): void {
  const dx = target.x - from.x
  const dy = target.y - from.y
  const len = Math.hypot(dx, dy)
  const dirX = len === 0 ? 1 : dx / len
  const dirY = len === 0 ? 0 : dy / len

  const e = world.spawn()
  world.add(e, 'position', { x: from.x, y: from.y })
  world.add(e, 'velocity', { x: dirX * def.projectileSpeed, y: dirY * def.projectileSpeed })
  world.add(e, 'projectile', {
    type: def.id,
    damage: def.damage,
    ownerId,
    lifeMs: def.projectileLifeMs,
    radius: HITBOX.projectile
  })
}
