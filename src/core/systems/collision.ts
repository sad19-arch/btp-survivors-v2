import type { World } from '../world'
import type { SpatialGrid } from '../spatialGrid'
import { HITBOX } from '@content/config'

/** Rayon de recherche d'une cible de rebond, en px. */
const BOUNCE_SEEK_RADIUS = 320

/**
 * Collisions du combat (dégâts uniquement — la mort est récoltée par `reapDeadEnemies`) :
 *  - projectile ↔ ennemi : inflige les dégâts puis consomme le projectile, sauf perforation
 *    (`pierce > 0`) qui laisse le projectile continuer sa route vers d'autres ennemis.
 *  - projectile ricochet (`bounces > 0`) : à l'impact, redirige vers l'ennemi le plus proche
 *    non déjà touché ; déterministe (distance² minimale, tie-break id croissant).
 *  - projectile boomerang (`boomerangOutMs`) : frappe à l'aller ET au retour. `hitIds` est vidé
 *    par `boomerangSystem` au moment de l'inversion, ce qui autorise un re-hit au retour
 *    (un ennemi peut être touché une fois à l'aller, une fois au retour). Le `pierce` borne
 *    le nombre d'ennemis touchés par passage.
 *  - ennemi ↔ joueur : dégâts de contact continus (proportionnels au temps).
 *
 * `grid` fournit uniquement des CANDIDATS (surensemble spatial de TOUS les ennemis avec
 * position, sans filtre HP — cf. `Simulation.rebuildEnemyGrid`) — le test de distance exact
 * et toute la logique de dégâts/perforation restent identiques au scan linéaire qu'ils
 * remplacent : sortie inchangée.
 *
 * IMPORTANT (ordre) : le scan linéaire remplacé itérait `world.query(...)`, qui visite les
 * entités dans l'ordre d'insertion (id croissant). `queryCircle` renvoie les candidats groupés
 * par cellule de grille, PAS par id — un ordre différent changerait quel ennemi encaisse le
 * hit en cas de `break` (perforation épuisée) quand plusieurs candidats sont à portée, donc
 * changerait les dégâts observables. On retrie les candidats par id croissant pour retrouver
 * exactement l'ordre du scan linéaire qu'ils remplacent.
 */
export function collisionSystem(world: World, dtMs: number, grid: SpatialGrid): void {
  const deadProjectiles = new Set<number>()
  const cand: number[] = []
  const bounceCand: number[] = []

  for (const p of world.query('projectile', 'position')) {
    const ppos = world.get(p, 'position')
    const proj = world.get(p, 'projectile')
    if (ppos === undefined || proj === undefined) {
      continue
    }
    const reach = proj.radius + HITBOX.enemy
    grid.queryCircle(ppos.x, ppos.y, reach, cand)
    cand.sort((a, b) => a - b)
    for (const en of cand) {
      const epos = world.get(en, 'position')
      const eh = world.get(en, 'health')
      if (epos === undefined || eh === undefined || eh.hp <= 0) {
        continue
      }
      if ((epos.x - ppos.x) ** 2 + (epos.y - ppos.y) ** 2 <= reach * reach) {
        // Enregistrer l'ennemi dans hitIds (ricochet — peut être undefined si pas de ricochet)
        if (proj.hitIds !== undefined) {
          proj.hitIds.push(en)
        }
        eh.hp -= proj.damage
        // Attribution du dernier frappeur pour le tally de kills par joueur.
        const eenemy = world.get(en, 'enemy')
        if (eenemy !== undefined) {
          eenemy.lastHitBy = proj.ownerId
        }
        // Un seul ennemi touché par ce projectile CE pas (break) : l'ennemi visé ici
        // ne peut pas être re-touché par le même projectile dans cette même itération.
        if ((proj.bounces ?? 0) > 0) {
          // Ricochet : chercher l'ennemi vivant le plus proche non encore touché.
          const bounceTarget = findBounceTarget(world, grid, ppos.x, ppos.y, proj.hitIds ?? [], bounceCand)
          if (bounceTarget !== null) {
            // Réorienter vers la cible de rebond, en conservant la norme de la vélocité.
            const vel = world.get(p, 'velocity')
            if (vel !== undefined) {
              const norm = Math.hypot(vel.x, vel.y)
              const dx = bounceTarget.x - ppos.x
              const dy = bounceTarget.y - ppos.y
              const dlen = Math.hypot(dx, dy)
              if (dlen > 0 && norm > 0) {
                vel.x = (dx / dlen) * norm
                vel.y = (dy / dlen) * norm
              }
            }
            proj.bounces = (proj.bounces ?? 1) - 1
            // Ne pas despawn : le projectile continue
          } else {
            // Aucune cible de rebond → comportement pierce/despawn normal
            if (proj.pierce > 0) {
              proj.pierce -= 1
            } else {
              deadProjectiles.add(p)
            }
          }
        } else if (proj.pierce > 0) {
          proj.pierce -= 1 // perfore : le projectile continue, sera réévalué au pas suivant
        } else {
          deadProjectiles.add(p) // perforation épuisée (ou nulle) : projectile consommé
        }
        break
      }
    }
  }

  for (const p of deadProjectiles) {
    world.despawn(p)
  }

  // Contact ennemi → joueur (dégâts continus).
  const dtSeconds = dtMs / 1000
  for (const pl of world.query('player', 'position', 'health')) {
    const ppos = world.get(pl, 'position')
    const ph = world.get(pl, 'health')
    if (ppos === undefined || ph === undefined || ph.hp <= 0) {
      continue
    }
    const reach = HITBOX.enemy + HITBOX.player
    grid.queryCircle(ppos.x, ppos.y, reach, cand)
    cand.sort((a, b) => a - b)
    for (const en of cand) {
      const epos = world.get(en, 'position')
      const enemy = world.get(en, 'enemy')
      if (epos === undefined || enemy === undefined) {
        continue
      }
      if ((ppos.x - epos.x) ** 2 + (ppos.y - epos.y) ** 2 <= reach * reach) {
        ph.hp -= enemy.contactDamage * dtSeconds
        if (ph.hp < 0) {
          ph.hp = 0
        }
      }
    }
  }
}

/**
 * Cherche l'ennemi vivant le plus proche du point (`px`,`py`) dans un rayon
 * `BOUNCE_SEEK_RADIUS`, dont l'id n'est pas dans `hitIds`.
 *
 * Déterminisme garanti : sélection par distance² minimale, tie-break id croissant
 * (identique au tri par id déjà pratiqué dans `collisionSystem`).
 *
 * Retourne la position de la cible, ou `null` si aucune cible éligible.
 */
function findBounceTarget(
  world: World,
  grid: SpatialGrid,
  px: number,
  py: number,
  hitIds: readonly number[],
  cand: number[]
): { x: number; y: number } | null {
  grid.queryCircle(px, py, BOUNCE_SEEK_RADIUS, cand)
  // Trier par id croissant pour le tie-break déterministe.
  cand.sort((a, b) => a - b)

  let bestDist2 = Infinity
  let bestPos: { x: number; y: number } | null = null

  for (const en of cand) {
    if (hitIds.includes(en)) {
      continue
    }
    const epos = world.get(en, 'position')
    const eh = world.get(en, 'health')
    if (epos === undefined || eh === undefined || eh.hp <= 0) {
      continue
    }
    const d2 = (epos.x - px) ** 2 + (epos.y - py) ** 2
    if (d2 < bestDist2) {
      bestDist2 = d2
      bestPos = { x: epos.x, y: epos.y }
    }
  }

  return bestPos
}
