import type { World } from '../world'
import { WORLD } from '@content/config'

const OUT_OF_BOUNDS_MARGIN = 50

/**
 * Gère la durée de vie des projectiles : décrémente `lifeMs` et supprime ceux
 * expirés ou sortis des limites du monde (avec une marge).
 */
export function projectileLifetimeSystem(world: World, dtMs: number): void {
  const toRemove: number[] = []
  for (const e of world.query('projectile', 'position')) {
    const proj = world.get(e, 'projectile')
    const pos = world.get(e, 'position')
    if (proj === undefined || pos === undefined) {
      continue
    }
    proj.lifeMs -= dtMs
    const outOfBounds =
      pos.x < -OUT_OF_BOUNDS_MARGIN ||
      pos.y < -OUT_OF_BOUNDS_MARGIN ||
      pos.x > WORLD.width + OUT_OF_BOUNDS_MARGIN ||
      pos.y > WORLD.height + OUT_OF_BOUNDS_MARGIN
    if (proj.lifeMs <= 0 || outOfBounds) {
      toRemove.push(e)
    }
  }
  for (const e of toRemove) {
    world.despawn(e)
  }
}
