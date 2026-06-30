import type { World } from '../world'
import type { Rng } from '../rng'
import type { Vec2 } from '../types'
import type { ConstructionPhase } from '@content/phases'
import { phasePoolIds } from '@content/phases'
import { ENEMIES } from '@content/enemies'
import { SPAWN } from '@content/config'

/**
 * Fait apparaître une vague d'ennemis autour d'un centre, sur un anneau
 * (hors écran). Le type est tiré du pool de la phase courante via le RNG seedé
 * → spawns reproductibles à la seed près.
 */
export function spawnWave(
  world: World,
  rng: Rng,
  phase: ConstructionPhase,
  center: Vec2,
  count: number
): void {
  const pool = phasePoolIds(phase)
  if (pool.length === 0) {
    return
  }

  for (let i = 0; i < count; i++) {
    const id = rng.pick(pool)
    const def = ENEMIES[id]
    if (def === undefined) {
      continue
    }
    const angle = rng.float(0, Math.PI * 2)
    const x = center.x + Math.cos(angle) * SPAWN.ringRadius
    const y = center.y + Math.sin(angle) * SPAWN.ringRadius

    const e = world.spawn()
    world.add(e, 'position', { x, y })
    world.add(e, 'velocity', { x: 0, y: 0 })
    world.add(e, 'health', { hp: def.hp, maxHp: def.hp })
    world.add(e, 'enemy', {
      type: def.id,
      speed: def.speed,
      isElite: false,
      isBoss: false,
      contactDamage: def.contactDamage
    })
  }
}
