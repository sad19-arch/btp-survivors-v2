import type { World } from '../world'
import { HITBOX } from '@content/config'

/**
 * Collisions du combat :
 *  - projectile ↔ ennemi : inflige les dégâts, consomme le projectile, tue
 *    l'ennemi à 0 HP.
 *  - ennemi ↔ joueur : dégâts de contact continus (proportionnels au temps).
 *
 * Les suppressions sont collectées puis appliquées hors itération.
 * Retourne le nombre d'ennemis tués (pour le score).
 */
export function collisionSystem(world: World, dtMs: number): number {
  const deadProjectiles = new Set<number>()
  const deadEnemies = new Set<number>()

  for (const p of world.query('projectile', 'position')) {
    const ppos = world.get(p, 'position')
    const proj = world.get(p, 'projectile')
    if (ppos === undefined || proj === undefined) {
      continue
    }
    for (const en of world.query('enemy', 'position', 'health')) {
      if (deadEnemies.has(en)) {
        continue
      }
      const epos = world.get(en, 'position')
      const eh = world.get(en, 'health')
      if (epos === undefined || eh === undefined || eh.hp <= 0) {
        continue
      }
      const reach = proj.radius + HITBOX.enemy
      if ((epos.x - ppos.x) ** 2 + (epos.y - ppos.y) ** 2 <= reach * reach) {
        eh.hp -= proj.damage
        deadProjectiles.add(p)
        if (eh.hp <= 0) {
          deadEnemies.add(en)
        }
        break // projectile consommé (pas de perforation en slice 1)
      }
    }
  }

  for (const p of deadProjectiles) {
    world.despawn(p)
  }
  for (const en of deadEnemies) {
    dropXpGem(world, en)
    world.despawn(en)
  }

  // Contact ennemi → joueur (dégâts continus).
  const dtSeconds = dtMs / 1000
  for (const en of world.query('enemy', 'position')) {
    const epos = world.get(en, 'position')
    const enemy = world.get(en, 'enemy')
    if (epos === undefined || enemy === undefined) {
      continue
    }
    for (const pl of world.query('player', 'position', 'health')) {
      const ppos = world.get(pl, 'position')
      const ph = world.get(pl, 'health')
      if (ppos === undefined || ph === undefined || ph.hp <= 0) {
        continue
      }
      const reach = HITBOX.enemy + HITBOX.player
      if ((ppos.x - epos.x) ** 2 + (ppos.y - epos.y) ** 2 <= reach * reach) {
        ph.hp -= enemy.contactDamage * dtSeconds
        if (ph.hp < 0) {
          ph.hp = 0
        }
      }
    }
  }

  return deadEnemies.size
}

/** Lâche une gemme d'XP à la position d'un ennemi mort. */
function dropXpGem(world: World, enemy: number): void {
  const epos = world.get(enemy, 'position')
  const ecomp = world.get(enemy, 'enemy')
  if (epos === undefined || ecomp === undefined) {
    return
  }
  const gem = world.spawn()
  world.add(gem, 'position', { x: epos.x, y: epos.y })
  world.add(gem, 'pickup', { type: 'xp', value: ecomp.xpValue })
}
