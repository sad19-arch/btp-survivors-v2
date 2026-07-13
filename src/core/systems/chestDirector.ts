/**
 * Directeur de coffres d'évolution.
 *
 * Source unique des coffres « libres » : un ennemi ÉLITE « porteur de coffre »
 * (le `convoyeur`) est invoqué périodiquement ; sa mort lâche un coffre GARANTI.
 * Plus AUCUN coffre n'apparaît « au hasard » — il faut tuer le porteur.
 * (Le mini-boss lâche toujours son coffre-jalon garanti, cf. `reap.ts`.)
 *
 * Déterminisme : toutes les décisions passent par le `Rng` dédié `chestRng`
 * (séparé du RNG spawn/loot/upgrade). Le convoyeur est spawné hors des pools de
 * phase, donc la séquence de spawn des vagues normales est inchangée.
 *
 * Purs/sans effets de bord hors du `World` : aucun `Math.random()`, aucun
 * `Date.now()`, pas de Phaser, pas de DOM.
 */

import type { World } from '@core/world'
import type { Rng } from '@core/rng'
import type { Vec2 } from '@core/types'
import type { DifficultyScale } from '@content/spawnRamp'
import { dropPickup } from '@core/systems/reap'
import { spawnEnemy } from '@core/systems/spawn'
import { ENEMIES } from '@content/enemies'
import { CHEST, SPAWN } from '@content/config'

/**
 * Compte les coffres d'évolution (`'coffre'`) actuellement au sol.
 * Utilisé pour faire respecter le plafond `maxActive`.
 */
export function countActiveChests(world: World): number {
  let count = 0
  for (const e of world.query('pickup')) {
    const pk = world.get(e, 'pickup')
    if (pk?.type === 'coffre') {
      count++
    }
  }
  return count
}

/**
 * Compte les élites « porteurs de coffre » (convoyeurs) actuellement vivants.
 * Fait respecter le plafond `bearerCap` (un mini-objectif ciblé, pas un essaim).
 */
export function countChestBearers(world: World): number {
  let count = 0
  for (const e of world.query('enemy')) {
    const en = world.get(e, 'enemy')
    if (en?.chestBearer === true) {
      count++
    }
  }
  return count
}

/**
 * Décide si un nouveau porteur de coffre doit être invoqué. Fonction pure.
 * Vrai seulement si la cadence est écoulée ET qu'on est sous le plafond de
 * porteurs vivants ET sous le plafond de coffres déjà au sol (pas d'accumulation
 * infinie si le joueur ignore les coffres).
 */
export function shouldSpawnBearer(
  world: World,
  elapsedSinceLast: number,
  intervalMs: number,
  bearerCap: number,
  maxChests: number
): boolean {
  if (elapsedSinceLast < intervalMs) {
    return false
  }
  if (countChestBearers(world) >= bearerCap) {
    return false
  }
  return countActiveChests(world) < maxChests
}

/**
 * Tick du directeur de porteurs de coffre. Appelé chaque pas fixe depuis
 * `simulation.ts` (uniquement quand la scène est 'game').
 *
 * Retourne le nouveau `elapsedSinceLast` : remis à 0 si un convoyeur a été
 * invoqué, sinon inchangé (l'appelant y ajoute dt avant d'appeler).
 *
 * @param world            - monde ECS courant
 * @param rng              - RNG dédié `chestRng` (seed isolé)
 * @param elapsedSinceLast - ms accumulées depuis le dernier convoyeur
 * @param centroid         - position du joueur vivant le plus proche (ou centroïde)
 * @param scale            - renforcement temporel (le porteur reste pertinent en fin de run)
 */
export function tickChestBearer(
  world: World,
  rng: Rng,
  elapsedSinceLast: number,
  centroid: Vec2,
  scale: DifficultyScale
): number {
  if (!shouldSpawnBearer(world, elapsedSinceLast, CHEST.bearerIntervalMs, CHEST.bearerCap, CHEST.maxActive)) {
    return elapsedSinceLast
  }
  const def = ENEMIES['convoyeur']
  if (def === undefined) {
    return elapsedSinceLast // défensif (roster mal configuré)
  }
  // Spawn hors écran, sur l'anneau (comme une vague) : il « vient du monde » et
  // marche vers le joueur (behavior 'chase'), télégraphié par son aura + marqueur.
  const angle = rng.float(0, Math.PI * 2)
  const pos: Vec2 = {
    x: centroid.x + Math.cos(angle) * SPAWN.ringRadius,
    y: centroid.y + Math.sin(angle) * SPAWN.ringRadius
  }
  spawnEnemy(world, def, pos, false, scale, undefined, { chestBearer: true })
  return 0 // reset le compteur
}

/**
 * Lâche le coffre GARANTI d'un porteur mort (appelé depuis `simulation.ts` sur
 * les positions de mort des convoyeurs, avant leur reap). Pas de RNG : la
 * récompense est méritée par la mise à mort de l'élite.
 */
export function dropChestBearerLoot(world: World, pos: Vec2): void {
  dropPickup(world, pos, 'coffre', 0)
}
