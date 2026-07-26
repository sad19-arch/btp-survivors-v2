import type { World } from '../world'
import type { SpatialGrid } from '../spatialGrid'
import type { AuraPulse } from '../events'
import type { ProjectileComp } from '../types'
import { HITBOX } from '@content/config'
import { applyEnemyHit } from './knockback'

/** Rayon de recherche d'une cible de rebond, en px. */
const BOUNCE_SEEK_RADIUS = 320
/** Les dégâts restent exhaustifs ; seul le nombre de VFX transmis au rendu est borné par pas. */
const MAX_EXPLOSION_PULSES_PER_STEP = 16
const MAX_PROJECTILE_IMPACT_PULSES_PER_STEP = 16
const SPECIALIZED_PROJECTILE_IMPACTS = new Set(['cloueur', 'mitrailleuse_clous'])
const MAX_RICOCHET_PULSES_PER_STEP = 12
const RICOCHET_FEEDBACK_WEAPONS = new Set(['boulons', 'tempete_boulons'])

/**
 * Collisions du combat (dégâts uniquement — la mort est récoltée par `reapDeadEnemies`) :
 *  - projectile ↔ ennemi : inflige les dégâts puis consomme le projectile, sauf perforation
 *    (`pierce > 0`) qui laisse le projectile continuer sa route vers d'autres ennemis.
 *    Un projectile ne peut toucher chaque ennemi qu'une fois pendant un même passage.
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
export function collisionSystem(
  world: World,
  dtMs: number,
  grid: SpatialGrid,
  pulses?: AuraPulse[]
): void {
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
    // Initialisation paresseuse pour couvrir aussi les projectiles créés par les tests,
    // sauvegardes ou anciens producteurs qui ne renseigneraient pas encore `hitIds`.
    const hitIds = proj.hitIds ?? (proj.hitIds = [])
    grid.queryCircle(ppos.x, ppos.y, reach, cand)
    cand.sort((a, b) => a - b)
    for (const en of cand) {
      const epos = world.get(en, 'position')
      const eh = world.get(en, 'health')
      if (epos === undefined || eh === undefined || eh.hp <= 0 || hitIds.includes(en)) {
        continue
      }
      if ((epos.x - ppos.x) ** 2 + (epos.y - ppos.y) ** 2 <= reach * reach) {
        hitIds.push(en)
        const velocity = world.get(p, 'velocity')
        applyEnemyHit(world, en, proj.damage, {
          ownerId: proj.ownerId,
          knockback: proj.knockback,
          direction: velocity ?? { x: epos.x - ppos.x, y: epos.y - ppos.y }
        })
        if (
          pulses !== undefined
          && SPECIALIZED_PROJECTILE_IMPACTS.has(proj.type)
          && pulses.reduce((count, pulse) => count + (pulse.kind === 'projectile_hit' ? 1 : 0), 0)
            < MAX_PROJECTILE_IMPACT_PULSES_PER_STEP
        ) {
          pulses.push({
            x: epos.x,
            y: epos.y,
            radius: proj.radius,
            kind: 'projectile_hit',
            weaponId: proj.type,
            ownerId: proj.ownerId
          })
        }
        if ((proj.explosionRadius ?? 0) > 0 && (proj.explosionDamageMult ?? 0) > 0) {
          detonateProjectile(world, grid, proj, en, ppos.x, ppos.y, pulses)
        }
        // Un seul ennemi touché par ce projectile CE pas (break) : l'ennemi visé ici
        // ne peut pas être re-touché par le même projectile dans cette même itération.
        if ((proj.bounces ?? 0) > 0) {
          // Ricochet : chercher l'ennemi vivant le plus proche non encore touché.
          const bounceTarget = findBounceTarget(world, grid, ppos.x, ppos.y, hitIds, bounceCand)
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
            if (
              pulses !== undefined
              && RICOCHET_FEEDBACK_WEAPONS.has(proj.type)
              && pulses.reduce((count, pulse) => count + (pulse.kind === 'ricochet_hit' ? 1 : 0), 0)
                < MAX_RICOCHET_PULSES_PER_STEP
            ) {
              pulses.push({
                x: epos.x,
                y: epos.y,
                radius: proj.radius,
                kind: 'ricochet_hit',
                weaponId: proj.type,
                ownerId: proj.ownerId
              })
            }
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
 * Détonation d'une bonbonne : la cible directe conserve son plein impact, puis
 * chaque autre ennemi ne reçoit les dégâts de souffle qu'une seule fois pour ce
 * passage du projectile. L'évolution choisit ensuite ses centres successifs par
 * distance² minimale, avec tie-break sur l'id, sans consommer de RNG.
 */
function detonateProjectile(
  world: World,
  grid: SpatialGrid,
  proj: ProjectileComp,
  directTarget: number,
  impactX: number,
  impactY: number,
  pulses?: AuraPulse[]
): void {
  const radius = proj.explosionRadius ?? 0
  const splashDamage = proj.damage * (proj.explosionDamageMult ?? 0)
  const hitIds = proj.hitIds ?? (proj.hitIds = [])
  const centers = new Set<number>([directTarget])
  let centerX = impactX
  let centerY = impactY
  const blastCandidates: number[] = []
  const chainCandidates: number[] = []

  for (let index = 0; index <= (proj.chainExplosions ?? 0); index++) {
    if (
      pulses !== undefined
      && pulses.reduce((count, pulse) => count + (pulse.kind === 'explosion' ? 1 : 0), 0)
        < MAX_EXPLOSION_PULSES_PER_STEP
    ) {
      pulses.push({
        x: centerX,
        y: centerY,
        radius,
        kind: 'explosion',
        weaponId: proj.type
      })
    }
    grid.queryCircle(centerX, centerY, radius, blastCandidates)
    blastCandidates.sort((a, b) => a - b)
    for (const enemy of blastCandidates) {
      if (hitIds.includes(enemy)) {
        continue
      }
      const pos = world.get(enemy, 'position')
      const health = world.get(enemy, 'health')
      if (pos === undefined || health === undefined || health.hp <= 0) {
        continue
      }
      const dx = pos.x - centerX
      const dy = pos.y - centerY
      if (dx * dx + dy * dy > radius * radius) {
        continue
      }
      hitIds.push(enemy)
      applyEnemyHit(world, enemy, splashDamage, {
        ownerId: proj.ownerId,
        knockback: proj.knockback,
        direction: { x: dx, y: dy }
      })
    }

    if (index >= (proj.chainExplosions ?? 0)) {
      break
    }
    const next = findChainTarget(
      world,
      grid,
      centerX,
      centerY,
      proj.chainRange ?? 0,
      centers,
      chainCandidates
    )
    if (next === null) {
      break
    }
    centers.add(next.id)
    centerX = next.x
    centerY = next.y
  }
}

function findChainTarget(
  world: World,
  grid: SpatialGrid,
  x: number,
  y: number,
  range: number,
  centers: ReadonlySet<number>,
  candidates: number[]
): { id: number; x: number; y: number } | null {
  grid.queryCircle(x, y, range, candidates)
  candidates.sort((a, b) => a - b)
  let best: { id: number; x: number; y: number } | null = null
  let bestDist2 = Infinity
  for (const enemy of candidates) {
    if (centers.has(enemy)) {
      continue
    }
    const pos = world.get(enemy, 'position')
    const health = world.get(enemy, 'health')
    if (pos === undefined || health === undefined || health.hp <= 0) {
      continue
    }
    const dist2 = (pos.x - x) ** 2 + (pos.y - y) ** 2
    if (dist2 > range * range) {
      continue
    }
    if (dist2 < bestDist2) {
      bestDist2 = dist2
      best = { id: enemy, x: pos.x, y: pos.y }
    }
  }
  return best
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
