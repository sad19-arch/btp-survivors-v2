/**
 * Système hazard : gère les flaques au sol (kind `hazard`, ex. goudron).
 *
 * Chaque frame :
 *   - décrémente `lifeMs` ; si ≤ 0 → despawn de l'entité.
 *   - décrémente `tickLeftMs` ; si ≤ 0 → inflige `damagePerTick` à tous les
 *     ennemis vivants dans le `radius`, puis recharge `tickLeftMs`.
 *
 * Déterministe : aucun aléa (aucun `Math.random`, aucun `Date`).
 * Séparation sim/rendu respectée : aucun import Phaser/DOM.
 */

import type { World } from '../world'
import type { EntityId } from '../types'
import type { SpatialGrid } from '../spatialGrid'
import { damageEnemiesInRadius } from './weapon'

/**
 * Avance tous les hazards actifs de `dtMs` millisecondes.
 *
 * @param world  Le World ECS courant.
 * @param dtMs   Pas de temps (ms).
 * @param grid   Index spatial des ennemis (optionnel — repli linéaire si absent).
 */
export function hazardSystem(world: World, dtMs: number, grid?: SpatialGrid): void {
  const expired: EntityId[] = []

  for (const e of world.query('hazard', 'position')) {
    const haz = world.get(e, 'hazard')
    const pos = world.get(e, 'position')
    if (haz === undefined || pos === undefined) {
      continue
    }

    // Durée de vie.
    haz.lifeMs -= dtMs
    if (haz.lifeMs <= 0) {
      expired.push(e)
      continue
    }

    // Tick de dégâts.
    haz.tickLeftMs -= dtMs
    // Un seul despawner par pas : si tickMs est très court, un seul tick par
    // appel (comportement conservateur, cohérent avec les autres systèmes).
    // Pour couvrir plusieurs ticks dans un grand dtMs, on boucle.
    while (haz.tickLeftMs < 0) {
      haz.tickLeftMs += haz.tickMs
      damageEnemiesInRadius(world, pos, haz.radius, haz.damagePerTick, grid)
    }
  }

  for (const e of expired) {
    world.despawn(e)
  }
}
