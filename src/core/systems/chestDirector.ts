/**
 * Directeur de coffres d'évolution.
 *
 * Deux sources de coffres (en plus du mini-boss garanti, inchangé dans reap.ts) :
 *  1. Périodique : un coffre apparaît toutes les `CHEST.intervalMs` ms autour du
 *     joueur vivant le plus proche, si `maxActive` n'est pas atteint.
 *  2. Mort d'élite : `maybeDropEliteChest` est appelé depuis `simulation.ts`
 *     lors du reap d'un ennemi élite — probabilité `CHEST.eliteDropChance`.
 *
 * Déterminisme : toutes les décisions passent par le `Rng` dédié `chestRng`
 * (séparé du RNG spawn/loot/upgrade) — la séquence de spawn d'ennemis est inchangée.
 *
 * Purs/sans effets de bord sur l'état hors du `World` : aucun `Math.random()`,
 * aucun `Date.now()`, pas de Phaser, pas de DOM.
 */

import type { World } from '@core/world'
import type { Rng } from '@core/rng'
import type { Vec2 } from '@core/types'
import { dropPickup } from '@core/systems/reap'
import { CHEST } from '@content/config'

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
 * Décide si un coffre périodique doit apparaître.
 * Fonction pure — toutes les décisions basées sur les paramètres fournis.
 *
 * @param world            - monde courant (pour compter les coffres actifs)
 * @param elapsedSinceLast - ms depuis le dernier coffre périodique spawné
 * @param intervalMs       - intervalle cible (ex. CHEST.intervalMs)
 * @param maxActive        - plafond de coffres simultanés (ex. CHEST.maxActive)
 */
export function shouldSpawnChest(
  world: World,
  elapsedSinceLast: number,
  intervalMs: number,
  maxActive: number
): boolean {
  if (elapsedSinceLast < intervalMs) {
    return false
  }
  return countActiveChests(world) < maxActive
}

/**
 * Tick du directeur de coffres périodiques. Appelé chaque pas fixe depuis
 * `simulation.ts` (uniquement quand la scène est 'game').
 *
 * Retourne le nouveau `elapsedSinceLast` : remis à 0 si un coffre a été spawné,
 * sinon inchangé (l'appelant y ajoute dt avant d'appeler).
 *
 * @param world            - monde ECS courant
 * @param rng              - RNG dédié `chestRng` (seed isolé)
 * @param elapsedSinceLast - ms accumulées depuis le dernier coffre périodique
 * @param centroid         - position du joueur vivant le plus proche (ou centroïde)
 */
export function tickChestDirector(
  world: World,
  rng: Rng,
  elapsedSinceLast: number,
  centroid: Vec2
): number {
  if (!shouldSpawnChest(world, elapsedSinceLast, CHEST.intervalMs, CHEST.maxActive)) {
    return elapsedSinceLast
  }
  // Spawne le coffre à une position déterministe autour du centroïde.
  const angle = rng.float(0, Math.PI * 2)
  const pos: Vec2 = {
    x: centroid.x + Math.cos(angle) * CHEST.spawnRadius,
    y: centroid.y + Math.sin(angle) * CHEST.spawnRadius
  }
  dropPickup(world, pos, 'coffre', 0)
  return 0 // reset le compteur
}

/**
 * Tente de lâcher un coffre à la mort d'un ennemi élite (`isElite === true`).
 * Ne fait rien si le plafond est déjà atteint.
 * Appelé depuis `simulation.ts` dans la boucle de mort (après `reapDeadEnemies`).
 *
 * @param world - monde ECS courant
 * @param rng   - RNG dédié `chestRng`
 * @param pos   - position de mort de l'ennemi élite
 */
export function maybeDropEliteChest(world: World, rng: Rng, pos: Vec2): void {
  if (countActiveChests(world) >= CHEST.maxActive) {
    return
  }
  if (rng.chance(CHEST.eliteDropChance)) {
    dropPickup(world, pos, 'coffre', 0)
  }
}
