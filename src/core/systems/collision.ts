import type { World } from '../world'
import { HITBOX } from '@content/config'

/**
 * Collisions du combat (dégâts uniquement — la mort est récoltée par `reapDeadEnemies`) :
 *  - projectile ↔ ennemi : inflige les dégâts puis consomme le projectile, sauf perforation
 *    (`pierce > 0`) qui laisse le projectile continuer sa route vers d'autres ennemis.
 *  - ennemi ↔ joueur : dégâts de contact continus (proportionnels au temps).
 */
export function collisionSystem(world: World, dtMs: number): void {
  const deadProjectiles = new Set<number>()

  for (const p of world.query('projectile', 'position')) {
    const ppos = world.get(p, 'position')
    const proj = world.get(p, 'projectile')
    if (ppos === undefined || proj === undefined) {
      continue
    }
    for (const en of world.query('enemy', 'position', 'health')) {
      const epos = world.get(en, 'position')
      const eh = world.get(en, 'health')
      if (epos === undefined || eh === undefined || eh.hp <= 0) {
        continue
      }
      const reach = proj.radius + HITBOX.enemy
      if ((epos.x - ppos.x) ** 2 + (epos.y - ppos.y) ** 2 <= reach * reach) {
        eh.hp -= proj.damage
        // Un seul ennemi touché par ce projectile CE pas (break) : l'ennemi visé ici
        // ne peut pas être re-touché par le même projectile dans cette même itération.
        if (proj.pierce > 0) {
          proj.pierce -= 1 // perfore : le projectile continue, sera réévalué au pas suivant
        } else {
          deadProjectiles.add(p) // perforation épuisée (ou nulle) : projectile consommé
        }
        break
      }
    }
  }

  for (const p of deadProjectiles) {
    world.despawn(p)
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
}
