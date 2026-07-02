import type { World } from '../world'
import type { EntityId, PlayerComp, Vec2 } from '../types'
import type { AuraPulse } from '../events'
import type { WeaponDef } from '@content/weapons'
import type { EffectiveStats } from '@content/effectiveStats'
import { WEAPONS, weaponStatsAtLevel } from '@content/weapons'
import { effectiveWeaponStats } from '@content/effectiveStats'
import { BASE_STATS } from '@content/passives'
import { HITBOX } from '@content/config'
import { Rng } from '../rng'

/**
 * Système d'armes : chaque arme du joueur agit automatiquement selon son `kind`.
 *  - projectile : tire vers l'ennemi vivant le plus proche, à la cadence du cooldown.
 *  - aura       : impulsion de dégâts circulaire autour du joueur.
 *  - orbital    : lames qui tournent autour du joueur et frappent au contact.
 *  - sweep      : balayage circulaire autour du joueur (pied-de-biche).
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
  rng?: Rng
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

    for (const slot of loadout.slots) {
      const def = WEAPONS[slot.id]
      if (def === undefined) {
        continue
      }
      const lvl = weaponStatsAtLevel(def, slot.level)
      const eff = effectiveWeaponStats(lvl, stats)
      switch (def.kind) {
        case 'projectile':
          tickProjectile(world, slot, def, eff, pos, player, dtMs, fired)
          break
        case 'aura':
          tickAura(slot, eff, pos, dtMs, world, pulses)
          break
        case 'orbital':
          tickOrbital(world, slot, def, eff, e, pos, player, dtMs)
          break
        case 'sweep':
          tickSweep(slot, eff, pos, dtMs, world, pulses)
          break
        case 'strike':
          tickStrike(slot, eff, dtMs, world, rng)
          break
      }
    }
  }
}

interface CooldownSlot {
  cooldownLeftMs: number
}

// --- projectile ------------------------------------------------------------

function tickProjectile(
  world: World,
  slot: CooldownSlot,
  def: WeaponDef,
  eff: EffectiveStats,
  pos: Vec2,
  player: PlayerComp,
  dtMs: number,
  fired?: string[]
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  const target = findNearestEnemy(world, pos, Infinity)
  if (target === null) {
    slot.cooldownLeftMs = 0 // prêt à tirer dès qu'une cible entre en portée
    return
  }
  fireProjectiles(world, pos, target, def, eff, player.playerId)
  fired?.push(def.id)
  slot.cooldownLeftMs = eff.cooldownMs
}

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
  ownerId: number
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
    world.add(e, 'projectile', {
      type: def.id,
      damage: eff.damage,
      ownerId,
      lifeMs: life,
      radius: HITBOX.projectile
    })
  }
}

// --- aura (marteau) --------------------------------------------------------

function tickAura(
  slot: CooldownSlot,
  eff: EffectiveStats,
  pos: Vec2,
  dtMs: number,
  world: World,
  pulses?: AuraPulse[]
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  slot.cooldownLeftMs = eff.cooldownMs
  const reach = eff.area + HITBOX.enemy
  damageEnemiesInRadius(world, pos, reach, eff.damage)
  pulses?.push({ x: pos.x, y: pos.y, radius: reach })
}

// --- sweep (pied-de-biche) --------------------------------------------------

/**
 * Balayage circulaire lisible centré sur le joueur (la forme rectangulaire
 * exacte devant/derrière est du polish Plan B). `count` > 1 répète la passe
 * (impulsions rapprochées) plutôt que de varier la géométrie.
 */
function tickSweep(
  slot: CooldownSlot,
  eff: EffectiveStats,
  pos: Vec2,
  dtMs: number,
  world: World,
  pulses?: AuraPulse[]
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  slot.cooldownLeftMs = eff.cooldownMs
  const reach = eff.area + HITBOX.enemy
  const passes = Math.max(1, Math.round(eff.count))
  for (let i = 0; i < passes; i++) {
    damageEnemiesInRadius(world, pos, reach, eff.damage)
  }
  pulses?.push({ x: pos.x, y: pos.y, radius: reach })
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
  dtMs: number,
  world: World,
  rng?: Rng
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
    damageEnemiesInRadius(world, tpos, eff.area, eff.damage)
  }
}

// --- orbital (scie) --------------------------------------------------------

function tickOrbital(
  world: World,
  slot: CooldownSlot,
  def: WeaponDef,
  eff: EffectiveStats,
  owner: EntityId,
  pos: Vec2,
  player: PlayerComp,
  dtMs: number
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
  for (const b of blades) {
    damageEnemiesInRadius(world, b, hitRadius + HITBOX.enemy, eff.damage)
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

// --- commun ---------------------------------------------------------------

/** Inflige `damage` à tous les ennemis vivants dans un rayon `reach` d'un point. */
function damageEnemiesInRadius(world: World, center: Vec2, reach: number, damage: number): void {
  const r2 = reach * reach
  for (const en of world.query('enemy', 'position', 'health')) {
    const epos = world.get(en, 'position')
    const eh = world.get(en, 'health')
    if (epos === undefined || eh === undefined || eh.hp <= 0) {
      continue
    }
    if ((epos.x - center.x) ** 2 + (epos.y - center.y) ** 2 <= r2) {
      eh.hp -= damage
    }
  }
}
