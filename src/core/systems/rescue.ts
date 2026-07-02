import type { World } from '../world'
import type { Vec2 } from '../types'
import { RESCUE, WORLD } from '@content/config'

/**
 * Ouvriers prisonniers :
 *  - non libéré : si un joueur vivant passe à proximité → libéré, petit soin, et
 *    l'ouvrier s'enfuit vers le bas (on lui ajoute une vélocité ; `movementSystem`
 *    le déplace, `worldBoundsSystem` ne borne que les joueurs donc il sort du cadre) ;
 *  - libéré : une fois sorti du monde, on le despawn. `freed` reçoit sa position pour
 *    que la façade émette l'événement (étincelles + bulle « Merci ! » côté rendu).
 *
 * Déterministe : test de distance, aucun RNG, aucun accès Phaser/DOM.
 */
export function rescueSystem(world: World, freed: Vec2[]): void {
  const r2 = RESCUE.radius * RESCUE.radius
  for (const pe of world.query('prisoner', 'position')) {
    const prisoner = world.get(pe, 'prisoner')
    const ppos = world.get(pe, 'position')
    if (prisoner === undefined || ppos === undefined) {
      continue
    }
    if (prisoner.freed) {
      // Libéré : il fuit vers le bas ; une fois hors du monde, on le retire.
      if (ppos.y > WORLD.height + 120) {
        world.despawn(pe)
      }
      continue
    }
    for (const player of world.query('player', 'position', 'health')) {
      const pos = world.get(player, 'position')
      const health = world.get(player, 'health')
      if (pos === undefined || health === undefined || health.hp <= 0) {
        continue
      }
      const dx = pos.x - ppos.x
      const dy = pos.y - ppos.y
      if (dx * dx + dy * dy <= r2) {
        prisoner.freed = true
        health.hp = Math.min(health.maxHp, health.hp + RESCUE.heal)
        world.add(pe, 'velocity', { x: 0, y: RESCUE.fleeSpeed }) // s'enfuit en courant vers le bas
        freed.push({ x: ppos.x, y: ppos.y })
        break
      }
    }
  }
}
