import type { World } from '../world'

/**
 * Règle de fin de partie : vrai s'il existe au moins un joueur et qu'aucun
 * n'est vivant. Faux s'il n'y a aucun joueur (partie non commencée).
 */
export function allPlayersDead(world: World): boolean {
  let anyPlayer = false
  let anyAlive = false
  for (const e of world.query('player', 'health')) {
    const health = world.get(e, 'health')
    if (health === undefined) {
      continue
    }
    anyPlayer = true
    if (health.hp > 0) {
      anyAlive = true
    }
  }
  return anyPlayer && !anyAlive
}
