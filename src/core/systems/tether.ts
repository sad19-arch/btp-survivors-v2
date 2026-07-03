import type { World } from '../world'

/**
 * Système de laisse souple (« tether ») coop : empêche les joueurs de trop
 * s'éloigner les uns des autres en annulant la composante radiale SORTANTE
 * de leur vélocité au-delà d'un rayon max autour du centroïde du groupe.
 *
 * Ce n'est PAS un ressort (aucune force n'est ajoutée) : le joueur peut
 * toujours glisser tangentiellement ou revenir vers le centre librement ;
 * seule la fuite au-delà du rayon est bridée. Mutate `velocity` en place,
 * AVANT `movementSystem` (la vélocité annulée est celle réellement appliquée
 * ce tick).
 *
 * No-op strict si `playerCount <= 1` (solo) → `sim:check` reste diff 0.
 *
 * Fonction pure sur le World (aucun aléa, aucun temps réel) → déterministe et
 * testable sans navigateur.
 */
export function tetherSystem(world: World, playerCount: number, maxRadius: number): void {
  if (playerCount <= 1) {
    return
  }

  let sx = 0
  let sy = 0
  let n = 0
  for (const e of world.query('player', 'position', 'health')) {
    const pos = world.get(e, 'position')
    const health = world.get(e, 'health')
    if (pos === undefined || health === undefined || health.hp <= 0) {
      continue
    }
    sx += pos.x
    sy += pos.y
    n += 1
  }
  if (n === 0) {
    return
  }
  const cx = sx / n
  const cy = sy / n

  for (const e of world.query('player', 'position', 'velocity', 'health')) {
    const pos = world.get(e, 'position')
    const vel = world.get(e, 'velocity')
    const health = world.get(e, 'health')
    if (pos === undefined || vel === undefined || health === undefined || health.hp <= 0) {
      continue
    }
    const dx = pos.x - cx
    const dy = pos.y - cy
    const d = Math.hypot(dx, dy)
    if (d === 0 || d <= maxRadius) {
      continue
    }
    const rx = dx / d
    const ry = dy / d
    const outward = vel.x * rx + vel.y * ry
    if (outward > 0) {
      vel.x -= outward * rx
      vel.y -= outward * ry
    }
  }
}
