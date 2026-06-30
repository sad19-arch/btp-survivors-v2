import type { GameState, Vec2 } from '@core/types'

export type BotName = 'kite' | 'greedy' | 'idle'

export const BOT_NAMES: readonly BotName[] = ['kite', 'greedy', 'idle']

export function isBotName(s: string): s is BotName {
  return (BOT_NAMES as readonly string[]).includes(s)
}

/** Vecteur de déplacement du bot pour la frame courante. */
export function botMove(bot: BotName, s: GameState): Vec2 {
  const p = s.players[0]
  if (p === undefined || bot === 'idle') {
    return { x: 0, y: 0 }
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
