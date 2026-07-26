import type { World } from '../world'
import type { Vec2, EnemyComp } from '../types'
import { BEHAVIOR_TUNING } from '@content/enemies'
import type { FlowField } from './flowField'
import { sampleFlow } from './flowField'

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
interface PlayerTarget extends Vec2 {
  playerId: number
}

export function enemyAiSystem(
  world: World,
  elapsedMs = 0,
  dtMs = 16,
  flowFields: ReadonlyMap<number, FlowField> | null = null
): void {
  const targets: PlayerTarget[] = []
  for (const p of world.query('player', 'position', 'health')) {
    const h = world.get(p, 'health')
    const pos = world.get(p, 'position')
    const player = world.get(p, 'player')
    if (h !== undefined && pos !== undefined && player !== undefined && h.hp > 0) {
      targets.push({ playerId: player.playerId, x: pos.x, y: pos.y })
    }
  }
  targets.sort((left, right) => left.playerId - right.playerId)
  const targetsByPlayerId = new Map(targets.map((target) => [target.playerId, target]))
  const targetLoads = new Map(targets.map((target) => [target.playerId, 0]))
  const enemyIds = [...world.query('enemy', 'position', 'velocity')].sort((left, right) => left - right)

  // Conserve les affectations encore valides afin d'éviter qu'un ennemi change
  // de cible à chaque mort dans la horde.
  for (const e of enemyIds) {
    const enemy = world.get(e, 'enemy')
    if (enemy?.behavior === 'sweep') {
      delete enemy.targetPlayerId
      continue
    }
    const targetPlayerId = enemy?.targetPlayerId
    if (targetPlayerId !== undefined && targetsByPlayerId.has(targetPlayerId)) {
      targetLoads.set(targetPlayerId, (targetLoads.get(targetPlayerId) ?? 0) + 1)
    }
  }

  // Affecte uniquement les nouveaux ennemis ou ceux dont la cible est tombée.
  // Le joueur actuellement le moins ciblé est toujours choisi ; égalité résolue
  // par playerId croissant pour rester parfaitement déterministe.
  for (const e of enemyIds) {
    const enemy = world.get(e, 'enemy')
    if (
      enemy === undefined ||
      enemy.behavior === 'sweep' ||
      (enemy.targetPlayerId !== undefined && targetsByPlayerId.has(enemy.targetPlayerId))
    ) {
      continue
    }
    const target = leastLoadedTarget(targets, targetLoads)
    if (target === null) {
      delete enemy.targetPlayerId
      continue
    }
    enemy.targetPlayerId = target.playerId
    targetLoads.set(target.playerId, (targetLoads.get(target.playerId) ?? 0) + 1)
  }

  for (const e of enemyIds) {
    const pos = world.get(e, 'position')
    const vel = world.get(e, 'velocity')
    const enemy = world.get(e, 'enemy')
    if (pos === undefined || vel === undefined || enemy === undefined) {
      continue
    }

    const target = enemy.targetPlayerId === undefined
      ? null
      : targetsByPlayerId.get(enemy.targetPlayerId) ?? null
    const flowField = target === null ? undefined : flowFields?.get(target.playerId)

    // Chaque cible possède son propre champ de flux : les obstacles ne doivent
    // pas rabattre les ennemis affectés à J2-J4 vers le leader J1.
    const blendedTarget = (flowField !== undefined && target !== null)
      ? blendFlowNearest(flowField, pos.x, pos.y, target)
      : target

    switch (enemy.behavior) {
      case 'zigzag':
        steerZigzag(pos, vel, enemy, blendedTarget, elapsedMs)
        break
      case 'circler':
        steerCircler(pos, vel, enemy, blendedTarget, dtMs)
        break
      case 'sweep':
        steerSweep(vel, enemy)
        break
      case 'charger':
        steerCharger(pos, vel, enemy, blendedTarget, dtMs)
        break
      case 'boss':
        steerBoss(pos, vel, enemy, blendedTarget, dtMs)
        break
      default:
        steerChase(pos, vel, enemy, blendedTarget)
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

/** Traversée rectiligne : direction fixe assignée au spawn, ignore le joueur. */
function steerSweep(vel: Vec2, enemy: EnemyComp): void {
  const a = enemy.bAngle ?? 0
  vel.x = Math.cos(a) * enemy.speed
  vel.y = Math.sin(a) * enemy.speed
}

/**
 * À-coups « Stalker » : machine à états en 4 phases cycliques.
 *   0 = approche   — fonce vers le joueur à vitesse normale
 *   1 = télégraphe — quasi-arrêt, fige la direction du prochain dash
 *   2 = dash       — fonce à dashMult×speed dans la direction figée
 *   3 = récup      — reprend lentement vers le joueur (recoverMult×speed)
 * Déterministe : timers en ms fixes, zéro RNG runtime.
 */
function steerCharger(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null, dtMs: number): void {
  if (nearest === null) { vel.x = 0; vel.y = 0; return }
  const T = BEHAVIOR_TUNING.charger
  // Initialisation au premier appel (bMode undefined → mode 0)
  if (enemy.bMode === undefined) {
    enemy.bMode = 0
    enemy.bTimer = T.approachMs
  }
  // Décrément du timer
  enemy.bTimer = (enemy.bTimer ?? 0) - dtMs
  // Transition d'état quand le timer est épuisé
  if (enemy.bTimer <= 0) {
    enemy.bMode = ((enemy.bMode) + 1) % 4
    const durations = [T.approachMs, T.telegraphMs, T.dashMs, T.recoverMs]
    enemy.bTimer = durations[enemy.bMode] ?? T.approachMs
    // Au début du dash : figer la direction vers le joueur
    if (enemy.bMode === 2) {
      const dx = nearest.x - pos.x
      const dy = nearest.y - pos.y
      const l = Math.hypot(dx, dy) || 1
      enemy.bAngle = Math.atan2(dy / l, dx / l)
    }
  }
  // Calcul de la vélocité selon l'état courant
  const mults = [1, 0.05, T.dashMult, T.recoverMult]
  const mult = mults[enemy.bMode ?? 0] ?? 1
  if (enemy.bMode === 2) {
    // Dash : direction figée (bAngle)
    const a = enemy.bAngle ?? 0
    vel.x = Math.cos(a) * enemy.speed * mult
    vel.y = Math.sin(a) * enemy.speed * mult
  } else {
    // Approche / télégraphe / récup : homing vers le joueur
    const dx = nearest.x - pos.x
    const dy = nearest.y - pos.y
    const l = Math.hypot(dx, dy) || 1
    vel.x = (dx / l) * enemy.speed * mult
    vel.y = (dy / l) * enemy.speed * mult
  }
}

/**
 * IA du boss « mini-événement » : machine à états à 3 phases cycliques.
 *   0 = chase       — poursuite lente (esquivable), pendant `chargeCooldownMs`
 *   1 = télégraphe  — quasi-arrêt lisible, fige la direction de la charge
 *   2 = charge      — dash `chargeMult×speed` dans la direction figée
 * Enrage (`enemy.bEnraged`, posé par `bossSystem` sous le seuil de PV) :
 *   - poursuite plus rapide (`enrageSpeedMult`)
 *   - cadence de charge accélérée (`enrageChargeCooldownMult` < 1)
 * L'invocation d'add et le flag d'enrage vivent dans `bossSystem` (accès RNG/monde) ;
 * ici on ne fait que du steering déterministe (timers ms fixes, zéro RNG runtime).
 */
function steerBoss(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null, dtMs: number): void {
  if (nearest === null) { vel.x = 0; vel.y = 0; return }
  const T = BEHAVIOR_TUNING.boss
  const enraged = enemy.bEnraged === true
  const cooldownMs = T.chargeCooldownMs * (enraged ? T.enrageChargeCooldownMult : 1)
  // Initialisation au premier appel (bMode undefined → chase).
  if (enemy.bMode === undefined) {
    enemy.bMode = 0
    enemy.bTimer = cooldownMs
  }
  enemy.bTimer = (enemy.bTimer ?? 0) - dtMs
  if (enemy.bTimer <= 0) {
    enemy.bMode = (enemy.bMode + 1) % 3
    if (enemy.bMode === 1) {
      enemy.bTimer = T.chargeTelegraphMs
    } else if (enemy.bMode === 2) {
      enemy.bTimer = T.chargeMs
      // Entrée en charge : fige la direction vers le joueur (charge « aveugle »).
      const dx = nearest.x - pos.x, dy = nearest.y - pos.y
      const l = Math.hypot(dx, dy) || 1
      enemy.bAngle = Math.atan2(dy / l, dx / l)
    } else {
      enemy.bTimer = cooldownMs
    }
  }
  if (enemy.bMode === 2) {
    // Charge : direction figée, vitesse démultipliée (rattrape brièvement le joueur).
    const a = enemy.bAngle ?? 0
    vel.x = Math.cos(a) * enemy.speed * T.chargeMult
    vel.y = Math.sin(a) * enemy.speed * T.chargeMult
  } else {
    // Chase (mult enrage) ou télégraphe (quasi-arrêt) : homing vers le joueur.
    const mult = enemy.bMode === 1 ? 0.06 : (enraged ? T.enrageSpeedMult : 1)
    const dx = nearest.x - pos.x, dy = nearest.y - pos.y
    const l = Math.hypot(dx, dy) || 1
    vel.x = (dx / l) * enemy.speed * mult
    vel.y = (dy / l) * enemy.speed * mult
  }
}

// --- Helpers ----------------------------------------------------------------

/**
 * Mélange la direction de flux et la direction directe vers le joueur.
 *
 * Formule : 0.7 × flux + 0.3 × direction_directe, renormalisée.
 * Si le flux est nul (hors fenêtre / muré) → direction directe pure.
 * Retourne un vecteur "nearest" synthétique situé dans la direction mélangée,
 * à la même distance que le joueur réel, afin que les steer* calculent la bonne
 * vitesse (speed × dir).
 *
 * NOTE : JAMAIS appelé quand flowField === null → chemin de code actuel intact.
 */
function blendFlowNearest(
  flowField: FlowField,
  ex: number,
  ey: number,
  nearest: Vec2
): Vec2 {
  const { fx, fy } = sampleFlow(flowField, ex, ey)

  // Flux nul (hors fenêtre ou muré) → chase pur
  if (fx === 0 && fy === 0) {
    return nearest
  }

  // Direction directe vers le joueur (normalisée)
  const ddx = nearest.x - ex
  const ddy = nearest.y - ey
  const ddLen = Math.sqrt(ddx * ddx + ddy * ddy)
  if (ddLen === 0) {
    return nearest
  }
  const ddnx = ddx / ddLen
  const ddny = ddy / ddLen

  // Mélange 70% flux + 30% direct
  const bx = 0.7 * fx + 0.3 * ddnx
  const by = 0.7 * fy + 0.3 * ddny
  const bLen = Math.sqrt(bx * bx + by * by)
  if (bLen === 0) {
    return nearest
  }

  // Retourne un "nearest" synthétique dans la direction mélangée, à distance ddLen
  return {
    x: ex + (bx / bLen) * ddLen,
    y: ey + (by / bLen) * ddLen
  }
}

/**
 * Renvoie le joueur vivant actuellement le moins ciblé.
 */
function leastLoadedTarget(
  targets: readonly PlayerTarget[],
  loads: ReadonlyMap<number, number>
): PlayerTarget | null {
  let selected: PlayerTarget | null = null
  let selectedLoad = Number.POSITIVE_INFINITY
  for (const target of targets) {
    const load = loads.get(target.playerId) ?? 0
    if (load < selectedLoad) {
      selected = target
      selectedLoad = load
    }
  }
  return selected
}
