import type { World } from '../world'
import type { Rng } from '../rng'
import type { Vec2 } from '../types'
import type { ConstructionPhase } from '@content/phases'
import { phasePoolIds } from '@content/phases'
import { ENEMIES } from '@content/enemies'
import type { EnemyDef } from '@content/enemies'
import { SPAWN } from '@content/config'
import type { DifficultyScale } from '@content/spawnRamp'

/** Aucun renforcement (boss / défaut). */
const NO_SCALE: DifficultyScale = { hp: 1, contactDamage: 1, speed: 1 }

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
  count: number,
  scale: DifficultyScale = NO_SCALE
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
    spawnEnemy(
      world,
      def,
      {
        x: center.x + Math.cos(angle) * SPAWN.ringRadius,
        y: center.y + Math.sin(angle) * SPAWN.ringRadius
      },
      false,
      scale
    )
  }
}

/** Invoque un ennemi spécifique (ex. mini-boss) à un angle donné, sur l'anneau. */
export function spawnBoss(world: World, def: EnemyDef, center: Vec2, angle: number): void {
  spawnEnemy(
    world,
    def,
    {
      x: center.x + Math.cos(angle) * SPAWN.ringRadius,
      y: center.y + Math.sin(angle) * SPAWN.ringRadius
    },
    true
  )
}

/** Fabrique une entité ennemie à partir d'une définition, avec renforcement temporel. */
function spawnEnemy(world: World, def: EnemyDef, pos: Vec2, isBoss = false, scale: DifficultyScale = NO_SCALE): void {
  const hp = Math.round(def.hp * scale.hp)
  const e = world.spawn()
  world.add(e, 'position', { x: pos.x, y: pos.y })
  world.add(e, 'velocity', { x: 0, y: 0 })
  world.add(e, 'health', { hp, maxHp: hp })
  world.add(e, 'enemy', {
    type: def.id,
    speed: def.speed * scale.speed,
    isElite: def.archetype === 'elite',
    isBoss,
    contactDamage: def.contactDamage * scale.contactDamage,
    xpValue: def.xpValue
  })
}
