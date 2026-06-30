import type { World } from '../world'

/**
 * Récolte les ennemis morts, quelle que soit la source de dégâts (projectile,
 * onde de marteau, lame de scie…). Centralise la mort en un seul endroit :
 * lâche une gemme d'XP, supprime l'entité et compte le kill.
 *
 * Retourne le nombre d'ennemis récoltés (pour le score).
 */
export function reapDeadEnemies(world: World): number {
  const dead: number[] = []
  for (const en of world.query('enemy', 'health')) {
    const health = world.get(en, 'health')
    if (health !== undefined && health.hp <= 0) {
      dead.push(en)
    }
  }
  for (const en of dead) {
    dropXpGem(world, en)
    world.despawn(en)
  }
  return dead.length
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
