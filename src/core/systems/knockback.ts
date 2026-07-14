import type { EntityId, Vec2 } from '../types'
import type { World } from '../world'

export const KNOCKBACK_MAX_SPEED = 520
export const KNOCKBACK_DECELERATION = 2600
export const KNOCKBACK_STOP_SPEED = 20

export interface EnemyHitOptions {
  ownerId?: number | undefined
  knockback?: number | undefined
  direction?: Vec2 | undefined
}

/** Point d'entrée unique des dégâts infligés par les armes aux ennemis. */
export function applyEnemyHit(
  world: World,
  enemyId: EntityId,
  damage: number,
  options: EnemyHitOptions = {}
): void {
  const health = world.get(enemyId, 'health')
  const enemy = world.get(enemyId, 'enemy')
  if (health === undefined || enemy === undefined || health.hp <= 0) {
    return
  }

  health.hp -= damage
  if (options.ownerId !== undefined) {
    enemy.lastHitBy = options.ownerId
  }

  const force = (options.knockback ?? 0) * (enemy.knockbackMult ?? 1)
  if (force <= 0) {
    return
  }

  const direction = options.direction ?? { x: 1, y: 0 }
  const length = Math.hypot(direction.x, direction.y)
  const nx = length > 1e-9 ? direction.x / length : 1
  const ny = length > 1e-9 ? direction.y / length : 0
  const current = world.get(enemyId, 'knockback')
  let vx = (current?.vx ?? 0) + nx * force
  let vy = (current?.vy ?? 0) + ny * force
  const speed = Math.hypot(vx, vy)
  if (speed > KNOCKBACK_MAX_SPEED) {
    const scale = KNOCKBACK_MAX_SPEED / speed
    vx *= scale
    vy *= scale
  }

  if (current === undefined) {
    world.add(enemyId, 'knockback', { vx, vy })
  } else {
    current.vx = vx
    current.vy = vy
  }
}

/** Déplace puis amortit les impulsions sans interrompre le comportement d'IA. */
export function knockbackSystem(world: World, dtMs: number): void {
  const dt = Math.max(0, dtMs) / 1000
  const finished: EntityId[] = []
  for (const entity of world.query('enemy', 'position', 'knockback')) {
    const position = world.get(entity, 'position')
    const knockback = world.get(entity, 'knockback')
    if (position === undefined || knockback === undefined) {
      continue
    }

    const speed = Math.hypot(knockback.vx, knockback.vy)
    if (speed < KNOCKBACK_STOP_SPEED || speed === 0) {
      finished.push(entity)
      continue
    }

    position.x += knockback.vx * dt
    position.y += knockback.vy * dt

    const nextSpeed = Math.max(0, speed - KNOCKBACK_DECELERATION * dt)
    if (nextSpeed < KNOCKBACK_STOP_SPEED) {
      finished.push(entity)
    } else {
      const scale = nextSpeed / speed
      knockback.vx *= scale
      knockback.vy *= scale
    }
  }

  for (const entity of finished) {
    world.remove(entity, 'knockback')
  }
}
