import {
  UTILITY_PASSIVE_TUNING,
  utilityPassiveEffects
} from '@content/passives'
import type { World } from '../world'

/** Avance les fenêtres temporelles des passifs utilitaires. */
export function utilityPassiveSystem(world: World, dtMs: number): void {
  for (const entity of world.query('player')) {
    const player = world.get(entity, 'player')
    if (player === undefined) {
      continue
    }
    player.rendementBoostMs = Math.max(0, (player.rendementBoostMs ?? 0) - dtMs)
    player.rendementComboWindowMs = Math.max(0, (player.rendementComboWindowMs ?? 0) - dtMs)
    if (player.rendementComboWindowMs <= 0) {
      player.rendementComboKills = 0
    }
  }
}

/**
 * Ajoute les kills attribués à la chaîne de Prime de rendement.
 * Dix éliminations, espacées de moins de 3 s, activent +25 % d'XP pendant 5 s.
 */
export function recordRendementKills(
  world: World,
  killsByPlayer: ReadonlyMap<number, number>
): void {
  for (const entity of world.query('player', 'passives')) {
    const player = world.get(entity, 'player')
    const passives = world.get(entity, 'passives')
    if (player === undefined || passives === undefined) {
      continue
    }
    const kills = killsByPlayer.get(player.playerId) ?? 0
    const effects = utilityPassiveEffects(passives.list)
    if (kills <= 0 || effects.primeLevel < 5) {
      continue
    }
    player.rendementComboKills = (player.rendementComboKills ?? 0) + kills
    player.rendementComboWindowMs = UTILITY_PASSIVE_TUNING.rendementComboWindowMs
    if (player.rendementComboKills >= UTILITY_PASSIVE_TUNING.rendementComboKills) {
      player.rendementComboKills = 0
      player.rendementComboWindowMs = 0
      player.rendementBoostMs = UTILITY_PASSIVE_TUNING.rendementBoostMs
    }
  }
}
