import type { World } from '../world'
import type { EntityId, PickupComp, PickupKind, Vec2 } from '../types'
import { HITBOX, PICKUP } from '@content/config'

/**
 * Pickups (gemmes d'XP) : aimantation vers le joueur le plus proche quand ils
 * entrent dans son rayon, puis collecte au contact (crédite la progression).
 *
 * Pur et déterministe (pas d'aléa). Les pickups hors rayon restent immobiles.
 */
export function pickupSystem(
  world: World,
  dtMs: number,
  collected?: PickupKind[],
  chestCollectors?: number[]
): void {
  const dt = dtMs / 1000
  const collectDist = HITBOX.player + PICKUP.collectRadius

  for (const gem of world.query('pickup', 'position')) {
    const gpos = world.get(gem, 'position')
    const pickup = world.get(gem, 'pickup')
    if (gpos === undefined || pickup === undefined) {
      continue
    }

    // Durée de vie : décrémente AVANT le early-continue "pas de joueur" ci-dessous,
    // sinon les gemmes loin de tout joueur ne s'éteignent jamais (accumulation
    // non bornée de la horde). Seuls les pickups avec `lifeMs` fini expirent
    // (coffre/heal/magnet n'ont pas de `lifeMs` -> persistants).
    if (pickup.lifeMs !== undefined) {
      pickup.lifeMs -= dtMs
      if (pickup.lifeMs <= 0) {
        world.despawn(gem)
        continue
      }
    }

    const target = nearestPlayer(world, gpos)
    if (target === null) {
      continue
    }

    const dx = target.pos.x - gpos.x
    const dy = target.pos.y - gpos.y
    const dist = Math.hypot(dx, dy)

    if (dist <= collectDist) {
      applyPickup(world, target.entity, pickup)
      collected?.push(pickup.type)
      if (pickup.type === 'coffre') {
        const playerId = world.get(target.entity, 'player')?.playerId
        if (playerId !== undefined) {
          chestCollectors?.push(playerId)
        }
      }
      world.despawn(gem)
      continue
    }

    if (dist <= target.pickupRadius && dist > 0) {
      const step = Math.min(PICKUP.magnetSpeed * dt, dist)
      gpos.x += (dx / dist) * step
      gpos.y += (dy / dist) * step
    }
  }
}

/**
 * Applique l'effet d'un pickup au joueur qui le ramasse. Déterministe.
 *
 * NB distinction des deux types « coffre » du butin :
 * - `'chest'` : lot d'XP bonus dormant (chance de drop = 0 pour l'instant, cf. `PICKUP_DROPS`).
 * - `'coffre'` : coffre d'évolution — ne donne AUCUN effet direct ici ; c'est
 *   `simulation.step` qui, en voyant `'coffre'` dans `collected`, appelle
 *   `tryEvolve` puis dispatch `EvolvedEvent` (ou soigne en bonus de repli).
 */
function applyPickup(world: World, player: EntityId, pickup: PickupComp): void {
  switch (pickup.type) {
    case 'xp':
    case 'chest': {
      const progress = world.get(player, 'progress')
      if (progress !== undefined) {
        // Multiplicateur de gain d'XP (stat `growth`, base 1). Déterministe :
        // Math.round(int × 1.0) === int → run par défaut byte-identique.
        const growth = world.get(player, 'stats')?.growth ?? 1
        progress.xp += Math.round(pickup.value * growth)
      }
      break
    }
    case 'heal': {
      const health = world.get(player, 'health')
      if (health !== undefined) {
        health.hp = Math.min(health.maxHp, health.hp + pickup.value)
      }
      break
    }
    case 'magnet': {
      vacuumXpGems(world, player)
      break
    }
    case 'coffre': {
      // Aucun effet direct : la sim gère l'évolution (ou le bonus de repli).
      break
    }
  }
}

/** Aspire immédiatement toutes les gemmes d'XP restantes vers le joueur (crédite + despawn). */
function vacuumXpGems(world: World, player: EntityId): void {
  const ids: EntityId[] = []
  let total = 0
  for (const g of world.query('pickup')) {
    const pk = world.get(g, 'pickup')
    if (pk !== undefined && pk.type === 'xp') {
      ids.push(g)
      total += pk.value
    }
  }
  const progress = world.get(player, 'progress')
  if (progress !== undefined) {
    // Applique le bonus growth comme pour le ramassage normal (déterministe).
    const growth = world.get(player, 'stats')?.growth ?? 1
    progress.xp += Math.round(total * growth)
  }
  for (const g of ids) {
    world.despawn(g)
  }
}

interface NearestPlayer {
  entity: EntityId
  pos: Vec2
  pickupRadius: number
}

/** Joueur vivant le plus proche d'une position (ou null si aucun). */
function nearestPlayer(world: World, from: Vec2): NearestPlayer | null {
  let best: NearestPlayer | null = null
  let bestDist = Infinity
  for (const e of world.query('player', 'position', 'health')) {
    const pos = world.get(e, 'position')
    const health = world.get(e, 'health')
    const player = world.get(e, 'player')
    if (pos === undefined || health === undefined || player === undefined || health.hp <= 0) {
      continue
    }
    const d = (pos.x - from.x) ** 2 + (pos.y - from.y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = { entity: e, pos, pickupRadius: player.pickupRadius }
    }
  }
  return best
}
