/**
 * Alliés ENRAGÉS (otages libérés) — suivi du joueur, salves de boules de feu et
 * expiration. Système PUR/DÉTERMINISTE : itération sur le World, sélection des
 * victimes via un RNG DÉDIÉ (`allyRng`), aucun accès Phaser/DOM, aucun `Math.random`.
 *
 * Cycle de vie (l'entité alliée EST l'entité `prisoner`, qui garde `freed:true`) :
 *  1. `rescueSystem` la convertit (ajoute `ally` + `velocity`) au contact du joueur.
 *  2. `allySystem` (AVANT `movementSystem`) : oriente la vélocité vers le joueur et,
 *     à chaque `salvoMs`, tire une salve. À `remainingMs<=0` (ou joueur mort/absent),
 *     retire `ally`, pose une vélocité de fuite et pousse la position dans `thanked`
 *     (→ bulle « Merci » + départ, despawn hors-monde géré par `rescueSystem`).
 *  3. `allyBoltSystem` (APRÈS `movementSystem`) : homing + impact des boules.
 *
 * Les boules NE sont PAS des `projectile` (jamais vues par `collisionSystem`) : la
 * purge est déterministe (ensemble des victimes figé à la salve), pas collisionnelle.
 */
import type { World } from '../world'
import type { EntityId, Vec2 } from '../types'
import type { Rng } from '../rng'
import { RAGE, RESCUE } from '@content/config'
import { applyEnemyHit } from './knockback'

/** Position + état vivant du joueur `ownerPlayerId` (patron `boomerangSystem`). */
function findOwner(world: World, ownerPlayerId: number): { pos: Vec2; alive: boolean } | undefined {
  for (const pl of world.query('player', 'position', 'health')) {
    const player = world.get(pl, 'player')
    const health = world.get(pl, 'health')
    const pos = world.get(pl, 'position')
    if (player === undefined || health === undefined || pos === undefined) {
      continue
    }
    if (player.playerId === ownerPlayerId) {
      return { pos: { x: pos.x, y: pos.y }, alive: health.hp > 0 }
    }
  }
  return undefined
}

/** Oriente la vélocité de l'allié vers le joueur, avec une zone morte anti-grésillement. */
function steerToward(vel: Vec2, from: Vec2, target: Vec2, speed: number): void {
  const dx = target.x - from.x
  const dy = target.y - from.y
  const len = Math.hypot(dx, dy)
  if (len <= 80) {
    vel.x = 0
    vel.y = 0
    return
  }
  vel.x = (dx / len) * speed
  vel.y = (dy / len) * speed
}

/** Tire `n` entités du pool SANS remise (Fisher-Yates partiel, déterministe). */
function pickWithoutReplacement(pool: EntityId[], rng: Rng, n: number): EntityId[] {
  if (n >= pool.length) {
    return [...pool]
  }
  const work = [...pool]
  const out: EntityId[] = []
  for (let i = 0; i < n; i++) {
    const idx = rng.int(0, work.length - 1)
    out.push(work[idx] as EntityId)
    work[idx] = work[work.length - 1] as EntityId
    work.pop()
  }
  return out
}

/** Crée une boule de feu homing vers `targetId` (vitesse initiale déjà orientée). */
function spawnAllyBolt(
  world: World,
  ownerPlayerId: number,
  from: Vec2,
  targetId: EntityId,
  lethal: boolean,
  damage: number
): void {
  const tpos = world.get(targetId, 'position')
  let vx = 0
  let vy = 0
  if (tpos !== undefined) {
    const dx = tpos.x - from.x
    const dy = tpos.y - from.y
    const len = Math.hypot(dx, dy)
    if (len > 0) {
      vx = (dx / len) * RAGE.boltSpeed
      vy = (dy / len) * RAGE.boltSpeed
    }
  }
  const e = world.spawn()
  world.add(e, 'position', { x: from.x, y: from.y })
  world.add(e, 'velocity', { x: vx, y: vy })
  world.add(e, 'allyBolt', { ownerPlayerId, targetId, damage, lethal, speed: RAGE.boltSpeed })
}

/**
 * Une salve : PURGE DIRIGÉE. Tue exactement `floor(N/2)` ennemis normaux du rayon
 * écran (boules létales), et plafonne les boss/élites/convoyeurs à `bossDamageFraction`
 * × PVmax (boules non létales, JAMAIS de kill). `from` = origine visuelle (l'allié),
 * `center` = centre « écran » (le joueur, que la caméra suit).
 */
function fireSalvo(world: World, allyRng: Rng, ownerPlayerId: number, from: Vec2, center: Vec2): void {
  const r2 = RAGE.screenRadius * RAGE.screenRadius
  const normals: EntityId[] = []
  const heavies: EntityId[] = []
  for (const en of world.query('enemy', 'position', 'health')) {
    const enemy = world.get(en, 'enemy')
    const epos = world.get(en, 'position')
    const health = world.get(en, 'health')
    if (enemy === undefined || epos === undefined || health === undefined || health.hp <= 0) {
      continue
    }
    const dx = epos.x - center.x
    const dy = epos.y - center.y
    if (dx * dx + dy * dy > r2) {
      continue
    }
    if (enemy.isBoss || enemy.isElite || enemy.chestBearer === true) {
      heavies.push(en)
    } else {
      normals.push(en)
    }
  }
  const killCount = Math.floor(normals.length * RAGE.killFraction)
  for (const target of pickWithoutReplacement(normals, allyRng, killCount)) {
    spawnAllyBolt(world, ownerPlayerId, from, target, true, 0)
  }
  for (const target of heavies) {
    const health = world.get(target, 'health')
    if (health === undefined) {
      continue
    }
    // Plafond : min(1/3 PVmax, hp-1) → le boss/élite encaisse fort mais SURVIT.
    const capped = Math.min(Math.round(health.maxHp * RAGE.bossDamageFraction), Math.max(0, health.hp - 1))
    if (capped <= 0) {
      continue
    }
    spawnAllyBolt(world, ownerPlayerId, from, target, false, capped)
  }
}

/**
 * Fait vivre les alliés enragés (suivi + salves + expiration). À appeler AVANT
 * `movementSystem`. `thanked` reçoit la position de chaque allié qui expire ce pas
 * (→ bulle « Merci »).
 */
export function allySystem(world: World, dtMs: number, allyRng: Rng, thanked: Vec2[]): void {
  for (const ae of world.query('ally', 'position', 'velocity')) {
    const ally = world.get(ae, 'ally')
    const apos = world.get(ae, 'position')
    const avel = world.get(ae, 'velocity')
    if (ally === undefined || apos === undefined || avel === undefined) {
      continue
    }
    const owner = findOwner(world, ally.ownerPlayerId)
    ally.remainingMs -= dtMs
    // Expiration (durée écoulée) OU joueur owner disparu/mort → merci + fuite.
    if (owner === undefined || !owner.alive || ally.remainingMs <= 0) {
      world.remove(ae, 'ally')
      avel.x = 0
      avel.y = RESCUE.fleeSpeed
      thanked.push({ x: apos.x, y: apos.y })
      continue
    }
    steerToward(avel, apos, owner.pos, RAGE.followSpeed)
    ally.salvoLeftMs -= dtMs
    if (ally.salvoLeftMs <= 0) {
      ally.salvoLeftMs = RAGE.salvoMs
      fireSalvo(world, allyRng, ally.ownerPlayerId, apos, owner.pos)
    }
  }
}

/**
 * Déplacement homing + impact des boules de feu. À appeler APRÈS `movementSystem`
 * (la boule a bougé ce pas), AVANT `reapDeadEnemies` (les kills sont récoltés le
 * pas même). Une boule dont la cible a disparu/est morte se dissipe.
 */
export function allyBoltSystem(world: World): void {
  const done: EntityId[] = []
  for (const be of world.query('allyBolt', 'position', 'velocity')) {
    const bolt = world.get(be, 'allyBolt')
    const bpos = world.get(be, 'position')
    const bvel = world.get(be, 'velocity')
    if (bolt === undefined || bpos === undefined || bvel === undefined) {
      continue
    }
    const tpos = world.get(bolt.targetId, 'position')
    const thealth = world.get(bolt.targetId, 'health')
    if (!world.alive(bolt.targetId) || tpos === undefined || thealth === undefined || thealth.hp <= 0) {
      done.push(be) // cible disparue / déjà morte → la boule se dissipe
      continue
    }
    const dx = tpos.x - bpos.x
    const dy = tpos.y - bpos.y
    const dist = Math.hypot(dx, dy)
    if (dist <= RAGE.boltHitRadius) {
      if (bolt.lethal) {
        const enemy = world.get(bolt.targetId, 'enemy')
        thealth.hp = 0
        if (enemy !== undefined) {
          enemy.lastHitBy = bolt.ownerPlayerId
          enemy.allyKill = true // → gemme d'XP réduite (`reapDeadEnemies`)
        }
      } else {
        applyEnemyHit(world, bolt.targetId, bolt.damage, { ownerId: bolt.ownerPlayerId, knockback: 0 })
      }
      done.push(be)
      continue
    }
    // Homing : réoriente vers la position COURANTE de la cible (norme = boltSpeed).
    bvel.x = (dx / dist) * bolt.speed
    bvel.y = (dy / dist) * bolt.speed
  }
  for (const be of done) {
    world.despawn(be)
  }
}
