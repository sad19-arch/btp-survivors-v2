import type { World } from '../world'

/**
 * Système de mouvement : `position += velocity * dt`.
 *
 * Vélocité en px/seconde, `dtMs` en millisecondes. Fonction pure sur le World
 * (aucun aléa, aucun temps réel) → déterministe et testable sans navigateur.
 */
export function movementSystem(world: World, dtMs: number): void {
  const dtSeconds = dtMs / 1000
  for (const e of world.query('position', 'velocity')) {
    const pos = world.get(e, 'position')
    const vel = world.get(e, 'velocity')
    if (pos === undefined || vel === undefined) {
      continue
    }
    pos.x += vel.x * dtSeconds
    pos.y += vel.y * dtSeconds
  }
}
