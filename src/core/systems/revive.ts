import type { World } from '../world'
import type { PlayerInput } from '../types'
import { REVIVE } from '@content/config'

/**
 * Relève co-op : un joueur à terre (`hp<=0`) est secouru par un coéquipier
 * VIVANT resté à `<=REVIVE.radius` qui maintient l'action. Le progrès monte
 * tant qu'au moins un tel releveur est présent, redescend sinon (jamais sous
 * 0). À 100 % : PV restaurés à `maxHp * REVIVE.hpFraction`.
 *
 * Solo (aucun coéquipier vivant) : aucun releveur possible → le progrès ne
 * monte jamais → le joueur à terre reste à terre, comme aujourd'hui (no-op).
 *
 * Pur/déterministe : aucun Phaser/DOM/Math.random/Date, seulement le World et
 * les inputs déjà routés par la façade.
 */
export function reviveSystem(world: World, inputs: ReadonlyMap<number, PlayerInput>, dtMs: number): void {
  const r2 = REVIVE.radius * REVIVE.radius
  const dtSec = dtMs / 1000

  for (const e of world.query('player', 'position', 'health')) {
    const player = world.get(e, 'player')
    const pos = world.get(e, 'position')
    const health = world.get(e, 'health')
    if (player === undefined || pos === undefined || health === undefined) {
      continue
    }

    if (health.hp > 0) {
      // Joueur vivant : aucun progrès de relève résiduel ne doit subsister.
      if (world.has(e, 'revive')) {
        world.remove(e, 'revive')
      }
      continue
    }

    // Joueur à terre : assure le composant de suivi de progrès.
    if (!world.has(e, 'revive')) {
      world.add(e, 'revive', { progress: 0 })
    }
    const rev = world.get(e, 'revive')
    if (rev === undefined) {
      continue
    }

    const isBeingRevived = hasLivingReviverNearby(world, inputs, e, r2)
    if (isBeingRevived) {
      rev.progress += dtSec / REVIVE.fillSeconds
    } else {
      rev.progress = Math.max(0, rev.progress - dtSec / REVIVE.decaySeconds)
    }

    if (rev.progress >= 1) {
      health.hp = health.maxHp * REVIVE.hpFraction
      world.remove(e, 'revive')
    }
  }
}

/** Vrai si un AUTRE joueur vivant, à portée, maintient l'action ce pas-ci. */
function hasLivingReviverNearby(
  world: World,
  inputs: ReadonlyMap<number, PlayerInput>,
  downed: number,
  r2: number
): boolean {
  const downedPos = world.get(downed, 'position')
  if (downedPos === undefined) {
    return false
  }
  for (const other of world.query('player', 'position', 'health')) {
    if (other === downed) {
      continue
    }
    const otherPlayer = world.get(other, 'player')
    const otherPos = world.get(other, 'position')
    const otherHealth = world.get(other, 'health')
    if (otherPlayer === undefined || otherPos === undefined || otherHealth === undefined) {
      continue
    }
    if (otherHealth.hp <= 0) {
      continue
    }
    const holdingAction = inputs.get(otherPlayer.playerId)?.action === true
    if (!holdingAction) {
      continue
    }
    const dx = otherPos.x - downedPos.x
    const dy = otherPos.y - downedPos.y
    if (dx * dx + dy * dy <= r2) {
      return true
    }
  }
  return false
}
