import type { GameState, Vec2 } from '@core/types'
import { WORLD } from '@content/config'

export type BotName = 'active' | 'kite' | 'greedy' | 'idle'

/** `active` est la référence joueur ; les trois autres sont des stress-tests. */
export const BOT_NAMES: readonly BotName[] = ['active', 'kite', 'greedy', 'idle']

export function isBotName(s: string): s is BotName {
  return (BOT_NAMES as readonly string[]).includes(s)
}

const ARENA_CENTER: Vec2 = { x: WORLD.width / 2, y: WORLD.height / 2 }
const DANGER_RADIUS = 210
const PICKUP_DANGER_RADIUS = 105
const GREEDY_PANIC_RADIUS = 48

function addNormalized(out: Vec2, x: number, y: number, weight: number): void {
  const length = Math.hypot(x, y)
  if (length > 0.001) {
    out.x += (x / length) * weight
    out.y += (y / length) * weight
  }
}

/** Décision déterministe d'un joueur actif, limitée aux informations visibles. */
export function activeMove(player: Vec2, enemies: readonly Vec2[], pickups: readonly Vec2[]): Vec2 {
  const move: Vec2 = { x: 0, y: 0 }
  let nearestEnemyDistance = Infinity

  for (const enemy of enemies) {
    const dx = player.x - enemy.x
    const dy = player.y - enemy.y
    const distance = Math.hypot(dx, dy)
    nearestEnemyDistance = Math.min(nearestEnemyDistance, distance)
    if (distance < DANGER_RADIUS) {
      const pressure = (DANGER_RADIUS - distance) / DANGER_RADIUS
      addNormalized(move, dx, dy, 1.2 + pressure * 3.8)
    }
  }

  let target: Vec2 | null = null
  let targetDistance = Infinity
  for (const pickup of pickups) {
    const distance = Math.hypot(pickup.x - player.x, pickup.y - player.y)
    if (distance >= targetDistance) {
      continue
    }
    const threatened = enemies.some((enemy) =>
      Math.hypot(enemy.x - pickup.x, enemy.y - pickup.y) < PICKUP_DANGER_RADIUS
    )
    if (!threatened) {
      target = pickup
      targetDistance = distance
    }
  }

  if (target !== null && nearestEnemyDistance > 80) {
    addNormalized(move, target.x - player.x, target.y - player.y, 1.35)
  } else {
    const centerDistance = Math.hypot(ARENA_CENTER.x - player.x, ARENA_CENTER.y - player.y)
    if (centerDistance > 380 || enemies.length === 0) {
      addNormalized(move, ARENA_CENTER.x - player.x, ARENA_CENTER.y - player.y, 0.8)
    }
  }

  return move
}

/**
 * Ramasse la ressource la plus proche, mais évite le contact immédiat. Un joueur
 * imprudent court vers l'XP ; il ne continue pas volontairement tout droit dans
 * un ennemi déjà au corps-à-corps.
 */
export function greedyMove(player: Vec2, enemies: readonly Vec2[], pickups: readonly Vec2[]): Vec2 {
  const targets = pickups.length > 0 ? pickups : enemies
  let target: Vec2 | null = null
  let targetDistanceSq = Infinity
  for (const candidate of targets) {
    const distanceSq = (candidate.x - player.x) ** 2 + (candidate.y - player.y) ** 2
    if (distanceSq < targetDistanceSq) {
      target = candidate
      targetDistanceSq = distanceSq
    }
  }

  const move: Vec2 = { x: 0, y: 0 }
  if (target !== null) {
    addNormalized(move, target.x - player.x, target.y - player.y, 1)
  }
  for (const enemy of enemies) {
    const dx = player.x - enemy.x
    const dy = player.y - enemy.y
    const distance = Math.hypot(dx, dy)
    if (distance < GREEDY_PANIC_RADIUS) {
      const pressure = (GREEDY_PANIC_RADIUS - distance) / GREEDY_PANIC_RADIUS
      addNormalized(move, dx, dy, 1.05 + pressure * 0.7)
    }
  }
  return move
}

/** Vecteur de déplacement du bot pour la frame courante. */
export function botMove(bot: BotName, s: GameState): Vec2 {
  const p = s.players[0]
  if (p === undefined || bot === 'idle') {
    return { x: 0, y: 0 }
  }
  if (bot === 'active') {
    return activeMove(p, s.enemies, s.pickups)
  }
  if (bot === 'greedy') {
    return greedyMove(p, s.enemies, s.pickups)
  }
  // kite : fuit l'ennemi le plus proche, se recentre près des bords.
  let nx = 0
  let ny = 0
  let bd = Infinity
  for (const e of s.enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
    if (d < bd) {
      bd = d
      nx = p.x - e.x
      ny = p.y - e.y
    }
  }
  const cx = ARENA_CENTER.x - p.x
  const cy = ARENA_CENTER.y - p.y
  const edge = Math.hypot(cx, cy) > 500 ? 2 : 0
  return { x: nx + cx * edge, y: ny + cy * edge }
}
