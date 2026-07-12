import type { World } from '../world'
import type { Rng } from '../rng'
import type { DifficultyScale } from '@content/spawnRamp'
import type { ConstructionPhase } from '@content/phases'
import { BEHAVIOR_TUNING } from '@content/enemies'
import { SPAWN } from '@content/config'
import { spawnSummons } from './spawn'

const NO_SCALE: DifficultyScale = { hp: 1, contactDamage: 1, speed: 1 }

/** Compte les entités ennemies vivantes (pour respecter le plafond au spawn). */
function countEnemies(world: World): number {
  let n = 0
  for (const _e of world.query('enemy')) {
    void _e
    n += 1
  }
  return n
}

/**
 * Système « mini-événement boss » (déterministe, RNG seedé).
 *
 * Pour chaque ennemi `behavior === 'boss'` :
 *  - **Enrage** : pose `bEnraged` quand ses PV passent sous `enrageHpPct`
 *    (lu par `steerBoss` pour accélérer poursuite + cadence de charge).
 *  - **Invocation** : à chaque seuil de `summonAtHpPct` franchi (une seule fois
 *    par palier via `bSummonIdx`), fait apparaître `summonCount` add autour du
 *    boss (rayon `summonRadius`), du pool de la phase courante.
 *
 * À appeler dans `step` AVANT `enemyAiSystem` (l'enrage doit être à jour avant le
 * steering). Ne bouge aucune entité ; ne tire du RNG que sur franchissement de
 * seuil (donc zéro divergence sur les runs qui n'atteignent pas de boss).
 */
export function bossSystem(
  world: World,
  rng: Rng,
  phase: ConstructionPhase,
  scale: DifficultyScale = NO_SCALE
): void {
  const T = BEHAVIOR_TUNING.boss
  for (const e of world.query('enemy', 'position', 'health')) {
    const enemy = world.get(e, 'enemy')
    const pos = world.get(e, 'position')
    const health = world.get(e, 'health')
    if (enemy === undefined || pos === undefined || health === undefined) {
      continue
    }
    if (enemy.behavior !== 'boss') {
      continue
    }
    const hpFrac = health.maxHp > 0 ? health.hp / health.maxHp : 0
    enemy.bEnraged = hpFrac < T.enrageHpPct

    // Franchissement de seuils d'invocation (gère plusieurs paliers d'un coup si
    // un gros coup fait chuter les PV sous plusieurs seuils en une frame).
    // Le nombre invoqué est BORNÉ par le budget restant sous `SPAWN.maxActive`
    // (jamais de dépassement du plafond ni de flood d'XP incontrôlé).
    let idx = enemy.bSummonIdx ?? 0
    while (idx < T.summonAtHpPct.length && hpFrac <= (T.summonAtHpPct[idx] ?? -1)) {
      const budget = SPAWN.maxActive - countEnemies(world)
      if (budget > 0) {
        spawnSummons(world, rng, phase, { x: pos.x, y: pos.y }, Math.min(T.summonCount, budget), T.summonRadius, scale)
      }
      idx++
    }
    enemy.bSummonIdx = idx
  }
}
