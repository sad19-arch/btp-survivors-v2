import type { World } from '../world'
import type { Vec2 } from '../types'
import { RESCUE } from '@content/config'

/**
 * Libération des ouvriers prisonniers : dès qu'un joueur vivant passe à proximité
 * d'une cage non ouverte, le prisonnier est libéré et rend un peu de PV au joueur
 * (borné à maxHp). Chaque libération pousse sa position dans `freed` pour que la
 * façade émette un événement (étincelles + bulle « Merci ! » côté rendu).
 *
 * Déterministe : simple test de distance, aucun RNG, aucun accès Phaser/DOM.
 */
export function rescueSystem(world: World, freed: Vec2[]): void {
  const r2 = RESCUE.radius * RESCUE.radius
  for (const pe of world.query('prisoner', 'position')) {
    const prisoner = world.get(pe, 'prisoner')
    const ppos = world.get(pe, 'position')
    if (prisoner === undefined || ppos === undefined || prisoner.freed) {
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
        freed.push({ x: ppos.x, y: ppos.y })
        break
      }
    }
  }
}
