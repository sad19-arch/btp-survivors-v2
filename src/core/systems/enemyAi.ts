import type { World } from '../world'
import type { Vec2, EnemyComp } from '../types'
import { BEHAVIOR_TUNING } from '@content/enemies'

/**
 * IA d'ennemi : dispatch vers le comportement de chaque ennemi, puis applique
 * le slow si présent. Déterministe (pas de Math.random ici).
 *
 * - `elapsedMs` : temps total écoulé depuis le début de la partie (ms).
 * - `dtMs`      : durée du pas de simulation courant (ms).
 *
 * Les deux paramètres ont des valeurs par défaut pour rétrocompatibilité
 * avec les fixtures de test qui appellent encore `enemyAiSystem(world)`.
 */
export function enemyAiSystem(world: World, elapsedMs = 0, dtMs = 16): void {
  const targets: Vec2[] = []
  for (const p of world.query('player', 'position', 'health')) {
    const h = world.get(p, 'health')
    const pos = world.get(p, 'position')
    if (h !== undefined && pos !== undefined && h.hp > 0) {
      targets.push({ x: pos.x, y: pos.y })
    }
  }

  for (const e of world.query('enemy', 'position', 'velocity')) {
    const pos = world.get(e, 'position')
    const vel = world.get(e, 'velocity')
    const enemy = world.get(e, 'enemy')
    if (pos === undefined || vel === undefined || enemy === undefined) {
      continue
    }

    const nearest = findNearest(pos, targets)

    switch (enemy.behavior) {
      case 'zigzag':
        steerZigzag(pos, vel, enemy, nearest, elapsedMs)
        break
      case 'circler':
        steerCircler(pos, vel, enemy, nearest, dtMs)
        break
      case 'sweep':
        steerSweep(pos, vel, enemy, nearest)
        break
      case 'charger':
        steerCharger(pos, vel, enemy, nearest, dtMs)
        break
      default:
        steerChase(pos, vel, enemy, nearest)
    }

    // Applique le ralentissement si l'ennemi porte un composant `slow`.
    const slow = world.get(e, 'slow')
    if (slow !== undefined) {
      vel.x *= slow.mult
      vel.y *= slow.mult
    }
  }
}

/** Oriente l'ennemi directement vers la cible la plus proche. */
export function steerChase(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null): void {
  if (nearest === null) {
    vel.x = 0
    vel.y = 0
    return
  }
  const dx = nearest.x - pos.x
  const dy = nearest.y - pos.y
  const len = Math.hypot(dx, dy)
  if (len === 0) {
    vel.x = 0
    vel.y = 0
    return
  }
  vel.x = (dx / len) * enemy.speed
  vel.y = (dy / len) * enemy.speed
}

// --- Stubs (implémentés aux tâches 2-5) -------------------------------------
// Chaque stub délègue à steerChase pour que le dispatch compile et que les
// tests de non-régression passent. Les signatures définitives seront posées
// aux tâches 2-5.

/** Ondulation Medusa : homing + composante perpendiculaire sinusoïdale (déterministe). */
function steerZigzag(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null, elapsedMs: number): void {
  if (nearest === null) { vel.x = 0; vel.y = 0; return }
  const dx = nearest.x - pos.x, dy = nearest.y - pos.y, len = Math.hypot(dx, dy)
  if (len === 0) { vel.x = 0; vel.y = 0; return }
  const ux = dx / len, uy = dy / len            // direction joueur (normalisée)
  const px = -uy, py = ux                        // perpendiculaire (rotation 90°)
  const { amp, omega } = BEHAVIOR_TUNING.zigzag
  const osc = amp * Math.sin(omega * (elapsedMs / 1000) + (enemy.bPhase ?? 0))
  vel.x = (ux + px * osc) * enemy.speed
  vel.y = (uy + py * osc) * enemy.speed
}

/** Encerclement orbital : vise un point sur un anneau autour du joueur et fait dériver l'angle. */
function steerCircler(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null, dtMs: number): void {
  if (nearest === null) { vel.x = 0; vel.y = 0; return }
  const { orbitR, rotSpeed } = BEHAVIOR_TUNING.circler
  const a = enemy.bAngle ?? 0
  const tx = nearest.x + Math.cos(a) * orbitR
  const ty = nearest.y + Math.sin(a) * orbitR
  const dx = tx - pos.x
  const dy = ty - pos.y
  const len = Math.hypot(dx, dy)
  if (len < 1) {
    vel.x = 0
    vel.y = 0
  } else {
    vel.x = (dx / len) * enemy.speed
    vel.y = (dy / len) * enemy.speed
  }
  enemy.bAngle = a + rotSpeed * (dtMs / 1000)
}

/** Stub — sera implémenté à la tâche 4. */
function steerSweep(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null): void {
  steerChase(pos, vel, enemy, nearest)
}

/** Stub — sera implémenté à la tâche 5. */
function steerCharger(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null, dtMs: number): void {
  void dtMs
  steerChase(pos, vel, enemy, nearest)
}

// --- Helpers ----------------------------------------------------------------

function findNearest(from: Vec2, targets: readonly Vec2[]): Vec2 | null {
  let best: Vec2 | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const t of targets) {
    const d = (t.x - from.x) ** 2 + (t.y - from.y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = t
    }
  }
  return best
}
