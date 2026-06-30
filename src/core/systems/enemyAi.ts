import type { World } from '../world'
import type { Vec2 } from '../types'

/**
 * IA d'ennemi de base (comportement NORMAL) : oriente la vélocité de chaque
 * ennemi vers le joueur VIVANT le plus proche, à sa propre vitesse.
 *
 * Fonction pure et déterministe (le mouvement est appliqué par movementSystem).
 */
export function enemyAiSystem(world: World): void {
  const targets: Vec2[] = []
  for (const p of world.query('player', 'position', 'health')) {
    const health = world.get(p, 'health')
    const pos = world.get(p, 'position')
    if (health === undefined || pos === undefined) {
      continue
    }
    if (health.hp > 0) {
      targets.push({ x: pos.x, y: pos.y })
    }
  }

  for (const e of world.query('enemy', 'position', 'velocity')) {
    const pos = world.get(e, 'position')
    const vel = world.get(e, 'velocity')
    const enemy = world.get(e, 'enemy')
    if (pos === undefined || vel === undefined || enemy === undefined) {
      continue
    }

    const nearest = findNearest(pos, targets)
    if (nearest === null) {
      vel.x = 0
      vel.y = 0
      continue
    }

    const dx = nearest.x - pos.x
    const dy = nearest.y - pos.y
    const len = Math.hypot(dx, dy)
    if (len === 0) {
      vel.x = 0
      vel.y = 0
      continue
    }
    vel.x = (dx / len) * enemy.speed
    vel.y = (dy / len) * enemy.speed
  }
}

function findNearest(from: Vec2, targets: readonly Vec2[]): Vec2 | null {
  let best: Vec2 | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const t of targets) {
    const d = (t.x - from.x) ** 2 + (t.y - from.y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = t
    }
  }
  return best
}
