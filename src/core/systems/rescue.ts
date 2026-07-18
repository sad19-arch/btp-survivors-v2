import type { World } from '../world'
import type { Vec2 } from '../types'
import { RESCUE, RAGE, WORLD } from '@content/config'

/**
 * Ouvriers prisonniers :
 *  - non libéré : si un joueur vivant passe à proximité → libéré, petit soin, et il
 *    devient ENRAGÉ (allié temporaire : suit le joueur + boules de feu, cf. `allySystem`).
 *    Sa position part dans `enraged` pour le feedback « enragé ». Au-delà de
 *    `RAGE.maxAllies` alliés actifs, on retombe sur une libération « classique »
 *    (fuite immédiate + « merci ») → position poussée dans `thanked`.
 *  - libéré : une fois sorti du monde (il fuit vers le bas à l'expiration), on le despawn.
 *
 * Déterministe : test de distance, aucun RNG, aucun accès Phaser/DOM.
 */

/** Un otage libéré converti en allié enragé (feedback « enragé » + événement). */
export interface EnragedFreed {
  x: number
  y: number
  /** PlayerId du sauveteur (owner de l'allié). */
  playerId: number
}

/**
 * Renvoie le nombre de prisonniers NOUVELLEMENT libérés ce pas (enragés + libérés
 * « classiques » au cap) — l'appelant s'en sert pour `rescuedTotal`. Les entrées de
 * `thanked` ajoutées par `allySystem` (expirations) NE sont PAS comptées ici.
 */
export function rescueSystem(world: World, enraged: EnragedFreed[], thanked: Vec2[]): number {
  const r2 = RESCUE.radius * RESCUE.radius
  let activeAllies = [...world.query('ally')].length
  let newlyFreed = 0
  for (const pe of world.query('prisoner', 'position')) {
    const prisoner = world.get(pe, 'prisoner')
    const ppos = world.get(pe, 'position')
    if (prisoner === undefined || ppos === undefined) {
      continue
    }
    if (prisoner.freed) {
      // Libéré : il fuit vers le bas (à l'expiration de la rage) ; hors monde → retiré.
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
        newlyFreed += 1
        health.hp = Math.min(health.maxHp, health.hp + Math.round(health.maxHp * RESCUE.healFraction))
        const ownerPlayerId = world.get(player, 'player')?.playerId ?? 0
        if (activeAllies < RAGE.maxAllies) {
          // ENRAGÉ : `allySystem` prendra le relais (suivi + salves + expiration).
          // Vélocité 0 (pas de fuite tant qu'il est actif ; il suit le joueur).
          world.add(pe, 'ally', { ownerPlayerId, remainingMs: RAGE.durationMs, salvoLeftMs: RAGE.salvoMs })
          world.add(pe, 'velocity', { x: 0, y: 0 })
          activeAllies += 1
          enraged.push({ x: ppos.x, y: ppos.y, playerId: ownerPlayerId })
        } else {
          // Cap d'alliés atteint : libération « classique » (fuite + merci immédiat).
          world.add(pe, 'velocity', { x: 0, y: RESCUE.fleeSpeed })
          thanked.push({ x: ppos.x, y: ppos.y })
        }
        break
      }
    }
  }
  return newlyFreed
}
