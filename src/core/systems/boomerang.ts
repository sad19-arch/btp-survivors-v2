import type { World } from '../world'

/**
 * Système boomerang : gère le retour des projectiles `boomerangOutMs`.
 *
 * Appelé dans `simulation.step` APRÈS `movementSystem`, AVANT `collisionSystem`.
 *
 * Algorithme (déterministe — aucun aléa) :
 *  1. Pour chaque projectile avec `boomerangOutMs !== undefined` et `!returning` :
 *     décrémenter `boomerangOutMs -= dtMs` ; si `<= 0` → `returning = true`.
 *  2. Si `returning` : recalculer la vélocité = direction(ownerPos − projPos) × norme actuelle.
 *     Si distance(owner) < 24 px → despawn.
 *  3. Owner absent ou mort (hp <= 0) → despawn.
 */
export function boomerangSystem(world: World, dtMs: number): void {
  const toRemove: number[] = []

  for (const p of world.query('projectile', 'position', 'velocity')) {
    const proj = world.get(p, 'projectile')
    const ppos = world.get(p, 'position')
    const vel = world.get(p, 'velocity')

    if (proj === undefined || ppos === undefined || vel === undefined) {
      continue
    }
    // Ne concerne que les projectiles boomerang (champ présent)
    if (proj.boomerangOutMs === undefined) {
      continue
    }

    // Trouver l'owner (joueur portant le playerId correspondant à proj.ownerId)
    let ownerPos: { x: number; y: number } | undefined
    let ownerAlive = false
    for (const pl of world.query('player', 'position', 'health')) {
      const player = world.get(pl, 'player')
      const health = world.get(pl, 'health')
      const pos = world.get(pl, 'position')
      if (player === undefined || health === undefined || pos === undefined) {
        continue
      }
      if (player.playerId === proj.ownerId) {
        ownerPos = { x: pos.x, y: pos.y }
        ownerAlive = health.hp > 0
        break
      }
    }

    if (ownerPos === undefined || !ownerAlive) {
      // Owner absent ou mort → despawn
      toRemove.push(p)
      continue
    }

    if (!proj.returning) {
      // Phase aller : décompte du timer
      proj.boomerangOutMs -= dtMs
      if (proj.boomerangOutMs <= 0) {
        proj.returning = true
        // Vider hitIds au moment de l'inversion : chaque ennemi peut être touché une fois
        // à l'aller et une fois au retour (double coup voulu). La liste se re-remplit
        // pendant la phase retour, empêchant les hits répétés dans le même passage.
        if (proj.hitIds !== undefined) {
          proj.hitIds.length = 0
        }
      }
    }

    if (proj.returning) {
      // Phase retour : réorienter vers l'owner (norme conservée)
      const norm = Math.hypot(vel.x, vel.y)
      const dx = ownerPos.x - ppos.x
      const dy = ownerPos.y - ppos.y
      const dist = Math.hypot(dx, dy)

      if (dist < 24) {
        // Atteint l'owner → despawn
        toRemove.push(p)
        continue
      }

      if (norm > 0 && dist > 0) {
        vel.x = (dx / dist) * norm
        vel.y = (dy / dist) * norm
      }
    }
  }

  for (const p of toRemove) {
    world.despawn(p)
  }
}
