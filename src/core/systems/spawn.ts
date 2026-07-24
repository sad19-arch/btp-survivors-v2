import type { World } from '../world'
import type { Rng } from '../rng'
import type { Vec2, EnemyBehavior, WavePlacement } from '../types'
import type { ConstructionPhase } from '@content/phases'
import { phasePoolIds } from '@content/phases'
import { ENEMIES } from '@content/enemies'
import type { EnemyDef } from '@content/enemies'
import { REFERENCE_VIEW, SPAWN } from '@content/config'
import type { DifficultyScale } from '@content/spawnRamp'

/** Aucun renforcement (boss / défaut). */
const NO_SCALE: DifficultyScale = { hp: 1, contactDamage: 1, speed: 1 }

/** Position juste hors du rectangle de référence, quelle que soit la direction. */
export function openingSpawnPosition(center: Vec2, angle: number, margin: number): Vec2 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const toVerticalEdge = Math.abs(cos) < 0.000001 ? Infinity : REFERENCE_VIEW.halfW / Math.abs(cos)
  const toHorizontalEdge = Math.abs(sin) < 0.000001 ? Infinity : REFERENCE_VIEW.halfH / Math.abs(sin)
  const radius = Math.min(toVerticalEdge, toHorizontalEdge) + margin
  return { x: center.x + cos * radius, y: center.y + sin * radius }
}

/** Vague initiale immédiate : uniquement l'archétype standard de la phase. */
export function spawnOpeningWave(
  world: World,
  rng: Rng,
  phase: ConstructionPhase,
  center: Vec2,
  count: number,
  scale: DifficultyScale = NO_SCALE
): void {
  const standardPool = phasePoolIds(phase).filter((id) => ENEMIES[id]?.archetype === 'base')
  if (standardPool.length === 0) {
    return
  }
  for (let i = 0; i < count; i++) {
    const def = ENEMIES[rng.pick(standardPool)]
    if (def !== undefined) {
      const angle = Math.PI / 2 + (i - (count - 1) / 2) * 0.18
      spawnEnemy(world, def, openingSpawnPosition(center, angle, SPAWN.openingMargin), false, scale)
    }
  }
}

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

/**
 * Invoque `count` add autour d'un centre (le boss), sur un anneau de rayon `radius`
 * (à l'écran, autour du boss — pas à l'anneau de spawn lointain). Type tiré du pool
 * de la phase via le RNG passé. Utilisé par `bossSystem` sur franchissement de seuil PV.
 * No-op si le pool de la phase est vide.
 */
export function spawnSummons(
  world: World,
  rng: Rng,
  phase: ConstructionPhase,
  center: Vec2,
  count: number,
  radius: number,
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
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      },
      false,
      scale
    )
  }
}

/**
 * Invoque un ennemi spécifique (ex. mini-boss) à un angle donné.
 * `radius` = distance d'apparition ; par défaut l'anneau de spawn, mais le mini-boss
 * passe un rayon plus court pour apparaître À L'ÉCRAN (combat de climax lisible).
 */
export function spawnBoss(
  world: World,
  def: EnemyDef,
  center: Vec2,
  angle: number,
  radius: number = SPAWN.ringRadius,
  role?: 'mid' | 'final',
  scale: DifficultyScale = NO_SCALE
): void {
  spawnEnemy(
    world,
    def,
    {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    },
    true,
    scale,
    role
  )
}

/** Paramètres d'init optionnels pour surcharger le comportement au spawn
 *  (utilisé par le directeur de vague pour les comportements spéciaux). */
export interface SpawnInit {
  behavior?: EnemyBehavior
  bPhase?: number
  bAngle?: number
  /** Marque l'ennemi comme porteur de coffre (drop garanti à la mort). */
  chestBearer?: boolean
}

/**
 * Fait apparaître un groupe d'ennemis positionnés précisément selon des `WavePlacement`.
 * Contrairement à `spawnWave` (anneau aléatoire), les positions sont déterminées par le
 * contrôleur (directeur de vagues, Task 8) — le RNG n'est utilisé que pour tirer le type.
 *
 * `rng` doit être le flux `waveRng` dédié, isolé du flux de spawn normal, pour que les
 * appels du directeur ne décalent pas la séquence de spawn des vagues ordinaires.
 */
export function spawnGroup(
  world: World,
  rng: Rng,
  phase: ConstructionPhase,
  center: Vec2,
  placements: readonly WavePlacement[],
  scale: DifficultyScale = NO_SCALE
): void {
  const pool = phasePoolIds(phase)
  if (pool.length === 0) {
    return
  }

  for (const placement of placements) {
    const rolePool = placement.role === undefined ? pool : (phase.enemyPools[placement.role] ?? [])
    if (rolePool.length === 0) {
      continue
    }
    const id = rng.pick(rolePool)
    const def = ENEMIES[id]
    if (def === undefined) {
      continue
    }
    const pos: Vec2 = {
      x: center.x + Math.cos(placement.angle) * placement.radius,
      y: center.y + Math.sin(placement.angle) * placement.radius
    }
    const init: SpawnInit = {
      behavior: placement.behavior,
      bPhase: rng.float(0, Math.PI * 2),
      ...(placement.bAngle !== undefined ? { bAngle: placement.bAngle } : {})
    }
    spawnEnemy(world, def, pos, false, scale, undefined, init)
  }
}

/**
 * Fabrique une entité ennemie à partir d'une définition, avec renforcement temporel.
 * Exportée pour permettre les tests unitaires et le directeur de vague.
 *
 * `init` permet de surcharger `behavior`, `bPhase`, `bAngle` après résolution
 * du défaut `def.behavior ?? 'chase'`.
 */
export function spawnEnemy(
  world: World,
  def: EnemyDef,
  pos: Vec2,
  isBoss = false,
  scale: DifficultyScale = NO_SCALE,
  bossRole?: 'mid' | 'final',
  init?: SpawnInit
): void {
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
    knockbackMult: enemyKnockbackMult(def, isBoss),
    ...(init?.chestBearer === true ? { chestBearer: true } : {}),
    ...(bossRole !== undefined ? { bossRole } : {}),
    contactDamage: def.contactDamage * scale.contactDamage,
    xpValue: def.xpValue,
    behavior: init?.behavior ?? def.behavior ?? 'chase',
    ...(init?.bPhase !== undefined ? { bPhase: init.bPhase } : {}),
    ...(init?.bAngle !== undefined ? { bAngle: init.bAngle } : {})
  })
}

/** Résistance physique commune à tous les re-skins d'un même archétype. */
function enemyKnockbackMult(def: EnemyDef, isBoss: boolean): number {
  if (isBoss) {
    return 0.12
  }
  switch (def.archetype) {
    case 'swarm': return 1.45
    case 'fast': return 1.1
    case 'tank': return 0.55
    case 'charger': return 0.75
    case 'elite': return 0.35
    default: return 1
  }
}
