import type { GameState, Vec2 } from '@core/types'

export type BotName = 'active' | 'kite' | 'greedy' | 'idle'

/** `active` est la référence joueur ; les trois autres sont des stress-tests. */
export const BOT_NAMES: readonly BotName[] = ['active', 'kite', 'greedy', 'idle']

export function isBotName(s: string): s is BotName {
  return (BOT_NAMES as readonly string[]).includes(s)
}

const ARENA_CENTER: Vec2 = { x: 800, y: 600 }
const DANGER_RADIUS = 210
const PICKUP_DANGER_RADIUS = 105

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
    const targets = s.pickups.length > 0 ? s.pickups : s.enemies
    let tx = p.x
    let ty = p.y
    let bd = Infinity
    for (const t of targets) {
      const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2
      if (d < bd) {
        bd = d
        tx = t.x
        ty = t.y
      }
    }
    return { x: tx - p.x, y: ty - p.y }
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
  const cx = 800 - p.x
  const cy = 600 - p.y
  const edge = Math.hypot(cx, cy) > 500 ? 2 : 0
  return { x: nx + cx * edge, y: ny + cy * edge }
}
