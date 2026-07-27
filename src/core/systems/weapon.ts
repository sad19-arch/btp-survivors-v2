import type { World } from '../world'
import type { EntityId, PassiveDebugMetric, PlayerComp, Vec2, WeaponSlot } from '../types'
import type { AuraPulse } from '../events'
import type { WeaponDef } from '@content/weapons'
import type { EffectiveStats } from '@content/effectiveStats'
import { WEAPONS, weaponStatsAtLevel } from '@content/weapons'
import { effectiveWeaponStats } from '@content/effectiveStats'
import { BASE_STATS, signaturePassiveEffects, utilityPassiveEffects } from '@content/passives'
import { CONE_HALF_ANGLE, HITBOX } from '@content/config'
import { Rng } from '../rng'
import type { SpatialGrid } from '../spatialGrid'
import { applyEnemyHit } from './knockback'

const MAX_ORBITAL_IMPACT_PULSES_PER_STEP = 12
const DIAMOND_REIMPACT_DELAY_MS = 120

/**
 * Système d'armes : chaque arme du joueur agit automatiquement selon son `kind`.
 *  - projectile : tire vers l'ennemi vivant le plus proche, à la cadence du cooldown.
 *  - aura       : impulsion de dégâts circulaire autour du joueur.
 *  - orbital    : lames qui tournent autour du joueur et frappent au contact.
 *  - sweep      : balayage frontal en secteur (pied-de-biche).
 *  - strike     : frappe des ennemis choisis au hasard (court-circuit).
 *
 * Les stats effectives (`EffectiveStats`) résultent du niveau de l'arme combiné
 * aux stats agrégées du joueur (`stats`, dérivées des passifs). Déterministe :
 * le seul aléa (kind `strike`) passe par le `Rng` fourni en dernier paramètre.
 * La mort des ennemis est récoltée par `reapDeadEnemies`.
 */
export function weaponSystem(
  world: World,
  dtMs: number,
  pulses?: AuraPulse[],
  fired?: string[],
  rng?: Rng,
  grid?: SpatialGrid,
  passiveMetrics?: PassiveDebugMetric[]
): void {
  despawnOrphanOrbiters(world)

  for (const e of world.query('player', 'position', 'weapons', 'health')) {
    const health = world.get(e, 'health')
    const pos = world.get(e, 'position')
    const loadout = world.get(e, 'weapons')
    const player = world.get(e, 'player')
    if (health === undefined || pos === undefined || loadout === undefined || player === undefined) {
      continue
    }
    if (health.hp <= 0) {
      continue
    }
    const stats = world.get(e, 'stats') ?? BASE_STATS
    const ownedPassives = world.get(e, 'passives')?.list ?? []
    const signatureEffects = signaturePassiveEffects(ownedPassives)
    const utilityEffects = utilityPassiveEffects(ownedPassives)
    const velocity = world.get(e, 'velocity')
    const moving = velocity !== undefined && Math.hypot(velocity.x, velocity.y) > 1e-6

    for (const slot of loadout.slots) {
      processDelayedImpacts(world, slot, dtMs, pulses, passiveMetrics)
      const def = WEAPONS[slot.id]
      if (def === undefined) {
        continue
      }
      const lvl = weaponStatsAtLevel(def, slot.level)
      const baseEffective = effectiveWeaponStats(lvl, stats)
      const disqueCompatible = def.passiveTags?.includes('contact') ?? false
      const explosive = def.passiveTags?.includes('explosive') ?? false
      const heavy = def.passiveTags?.includes('heavy') ?? false
      const eff: EffectiveStats = {
        ...baseEffective,
        area: disqueCompatible && def.kind === 'sweep'
          ? baseEffective.area * signatureEffects.contactSizeScale
          : baseEffective.area,
        orbitHitRadius: disqueCompatible && def.kind === 'orbital'
          ? baseEffective.orbitHitRadius * signatureEffects.contactSizeScale
          : baseEffective.orbitHitRadius,
        explosionRadius: explosive
          ? baseEffective.explosionRadius * signatureEffects.explosionScale
          : baseEffective.explosionRadius,
        projectileLifeMs: def.kind === 'projectile'
          ? baseEffective.projectileLifeMs * utilityEffects.projectileRangeScale
          : baseEffective.projectileLifeMs
      }
      const cdBefore = slot.cooldownLeftMs
      switch (def.kind) {
        case 'projectile':
          tickProjectile(
            world,
            slot,
            def,
            eff,
            pos,
            player,
            dtMs,
            explosive && signatureEffects.secondaryExplosions,
            heavy ? signatureEffects.heavyImpactThreshold : Number.POSITIVE_INFINITY,
            heavy ? signatureEffects.heavyImpactHaste : 0,
            passiveMetrics,
            signatureEffects.surchargeLevel,
            signatureEffects.compresseurLevel
          )
          break
        case 'aura':
          tickAura(
            slot,
            eff,
            pos,
            dtMs,
            world,
            def.kind,
            def.knockback,
            heavy ? signatureEffects.heavyImpactThreshold : Number.POSITIVE_INFINITY,
            heavy ? signatureEffects.heavyImpactHaste : 0,
            passiveMetrics,
            signatureEffects.compresseurLevel,
            def.id,
            pulses,
            grid,
            player.playerId
          )
          break
        case 'orbital':
          tickOrbital(
            world,
            slot,
            def,
            eff,
            e,
            pos,
            player,
            dtMs,
            disqueCompatible ? signatureEffects.contactKnockbackScale : 1,
            disqueCompatible && signatureEffects.contactReimpact,
            signatureEffects.disqueLevel,
            pulses,
            grid,
            passiveMetrics
          )
          break
        case 'sweep':
          tickSweep(
            slot,
            eff,
            pos,
            player,
            dtMs,
            world,
            def.kind,
            def.id,
            def.knockback
              * (disqueCompatible ? signatureEffects.contactKnockbackScale : 1)
              * (disqueCompatible && moving ? utilityEffects.movingSweepKnockbackScale : 1),
            disqueCompatible && signatureEffects.contactReimpact,
            signatureEffects.disqueLevel,
            heavy ? signatureEffects.heavyImpactThreshold : Number.POSITIVE_INFINITY,
            heavy ? signatureEffects.heavyImpactHaste : 0,
            signatureEffects.compresseurLevel,
            pulses,
            grid,
            passiveMetrics
          )
          break
        case 'strike':
          tickStrike(slot, eff, pos, dtMs, world, def.kind, def.knockback, rng, pulses, grid, player.playerId)
          break
        case 'hazard':
          tickHazard(world, slot, def, eff, pos, player.playerId, dtMs, world.get(e, 'velocity'))
          break
        case 'cone':
          tickCone(slot, eff, pos, dtMs, world, def.kind, def.knockback, pulses, grid, player.playerId, def.id)
          break
      }
      // Une arme qui vient de TIRER ce pas a rechargé son cooldown (valeur > celle
      // d'avant le tick) → on émet weaponFired(id) pour l'audio (SFX par arme).
      // La scie (orbital) émet aussi désormais, MAIS sa cadence sonore est bornée
      // côté rendu (throttle dédié) → « whir » périodique discret, pas un drone.
      // Émission d'événement uniquement : aucun état de simulation modifié.
      if (slot.cooldownLeftMs > cdBefore) {
        fired?.push(def.id)
      }
    }
  }
}

interface CooldownSlot {
  cooldownLeftMs: number
}

function scheduleDelayedImpact(
  slot: WeaponSlot,
  targetId: EntityId,
  damage: number,
  knockback: number,
  ownerId: number,
  weaponId: string,
  radius: number,
  passiveLevel: number
): void {
  const pending = slot.pendingImpacts ?? (slot.pendingImpacts = [])
  if (pending.some((impact) => impact.targetId === targetId)) {
    return
  }
  pending.push({
    targetId,
    remainingMs: DIAMOND_REIMPACT_DELAY_MS,
    damage,
    knockback,
    ownerId,
    weaponId,
    radius,
    passiveLevel
  })
}

function processDelayedImpacts(
  world: World,
  slot: WeaponSlot,
  dtMs: number,
  pulses?: AuraPulse[],
  passiveMetrics?: PassiveDebugMetric[]
): void {
  const pending = slot.pendingImpacts
  if (pending === undefined || pending.length === 0) {
    return
  }
  const remaining: NonNullable<WeaponSlot['pendingImpacts']> = []
  for (const impact of pending) {
    impact.remainingMs -= dtMs
    if (impact.remainingMs > 0) {
      remaining.push(impact)
      continue
    }
    const position = world.get(impact.targetId, 'position')
    const health = world.get(impact.targetId, 'health')
    if (position === undefined || health === undefined || health.hp <= 0) {
      continue
    }
    let direction = { x: 0, y: 0 }
    for (const playerEntity of world.query('player', 'position')) {
      const player = world.get(playerEntity, 'player')
      const playerPosition = world.get(playerEntity, 'position')
      if (player?.playerId === impact.ownerId && playerPosition !== undefined) {
        direction = { x: position.x - playerPosition.x, y: position.y - playerPosition.y }
        break
      }
    }
    applyEnemyHit(world, impact.targetId, impact.damage, {
      ownerId: impact.ownerId,
      knockback: impact.knockback,
      direction
    })
    pulses?.push({
      x: position.x,
      y: position.y,
      radius: impact.radius,
      kind: 'passive_reimpact',
      weaponId: impact.weaponId,
      ownerId: impact.ownerId
    })
    passiveMetrics?.push({
      passive_triggered: true,
      passive_id: 'disque_diamant',
      passive_level: impact.passiveLevel,
      weapon_id: impact.weaponId,
      enemies_hit: 1,
      modified_radius: impact.radius,
      knockback_applied: impact.knockback
    })
  }
  slot.pendingImpacts = remaining
}

function applyImmediateHeavyHaste(
  slot: WeaponSlot,
  hits: number,
  threshold: number,
  haste: number,
  passiveMetrics: PassiveDebugMetric[] | undefined,
  passiveLevel: number,
  weaponId: string,
  baseCooldownMs: number
): boolean {
  if (hits < threshold || haste <= 0) {
    return false
  }
  const before = slot.cooldownLeftMs
  slot.cooldownLeftMs *= 1 - haste
  passiveMetrics?.push({
    passive_triggered: true,
    passive_id: 'compresseur_pneumatique',
    passive_level: passiveLevel,
    weapon_id: weaponId,
    enemies_hit: hits,
    base_cooldown: baseCooldownMs,
    modified_cooldown: slot.cooldownLeftMs
  })
  // Garde défensive : aucune réduction ne doit augmenter un cooldown corrompu.
  if (slot.cooldownLeftMs > before) {
    slot.cooldownLeftMs = before
  }
  return true
}

function recordExplosionScale(
  passiveMetrics: PassiveDebugMetric[] | undefined,
  weaponId: string,
  passiveLevel: number,
  baseRadius: number,
  modifiedRadius: number
): void {
  if (passiveLevel <= 0 || modifiedRadius <= 0) {
    return
  }
  passiveMetrics?.push({
    passive_triggered: true,
    passive_id: 'surcharge_gaz',
    passive_level: passiveLevel,
    weapon_id: weaponId,
    enemies_hit: 0,
    base_radius: baseRadius,
    modified_radius: modifiedRadius,
    secondary_explosions_created: 0
  })
}

// --- projectile ------------------------------------------------------------

function tickProjectile(
  world: World,
  slot: WeaponSlot,
  def: WeaponDef,
  eff: EffectiveStats,
  pos: Vec2,
  player: PlayerComp,
  dtMs: number,
  secondaryExplosionOnCenterKill: boolean,
  heavyImpactThreshold: number,
  heavyImpactHaste: number,
  passiveMetrics: PassiveDebugMetric[] | undefined,
  surchargeLevel: number,
  compresseurLevel: number
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  if (def.aim === 'facing') {
    // Visée MANUELLE (ex. bonbonne_chantier) : pas de recherche de cible, tir
    // INCONDITIONNEL sur cooldown — contrairement à l'auto-aim, ne dépend pas de la
    // présence d'un ennemi (le joueur contrôle la direction, il doit pouvoir tirer
    // « à vide » pour se repositionner). Cible virtuelle loin dans `player.facing` :
    // réutilise `fireProjectiles` tel quel (le fan-spread ne connaît qu'un angle).
    const dir = player.facing ?? { x: 0, y: 1 }
    const virtualTarget: Vec2 = { x: pos.x + dir.x * 1000, y: pos.y + dir.y * 1000 }
    const heavyImpactAttackId = beginHeavyProjectileAttack(slot, heavyImpactThreshold, heavyImpactHaste)
    fireProjectiles(
      world,
      pos,
      virtualTarget,
      def,
      eff,
      player.playerId,
      secondaryExplosionOnCenterKill,
      heavyImpactThreshold,
      heavyImpactHaste,
      compresseurLevel,
      heavyImpactAttackId
    )
    slot.cooldownLeftMs = eff.cooldownMs
    recordExplosionScale(passiveMetrics, def.id, surchargeLevel, weaponStatsAtLevel(def, slot.level).explosionRadius ?? 0, eff.explosionRadius)
    return
  }
  const target = findNearestEnemy(world, pos, Infinity)
  if (target === null) {
    slot.cooldownLeftMs = 0 // prêt à tirer dès qu'une cible entre en portée
    return
  }
  const heavyImpactAttackId = beginHeavyProjectileAttack(slot, heavyImpactThreshold, heavyImpactHaste)
  fireProjectiles(
    world,
    pos,
    target,
    def,
    eff,
    player.playerId,
    secondaryExplosionOnCenterKill,
    heavyImpactThreshold,
    heavyImpactHaste,
    compresseurLevel,
    heavyImpactAttackId
  )
  slot.cooldownLeftMs = eff.cooldownMs
  recordExplosionScale(passiveMetrics, def.id, surchargeLevel, weaponStatsAtLevel(def, slot.level).explosionRadius ?? 0, eff.explosionRadius)
}

function beginHeavyProjectileAttack(
  slot: WeaponSlot,
  threshold: number,
  haste: number
): number | undefined {
  if (!Number.isFinite(threshold) || haste <= 0) {
    return undefined
  }
  slot.heavyImpactAttackSequence = (slot.heavyImpactAttackSequence ?? 0) + 1
  return slot.heavyImpactAttackSequence
}

// Reste linéaire volontairement : s'exécute à la cadence de l'arme (cooldown),
// pas par frame ni par projectile — coût négligeable, la grille n'apporterait rien ici.
function findNearestEnemy(world: World, from: Vec2, range: number): Vec2 | null {
  let best: Vec2 | null = null
  let bestDist = range * range
  for (const e of world.query('enemy', 'position', 'health')) {
    const pos = world.get(e, 'position')
    const health = world.get(e, 'health')
    if (pos === undefined || health === undefined || health.hp <= 0) {
      continue
    }
    const d = (pos.x - from.x) ** 2 + (pos.y - from.y) ** 2
    if (d <= bestDist) {
      bestDist = d
      best = { x: pos.x, y: pos.y }
    }
  }
  return best
}

/** Tire `eff.count` projectiles en éventail vers la cible (spread lisible). */
function fireProjectiles(
  world: World,
  from: Vec2,
  target: Vec2,
  def: WeaponDef,
  eff: EffectiveStats,
  ownerId: number,
  secondaryExplosionOnCenterKill: boolean,
  heavyImpactThreshold: number,
  heavyImpactHaste: number,
  compresseurLevel: number,
  heavyImpactAttackId: number | undefined
): void {
  const dx = target.x - from.x
  const dy = target.y - from.y
  const len = Math.hypot(dx, dy)
  const baseAngle = len === 0 ? 0 : Math.atan2(dy, dx)
  const speed = eff.projectileSpeed > 0 ? eff.projectileSpeed : 500
  const life = eff.projectileLifeMs > 0 ? eff.projectileLifeMs : 1000
  const count = Math.max(1, Math.round(eff.count))

  const spreadStep = 0.12 // rad entre projectiles adjacents de l'éventail
  const startOffset = -((count - 1) / 2) * spreadStep

  for (let i = 0; i < count; i++) {
    const angle = baseAngle + startOffset + i * spreadStep
    const dirX = Math.cos(angle)
    const dirY = Math.sin(angle)

    const e = world.spawn()
    world.add(e, 'position', { x: from.x, y: from.y })
    world.add(e, 'velocity', { x: dirX * speed, y: dirY * speed })
    const hasBounces = eff.bounces > 0
    const boomerangOutMs = eff.boomerangOutMs
    world.add(e, 'projectile', {
      type: def.id,
      damage: eff.damage,
      ownerId,
      lifeMs: life,
      radius: eff.projectileRadius > 0 ? eff.projectileRadius : HITBOX.projectile,
      ...(eff.explosionRadius > 0 ? {
        explosionRadius: eff.explosionRadius,
        explosionDamageMult: eff.explosionDamageMult,
        chainExplosions: eff.chainExplosions,
        chainRange: eff.chainRange,
        ...(secondaryExplosionOnCenterKill ? { secondaryExplosionOnCenterKill: true } : {})
      } : {}),
      ...(Number.isFinite(heavyImpactThreshold) && heavyImpactHaste > 0 ? {
        heavyImpactThreshold,
        heavyImpactHaste,
        heavyImpactPassiveLevel: compresseurLevel,
        heavyImpactBaseCooldownMs: eff.cooldownMs,
        ...(heavyImpactAttackId === undefined ? {} : { heavyImpactAttackId }),
        heavyImpactApplied: false
      } : {}),
      pierce: eff.pierce,
      knockback: def.knockback,
      hitIds: [],
      ...(hasBounces ? { bounces: eff.bounces } : {}),
      ...(boomerangOutMs !== undefined ? { boomerangOutMs, returning: false as const } : {})
    })
  }
}

// --- aura (marteau) --------------------------------------------------------

function tickAura(
  slot: WeaponSlot,
  eff: EffectiveStats,
  pos: Vec2,
  dtMs: number,
  world: World,
  kind: string,
  knockback: number,
  heavyImpactThreshold: number,
  heavyImpactHaste: number,
  passiveMetrics: PassiveDebugMetric[] | undefined,
  compresseurLevel: number,
  weaponId: string,
  pulses?: AuraPulse[],
  grid?: SpatialGrid,
  ownerId?: number
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  slot.cooldownLeftMs = eff.cooldownMs
  const reach = eff.area + HITBOX.enemy
  const hits = damageEnemiesInRadius(world, pos, reach, eff.damage, {
    grid,
    ownerId,
    knockback,
    knockbackOrigin: pos
  })
  const heavyHasteTriggered = applyImmediateHeavyHaste(
    slot,
    hits,
    heavyImpactThreshold,
    heavyImpactHaste,
    passiveMetrics,
    compresseurLevel,
    weaponId,
    eff.cooldownMs
  )
  if (heavyHasteTriggered) {
    pulses?.push({
      x: pos.x,
      y: pos.y,
      radius: Math.max(32, Math.min(eff.area * 0.35, 72)),
      kind: 'passive_heavy_haste',
      weaponId,
      ...(ownerId === undefined ? {} : { ownerId })
    })
  }
  pulses?.push({ x: pos.x, y: pos.y, radius: reach, kind, weaponId })
}

// --- sweep (pied-de-biche) --------------------------------------------------

/** Demi-angle du grand arc frontal : 60°, soit un secteur total de 120°. */
const SWEEP_HALF_ANGLE = Math.PI / 3
const sweepScratch: number[] = []

/**
 * Balayage frontal auto-orienté vers l'ennemi le plus proche. Sans cible, la
 * dernière direction du joueur sert de repli. `count` > 1 répète la passe dans
 * le même secteur, conformément au double coup visuel.
 */
function tickSweep(
  slot: WeaponSlot,
  eff: EffectiveStats,
  pos: Vec2,
  player: PlayerComp,
  dtMs: number,
  world: World,
  kind: string,
  weaponId: string,
  knockback: number,
  contactReimpact: boolean,
  disqueLevel: number,
  heavyImpactThreshold: number,
  heavyImpactHaste: number,
  compresseurLevel: number,
  pulses?: AuraPulse[],
  grid?: SpatialGrid,
  passiveMetrics?: PassiveDebugMetric[]
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  slot.cooldownLeftMs = eff.cooldownMs
  const reach = eff.area + HITBOX.enemy
  const passes = Math.max(1, Math.round(eff.count))
  const target = findNearestEnemy(world, pos, Infinity)
  const direction = target === null
    ? (player.facing ?? { x: 0, y: 1 })
    : { x: target.x - pos.x, y: target.y - pos.y }
  const directionLength = Math.hypot(direction.x, direction.y)
  const dirX = directionLength > 0 ? direction.x / directionLength : 0
  const dirY = directionLength > 0 ? direction.y / directionLength : 1
  const uniqueHits = new Set<EntityId>()
  for (let i = 0; i < passes; i++) {
    if (grid !== undefined) {
      sweepScratch.length = 0
      grid.queryCircle(pos.x, pos.y, reach, sweepScratch)
      for (const enemy of sweepScratch) {
        if (applySweepDamage(world, enemy, pos, reach, dirX, dirY, eff.damage, knockback, player.playerId)) {
          uniqueHits.add(enemy)
        }
      }
    } else {
      for (const enemy of world.query('enemy', 'position', 'health')) {
        if (applySweepDamage(world, enemy, pos, reach, dirX, dirY, eff.damage, knockback, player.playerId)) {
          uniqueHits.add(enemy)
        }
      }
    }
  }
  if (contactReimpact) {
    for (const enemy of uniqueHits) {
      scheduleDelayedImpact(slot, enemy, eff.damage, knockback, player.playerId, weaponId, reach, disqueLevel)
    }
  }
  if (disqueLevel > 0 && uniqueHits.size > 0) {
    passiveMetrics?.push({
      passive_triggered: true,
      passive_id: 'disque_diamant',
      passive_level: disqueLevel,
      weapon_id: weaponId,
      enemies_hit: uniqueHits.size,
      modified_radius: reach,
      knockback_applied: knockback
    })
  }
  const heavyHasteTriggered = applyImmediateHeavyHaste(
    slot,
    uniqueHits.size,
    heavyImpactThreshold,
    heavyImpactHaste,
    passiveMetrics,
    compresseurLevel,
    weaponId,
    eff.cooldownMs
  )
  if (heavyHasteTriggered) {
    pulses?.push({
      x: pos.x,
      y: pos.y,
      radius: Math.max(32, Math.min(reach * 0.35, 72)),
      kind: 'passive_heavy_haste',
      weaponId,
      ownerId: player.playerId
    })
  }
  pulses?.push({ x: pos.x, y: pos.y, radius: reach, kind, dirX, dirY, weaponId })
}

function applySweepDamage(
  world: World,
  enemy: EntityId,
  origin: Vec2,
  reach: number,
  dirX: number,
  dirY: number,
  damage: number,
  knockback: number,
  ownerId: number
): boolean {
  const position = world.get(enemy, 'position')
  const health = world.get(enemy, 'health')
  if (position === undefined || health === undefined || health.hp <= 0) {
    return false
  }
  const dx = position.x - origin.x
  const dy = position.y - origin.y
  const distanceSquared = dx * dx + dy * dy
  if (distanceSquared > reach * reach) {
    return false
  }
  const distance = Math.sqrt(distanceSquared)
  const inSector =
    distance === 0 ||
    dirX * (dx / distance) + dirY * (dy / distance) >= Math.cos(SWEEP_HALF_ANGLE)
  if (!inSector) {
    return false
  }
  applyEnemyHit(world, enemy, damage, {
    ownerId,
    knockback,
    direction: distance > 0 ? { x: dx / distance, y: dy / distance } : { x: dirX, y: dirY }
  })
  return true
}

// --- strike (court-circuit) -------------------------------------------------

/**
 * Choisit `n` ennemis vivants. Avec un `rng`, tirage uniforme sans remise
 * (déterministe par seed). Sans `rng`, repli déterministe sur les `n` ennemis
 * les plus proches de l'origine (0,0) — pas de crash si appelé sans rng.
 */
function findRandomEnemies(world: World, rng: Rng | undefined, n: number): EntityId[] {
  const alive: EntityId[] = []
  for (const e of world.query('enemy', 'position', 'health')) {
    const health = world.get(e, 'health')
    if (health !== undefined && health.hp > 0) {
      alive.push(e)
    }
  }
  if (alive.length <= n) {
    return alive
  }
  if (rng === undefined) {
    // Repli déterministe : les n premiers dans l'ordre d'itération du World.
    return alive.slice(0, n)
  }
  // Tirage uniforme sans remise (Fisher-Yates partiel).
  const pool = [...alive]
  const picked: EntityId[] = []
  for (let i = 0; i < n; i++) {
    const idx = rng.int(0, pool.length - 1)
    const item = pool[idx] as EntityId
    picked.push(item)
    pool[idx] = pool[pool.length - 1] as EntityId
    pool.pop()
  }
  return picked
}

function tickStrike(
  slot: CooldownSlot,
  eff: EffectiveStats,
  origin: Vec2,
  dtMs: number,
  world: World,
  kind: string,
  knockback: number,
  rng?: Rng,
  pulses?: AuraPulse[],
  grid?: SpatialGrid,
  ownerId?: number
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  slot.cooldownLeftMs = eff.cooldownMs
  const n = Math.max(1, Math.round(eff.count))
  const targets = findRandomEnemies(world, rng, n)
  for (const target of targets) {
    const tpos = world.get(target, 'position')
    if (tpos === undefined) {
      continue
    }
    damageEnemiesInRadius(world, tpos, eff.area, eff.damage, {
      grid,
      ownerId,
      knockback,
      knockbackOrigin: origin
    })
    // Retour visuel : une onde à chaque ennemi frappé (VFX propre = passe DA).
    pulses?.push({
      x: tpos.x,
      y: tpos.y,
      radius: eff.area,
      kind,
      sourceX: origin.x,
      sourceY: origin.y,
      ...(ownerId === undefined ? {} : { ownerId })
    })
  }
}

// --- orbital (scie) --------------------------------------------------------

function tickOrbital(
  world: World,
  slot: WeaponSlot,
  def: WeaponDef,
  eff: EffectiveStats,
  owner: EntityId,
  pos: Vec2,
  player: PlayerComp,
  dtMs: number,
  knockbackScale: number,
  contactReimpact: boolean,
  disqueLevel: number,
  pulses?: AuraPulse[],
  grid?: SpatialGrid,
  passiveMetrics?: PassiveDebugMetric[]
): void {
  const count = Math.max(1, Math.round(eff.count))
  const radius = eff.orbitRadius > 0 ? eff.orbitRadius : 60
  const hitRadius = eff.orbitHitRadius > 0 ? eff.orbitHitRadius : 16
  const orbitSpeed = eff.orbitSpeed > 0 ? eff.orbitSpeed : 3

  ensureOrbiters(world, owner, player.playerId, def.id, count, radius, hitRadius)

  // Avance la rotation et repositionne les lames.
  const dt = dtMs / 1000
  const blades: Vec2[] = []
  for (const o of world.query('orbiter', 'position')) {
    const orb = world.get(o, 'orbiter')
    const opos = world.get(o, 'position')
    if (orb === undefined || opos === undefined || orb.ownerId !== player.playerId || orb.weaponId !== def.id) {
      continue
    }
    orb.angle += orbitSpeed * dt
    opos.x = pos.x + Math.cos(orb.angle) * orb.radius
    opos.y = pos.y + Math.sin(orb.angle) * orb.radius
    blades.push({ x: opos.x, y: opos.y })
  }

  // Cadence des dégâts.
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  slot.cooldownLeftMs = eff.cooldownMs
  const uniqueHits = new Set<EntityId>()
  for (const b of blades) {
    damageEnemiesInRadius(world, b, hitRadius + HITBOX.enemy, eff.damage, {
      grid,
      ownerId: player.playerId,
      knockback: def.knockback * knockbackScale,
      knockbackOrigin: b,
      onHit: (enemyId, enemyPos) => {
        uniqueHits.add(enemyId)
        if (contactReimpact) {
          scheduleDelayedImpact(
            slot,
            enemyId,
            eff.damage,
            def.knockback * knockbackScale,
            player.playerId,
            def.id,
            hitRadius,
            disqueLevel
          )
        }
        if (
          pulses !== undefined
          && pulses.reduce((count, pulse) => count + (pulse.kind === 'orbital_hit' ? 1 : 0), 0)
            < MAX_ORBITAL_IMPACT_PULSES_PER_STEP
        ) {
          pulses.push({
            x: enemyPos.x,
            y: enemyPos.y,
            radius: hitRadius,
            kind: 'orbital_hit',
            weaponId: def.id,
            ownerId: player.playerId
          })
        }
      }
    })
  }
  if (disqueLevel > 0 && uniqueHits.size > 0) {
    passiveMetrics?.push({
      passive_triggered: true,
      passive_id: 'disque_diamant',
      passive_level: disqueLevel,
      weapon_id: def.id,
      enemies_hit: uniqueHits.size,
      modified_radius: hitRadius,
      knockback_applied: def.knockback * knockbackScale
    })
  }
}

/** Crée les lames manquantes pour cette arme (angles répartis uniformément). */
function ensureOrbiters(
  world: World,
  owner: EntityId,
  ownerId: number,
  weaponId: string,
  count: number,
  radius: number,
  hitRadius: number
): void {
  let existing = 0
  for (const o of world.query('orbiter')) {
    const orb = world.get(o, 'orbiter')
    if (orb !== undefined && orb.ownerId === ownerId && orb.weaponId === weaponId) {
      // Les passifs peuvent changer pendant la run : les lames existantes suivent
      // immédiatement la hitbox réelle, pas seulement celles créées ensuite.
      orb.radius = radius
      orb.hitRadius = hitRadius
      existing += 1
    }
  }
  const ownerPos = world.get(owner, 'position')
  const base = ownerPos ?? { x: 0, y: 0 }
  for (let i = existing; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count
    const e = world.spawn()
    world.add(e, 'orbiter', { ownerId, weaponId, angle, radius, hitRadius })
    world.add(e, 'position', {
      x: base.x + Math.cos(angle) * radius,
      y: base.y + Math.sin(angle) * radius
    })
  }
}

/** Supprime les lames dont le propriétaire n'existe plus ou est mort. */
function despawnOrphanOrbiters(world: World): void {
  const aliveOwners = new Set<number>()
  for (const p of world.query('player', 'health')) {
    const health = world.get(p, 'health')
    const player = world.get(p, 'player')
    if (health !== undefined && player !== undefined && health.hp > 0) {
      aliveOwners.add(player.playerId)
    }
  }
  const orphans: EntityId[] = []
  for (const o of world.query('orbiter')) {
    const orb = world.get(o, 'orbiter')
    if (orb !== undefined && !aliveOwners.has(orb.ownerId)) {
      orphans.push(o)
    }
  }
  for (const o of orphans) {
    world.despawn(o)
  }
}

// --- hazard (goudron) ------------------------------------------------------

/**
 * Pose une (ou plusieurs) flaque(s) de goudron AUTOUR du joueur (jamais sur lui,
 * même à `count = 1`). Chaque flaque est une entité `position` + `hazard` ; les
 * dégâts par tick sont gérés par `hazardSystem`.
 *
 * Placement : décalage radial systématique (`HAZARD_OFFSET_RADIUS`), orienté
 * vers le DÉPLACEMENT du joueur (goudron posé devant lui) ; à l'arrêt, repli
 * vers le bas (orientation par défaut du sprite). `count > 1` : les flaques
 * sont réparties en cercle autour de cette direction de base. Déterministe
 * (fonction pure du monde/vitesse — pas de `Math.random`).
 */
const HAZARD_OFFSET_RADIUS = 64 // px : la flaque tombe autour du joueur, pas dessus

function tickHazard(
  world: World,
  slot: CooldownSlot,
  def: WeaponDef,
  eff: EffectiveStats,
  pos: Vec2,
  ownerId: number,
  dtMs: number,
  vel?: Vec2
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  slot.cooldownLeftMs = eff.cooldownMs

  const count = Math.max(1, Math.round(eff.count))
  const radius = eff.area + HITBOX.enemy
  const tickMs = eff.tickMs ?? 400
  const lifeMs = eff.projectileLifeMs > 0 ? eff.projectileLifeMs : 3000

  // Direction de base : vers le déplacement du joueur, sinon vers le bas.
  let baseAngle = Math.PI / 2
  if (vel !== undefined) {
    const speed = Math.hypot(vel.x, vel.y)
    if (speed > 1e-3) {
      baseAngle = Math.atan2(vel.y, vel.x)
    }
  }

  for (let i = 0; i < count; i++) {
    // Décalage radial déterministe autour de la direction de base.
    const angle = baseAngle + (Math.PI * 2 * i) / count
    const offsetX = Math.cos(angle) * HAZARD_OFFSET_RADIUS
    const offsetY = Math.sin(angle) * HAZARD_OFFSET_RADIUS
    const e = world.spawn()
    world.add(e, 'position', { x: pos.x + offsetX, y: pos.y + offsetY })
    world.add(e, 'hazard', {
      type: def.id,
      ownerId,
      damagePerTick: eff.damage,
      radius,
      tickMs,
      tickLeftMs: 0,
      lifeMs
    })
  }
}

// --- cone (extincteur) -----------------------------------------------------

/**
 * Émet un cône frontal vers l'ennemi vivant le plus proche.
 *
 * Algorithme déterministe :
 *  1. Direction `d` = vers l'ennemi le plus proche (`findNearestEnemy`).
 *     Si aucun ennemi → cooldown gelé à 0, on attend.
 *  2. Pour chaque ennemi dans `grid.queryCircle(px, py, area+HITBOX.enemy)` :
 *     - dans le rayon (distance ≤ area+HITBOX.enemy)
 *     - ET dans l'angle (`angleBetween(d, enemyDir) ≤ CONE_HALF_ANGLE`)
 *     → dégâts + poser/rafraîchir `slow { mult, remainingMs }` (garde le
 *       plus fort = mult le plus BAS, et le remainingMs le plus long).
 *  3. Émet un `AuraPulse` de kind `'cone'` (dir + portée) pour le VFX.
 *
 * Déterministe : aucun aléa (angle + distance) ; l'AoE touche TOUS les
 * ennemis dans le cône → l'ordre d'itération n'affecte pas l'ensemble.
 */
function tickCone(
  slot: CooldownSlot,
  eff: EffectiveStats,
  pos: Vec2,
  dtMs: number,
  world: World,
  kind: string,
  knockback: number,
  pulses?: AuraPulse[],
  grid?: SpatialGrid,
  ownerId?: number,
  weaponId?: string
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }

  // Direction du cône = vers l'ennemi le plus proche.
  const target = findNearestEnemy(world, pos, Infinity)
  if (target === null) {
    slot.cooldownLeftMs = 0 // prêt à tirer dès qu'une cible entre en portée
    return
  }
  slot.cooldownLeftMs = eff.cooldownMs

  const tdx = target.x - pos.x
  const tdy = target.y - pos.y
  const tlen = Math.hypot(tdx, tdy)
  // Direction unitaire du cône.
  const dirX = tlen === 0 ? 1 : tdx / tlen
  const dirY = tlen === 0 ? 0 : tdy / tlen

  const reach = eff.area + HITBOX.enemy

  // Récupère les candidats via la grille spatiale (ou repli linéaire).
  const slowMult = eff.slowMult ?? 1
  const slowMs = eff.slowMs ?? 0
  let contactFeedbackCount = pulses?.reduce(
    (count, pulse) => count + (pulse.kind === 'cone_hit' ? 1 : 0),
    0
  ) ?? 0

  const applyAndReportContact = (en: number): void => {
    const hit = applyConeDamage(world, en, pos, reach, dirX, dirY, eff.damage, knockback, slowMult, slowMs, ownerId)
    if (!hit || pulses === undefined || weaponId === undefined || contactFeedbackCount >= 12) {
      return
    }
    const targetPos = world.get(en, 'position')
    if (targetPos === undefined) {
      return
    }
    pulses.push({
      x: targetPos.x,
      y: targetPos.y,
      radius: HITBOX.enemy,
      kind: 'cone_hit',
      weaponId,
      ...(ownerId !== undefined ? { ownerId } : {})
    })
    contactFeedbackCount++
  }

  if (grid !== undefined) {
    coneScratch.length = 0
    grid.queryCircle(pos.x, pos.y, reach, coneScratch)
    for (const en of coneScratch) {
      applyAndReportContact(en)
    }
  } else {
    for (const en of world.query('enemy', 'position', 'health')) {
      applyAndReportContact(en)
    }
  }

  // VFX : pulse de kind 'cone' avec portée + direction + id d'arme (le rendu oriente
  // le jet et choisit le bon visuel : mousse d'extincteur vs flammes de chalumeau).
  // Spread conditionnel : exactOptionalPropertyTypes interdit `weaponId: undefined`.
  pulses?.push({ x: pos.x, y: pos.y, radius: reach, kind, dirX, dirY, ...(weaponId !== undefined ? { weaponId } : {}) })
}

/**
 * Applique les dégâts cône + slow à un candidat ennemi si :
 *   - il est vivant (hp > 0)
 *   - dans le rayon (distance ≤ reach)
 *   - dans l'angle (cos entre dir et enemyDir ≥ cos(CONE_HALF_ANGLE))
 *
 * Rafraîchissement du slow : garde le plus fort (mult le plus BAS) et le
 * plus long (remainingMs le plus élevé).
 */
function applyConeDamage(
  world: World,
  en: number,
  pos: Vec2,
  reach: number,
  dirX: number,
  dirY: number,
  damage: number,
  knockback: number,
  slowMult: number,
  slowMs: number,
  ownerId?: number
): boolean {
  const epos = world.get(en, 'position')
  const eh = world.get(en, 'health')
  if (epos === undefined || eh === undefined || eh.hp <= 0) {
    return false
  }

  // Test rayon.
  const dx = epos.x - pos.x
  const dy = epos.y - pos.y
  const dist2 = dx * dx + dy * dy
  if (dist2 > reach * reach) {
    return false
  }

  // Test angle : cos(angle) = dot(dir, enemyDir).
  // Si l'ennemi est exactement sur le joueur → direction nulle → dans le cône (garde-fou).
  const dist = Math.sqrt(dist2)
  const inCone =
    dist === 0 ||
    dirX * (dx / dist) + dirY * (dy / dist) >= Math.cos(CONE_HALF_ANGLE)
  if (!inCone) {
    return false
  }

  applyEnemyHit(world, en, damage, {
    ownerId,
    knockback,
    direction: { x: dirX, y: dirY }
  })

  // Pose ou rafraîchit le slow (garde le plus fort + le plus long).
  if (slowMs > 0) {
    const existing = world.get(en, 'slow')
    if (existing === undefined) {
      world.add(en, 'slow', { mult: slowMult, remainingMs: slowMs })
    } else {
      existing.mult = Math.min(existing.mult, slowMult)
      existing.remainingMs = Math.max(existing.remainingMs, slowMs)
    }
  }
  return true
}

// Scratch réutilisé par tickCone avec grille (évite une allocation par tir).
const coneScratch: number[] = []

// --- commun ---------------------------------------------------------------

// Scratch réutilisé par tous les appels `damageEnemiesInRadius` avec grille (évite une
// allocation par frappe). Sûr : la fonction consomme le tableau de façon synchrone avant
// tout autre appel (pas de réentrance/async dans le core).
const radiusQueryScratch: number[] = []

export interface RadiusDamageOptions {
  grid?: SpatialGrid | undefined
  ownerId?: number | undefined
  knockback?: number | undefined
  /** Origine utilisée pour calculer une direction radiale vers chaque cible. */
  knockbackOrigin?: Vec2 | undefined
  /** Direction fixe prioritaire, par exemple celle d'un cône. */
  knockbackDirection?: Vec2 | undefined
  /** Observation synchrone déclenchée après chaque vrai impact. */
  onHit?: ((enemyId: EntityId, position: Vec2) => void) | undefined
}

/**
 * Inflige `damage` à tous les ennemis vivants dans un rayon `reach` d'un point.
 *
 * Avec `grid` : les candidats viennent de `grid.queryCircle` (surensemble spatial, cf.
 * `SpatialGrid`) puis subissent EXACTEMENT le même test (distance au carré + `hp > 0`)
 * que le repli linéaire ci-dessous. C'est une frappe de zone (AoE) : TOUS les ennemis dans
 * le rayon encaissent les dégâts, il n'y a pas de `break`/premier-touché — donc l'ORDRE des
 * candidats n'affecte pas l'ensemble endommagé (contrairement à `collisionSystem`, qui doit
 * retrier par id). Sans `grid` (tests existants, appels sans grille) : repli linéaire
 * inchangé — comportement identique bit à bit.
 *
 * `ownerId` : si fourni, pose `lastHitBy` sur chaque ennemi touché (attribution des kills
 * par joueur). Absent = pas d'attribution (ex. appels de test sans propriétaire).
 */
export function damageEnemiesInRadius(
  world: World,
  center: Vec2,
  reach: number,
  damage: number,
  options: RadiusDamageOptions = {}
): number {
  const r2 = reach * reach
  let hitCount = 0
  const hit = (en: number, epos: Vec2): void => {
    const origin = options.knockbackOrigin ?? center
    applyEnemyHit(world, en, damage, {
      ownerId: options.ownerId,
      knockback: options.knockback,
      direction: options.knockbackDirection ?? { x: epos.x - origin.x, y: epos.y - origin.y }
    })
    hitCount += 1
    options.onHit?.(en, epos)
  }
  if (options.grid !== undefined) {
    options.grid.queryCircle(center.x, center.y, reach, radiusQueryScratch)
    for (const en of radiusQueryScratch) {
      const epos = world.get(en, 'position')
      const eh = world.get(en, 'health')
      if (epos === undefined || eh === undefined || eh.hp <= 0) {
        continue
      }
      if ((epos.x - center.x) ** 2 + (epos.y - center.y) ** 2 <= r2) {
        hit(en, epos)
      }
    }
    return hitCount
  }
  for (const en of world.query('enemy', 'position', 'health')) {
    const epos = world.get(en, 'position')
    const eh = world.get(en, 'health')
    if (epos === undefined || eh === undefined || eh.hp <= 0) {
      continue
    }
    if ((epos.x - center.x) ** 2 + (epos.y - center.y) ** 2 <= r2) {
      hit(en, epos)
    }
  }
  return hitCount
}
