import type { World } from '../world'
import type { EntityId, PlayerComp, Vec2 } from '../types'
import type { AuraPulse } from '../events'
import type { WeaponDef } from '@content/weapons'
import { WEAPONS } from '@content/weapons'
import { HITBOX } from '@content/config'

/**
 * Système d'armes : chaque arme du joueur agit automatiquement selon son `kind`.
 *  - projectile : tire vers l'ennemi vivant le plus proche, à la cadence du cooldown.
 *  - aura       : impulsion de dégâts circulaire autour du joueur.
 *  - orbital    : lames qui tournent autour du joueur et frappent au contact.
 *
 * Déterministe (pas d'aléa). La mort des ennemis est récoltée par `reapDeadEnemies`.
 */
export function weaponSystem(world: World, dtMs: number, pulses?: AuraPulse[]): void {
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

    for (const slot of loadout.slots) {
      const def = WEAPONS[slot.id]
      if (def === undefined) {
        continue
      }
      switch (def.kind) {
        case 'projectile':
          tickProjectile(world, slot, def, pos, player, dtMs)
          break
        case 'aura':
          tickAura(world, slot, def, pos, player, dtMs, pulses)
          break
        case 'orbital':
          tickOrbital(world, slot, def, e, pos, player, dtMs)
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
  pos: Vec2,
  player: PlayerComp,
  dtMs: number
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  const target = findNearestEnemy(world, pos, def.range)
  if (target === null) {
    slot.cooldownLeftMs = 0 // prêt à tirer dès qu'une cible entre en portée
    return
  }
  fireProjectile(world, pos, target, def, player.playerId, player.damageMult)
  slot.cooldownLeftMs = def.cooldownMs * player.cooldownMult
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

function fireProjectile(
  world: World,
  from: Vec2,
  target: Vec2,
  def: WeaponDef,
  ownerId: number,
  damageMult: number
): void {
  const dx = target.x - from.x
  const dy = target.y - from.y
  const len = Math.hypot(dx, dy)
  const dirX = len === 0 ? 1 : dx / len
  const dirY = len === 0 ? 0 : dy / len
  const speed = def.projectileSpeed ?? 500
  const life = def.projectileLifeMs ?? 1000

  const e = world.spawn()
  world.add(e, 'position', { x: from.x, y: from.y })
  world.add(e, 'velocity', { x: dirX * speed, y: dirY * speed })
  world.add(e, 'projectile', {
    type: def.id,
    damage: def.damage * damageMult,
    ownerId,
    lifeMs: life,
    radius: HITBOX.projectile
  })
}

// --- aura (marteau) --------------------------------------------------------

function tickAura(
  world: World,
  slot: CooldownSlot,
  def: WeaponDef,
  pos: Vec2,
  player: PlayerComp,
  dtMs: number,
  pulses?: AuraPulse[]
): void {
  slot.cooldownLeftMs -= dtMs
  if (slot.cooldownLeftMs > 0) {
    return
  }
  slot.cooldownLeftMs = def.cooldownMs * player.cooldownMult
  const damage = def.damage * player.damageMult
  const reach = def.range + HITBOX.enemy
  damageEnemiesInRadius(world, pos, reach, damage)
  pulses?.push({ x: pos.x, y: pos.y, radius: reach })
}

// --- orbital (scie) --------------------------------------------------------

function tickOrbital(
  world: World,
  slot: CooldownSlot,
  def: WeaponDef,
  owner: EntityId,
  pos: Vec2,
  player: PlayerComp,
  dtMs: number
): void {
  const count = def.orbitCount ?? 1
  const radius = def.orbitRadius ?? 60
  const hitRadius = def.orbitHitRadius ?? 16
  const orbitSpeed = def.orbitSpeed ?? 3

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
  slot.cooldownLeftMs = def.cooldownMs * player.cooldownMult
  const damage = def.damage * player.damageMult
  for (const b of blades) {
    damageEnemiesInRadius(world, b, hitRadius + HITBOX.enemy, damage)
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
