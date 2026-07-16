import type { World } from '../world'
import type { Rng } from '../rng'
import type { PickupKind, Vec2 } from '../types'
import { PICKUP, PICKUP_DROPS } from '@content/config'

/**
 * Résultat de `reapDeadEnemies` : nombre total tués + kills attribués par joueur.
 * `killsByPlayer` : map `playerId → nombre de kills` pour les ennemis dont `lastHitBy`
 * est défini. Les ennemis morts sans attribution (contact ennemi→joueur uniquement,
 * ou spawn sans dégâts reçus) ne figurent pas dans cette map mais comptent dans `total`.
 */
export interface ReapResult {
  total: number
  killsByPlayer: Map<number, number>
  /**
   * Boss tués ce pas (rôles `mid` et `final` confondus).
   *
   * Compté ICI, et pas depuis `EnemyDiedEvent` : ce dernier est PLAFONNÉ par pas
   * (`MAX_DIED_EVENTS_PER_STEP`, cf. `simulation.ts`) et perdrait la mort du boss
   * dès qu'elle survient au milieu d'une grosse vague — c'est-à-dire le cas
   * NORMAL. `ReapResult` n'est pas plafonné et ne dépend pas de l'out-param
   * `died` (non fourni en headless) : la mesure est fiable partout.
   */
  bossKills: number
}

/**
 * Contexte de la mort d'UN ennemi, collecté pour la couche rendu (Mode Carnage).
 *
 * Rempli dans un out-param plutôt que renvoyé : même patron que
 * `reapDestructibles`, et surtout **facultatif** — sans tableau fourni (headless,
 * `npm run sim`), rien n'est collecté et le coût est nul.
 */
export interface DiedEnemy {
  x: number
  y: number
  type: string
  isElite: boolean
  bossRole: 'mid' | 'final' | undefined
  weapon: string | undefined
  dirX: number | undefined
  dirY: number | undefined
}

/**
 * Récolte les ennemis morts, quelle que soit la source de dégâts (projectile,
 * onde de marteau, lame de scie…). Centralise la mort en un seul endroit :
 * lâche une gemme d'XP (+ parfois un bonus), supprime l'entité et compte le kill.
 *
 * `lootRng` est un RNG DÉDIÉ au loot (séparé du RNG de spawn/upgrade) pour ne pas
 * perturber la séquence d'équilibrage. S'il est absent, seule la gemme d'XP tombe.
 * Retourne un `ReapResult` : total kills + map kills par joueur (attribution par
 * dernier frappeur — `lastHitBy` posé aux sites de dégât).
 */
export function reapDeadEnemies(world: World, lootRng?: Rng, died?: DiedEnemy[]): ReapResult {
  const dead: number[] = []
  for (const en of world.query('enemy', 'health')) {
    const health = world.get(en, 'health')
    if (health !== undefined && health.hp <= 0) {
      dead.push(en)
    }
  }
  const killsByPlayer = new Map<number, number>()
  let bossKills = 0
  for (const en of dead) {
    const epos = world.get(en, 'position')
    const ecomp = world.get(en, 'enemy')
    if (epos !== undefined && ecomp !== undefined) {
      if (ecomp.bossRole !== undefined) {
        bossKills++
      }
      dropPickup(world, epos, 'xp', ecomp.xpValue)
      if (ecomp.bossRole === 'mid') {
        // Boss de mi-parcours : lâche un coffre d'évolution (rend une évolution
        // atteignable EN RUN, avant le boss final — cf. Plan B1 split de boss).
        dropPickup(world, epos, 'coffre', 0)
      }
      if (lootRng !== undefined) {
        maybeDropBonus(world, lootRng, epos)
      }
      // Attribution du kill au dernier joueur ayant infligé des dégâts.
      if (ecomp.lastHitBy !== undefined) {
        killsByPlayer.set(ecomp.lastHitBy, (killsByPlayer.get(ecomp.lastHitBy) ?? 0) + 1)
      }
      // Contexte de mort pour le rendu (Mode Carnage). Collecté seulement si un
      // tableau est fourni : en headless personne ne le demande, coût nul.
      if (died !== undefined) {
        died.push({
          x: epos.x,
          y: epos.y,
          type: ecomp.type,
          isElite: ecomp.isElite,
          bossRole: ecomp.bossRole,
          weapon: ecomp.lastHitWeapon,
          dirX: ecomp.lastHitDir?.x,
          dirY: ecomp.lastHitDir?.y
        })
      }
    }
    world.despawn(en)
  }
  return { total: dead.length, killsByPlayer, bossKills }
}

/** Tire au plus UN bonus (soin / aimant / coffre) selon les chances configurées. */
function maybeDropBonus(world: World, rng: Rng, pos: Vec2): void {
  if (rng.chance(PICKUP_DROPS.heal.chance)) {
    dropPickup(world, pos, 'heal', PICKUP_DROPS.heal.value)
  } else if (rng.chance(PICKUP_DROPS.magnet.chance)) {
    dropPickup(world, pos, 'magnet', PICKUP_DROPS.magnet.value)
  } else if (rng.chance(PICKUP_DROPS.chest.chance)) {
    dropPickup(world, pos, 'chest', PICKUP_DROPS.chest.value)
  }
}

/**
 * Fait apparaître un pickup à une position. Seules les gemmes d'XP reçoivent
 * une durée de vie (`lifeMs`) : elles sont produites en masse par la horde et
 * doivent s'effacer si personne ne les ramasse. `coffre`/`heal`/`magnet`/`chest`
 * restent persistants (pas de `lifeMs`).
 */
export function dropPickup(world: World, pos: Vec2, type: PickupKind, value: number): void {
  const gem = world.spawn()
  world.add(gem, 'position', { x: pos.x, y: pos.y })
  world.add(gem, 'pickup', type === 'xp' ? { type, value, lifeMs: PICKUP.gemLifeMs } : { type, value })
}
