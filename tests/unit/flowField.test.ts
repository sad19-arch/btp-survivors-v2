/**
 * Tests T4 — flowField.ts
 *
 * 1. Contournement : obstacle entre ennemi et joueur → direction latérale non nulle.
 * 2. Sans obstacle : buildFlowField avec obstacles=[] → sanity check ;
 *    surtout : enemyAi avec flowField=null = comportement d'avant (chase pur).
 * 3. Déterminisme : mêmes entrées → mêmes dirX/dirY.
 * 4. sampleFlow hors fenêtre → {0, 0}.
 * 5. Cellule murée/inatteignable → {0, 0}.
 */

import { describe, it, expect } from 'vitest'
import { buildFlowField, sampleFlow, CELL_FLOW, HALF_FLOW } from '@core/systems/flowField'
import { World } from '@core/world'
import { enemyAiSystem } from '@core/systems/enemyAi'
import type { Obstacle } from '@core/siteLayout'
import type { EntityId } from '@core/types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function addPlayer(w: World, x: number, y: number): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', {
    playerId: 1,
    speed: 200,
    vigilance: 100,
    damageMult: 1,
    cooldownMult: 1,
    pickupRadius: 90
  })
  return e
}

function addEnemy(w: World, x: number, y: number, speed = 100): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 10, maxHp: 10 })
  w.add(e, 'enemy', {
    type: 'paperasse',
    speed,
    isElite: false,
    isBoss: false,
    contactDamage: 5,
    xpValue: 5
  })
  return e
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Contournement
// ─────────────────────────────────────────────────────────────────────────────

describe('flowField — contournement (1)', () => {
  it('1a. ennemi face à un mur → direction avec composante latérale, pas droit dans le mur', () => {
    // Scénario : joueur à gauche, ennemi à droite, mur vertical entre les deux.
    // Joueur à (500, 500), mur segment vertical x=700 de y=200 à y=800, ennemi à (900, 500).
    // Sans flux : l'ennemi fonce droit dans le mur (dx < 0).
    // Avec flux : le BFS contourne par le haut ou le bas → composante Y non nulle.

    const playerX = 500
    const playerY = 500
    const enemyX = 900
    const enemyY = 500

    // Mur épaisseur 60 — devrait bloquer la ligne directe
    const wall: Obstacle = {
      kind: 'segment',
      x: 700, y: 200,
      x2: 700, y2: 800,
      thickness: 60,
      blocks: 'both'
    }

    const ff = buildFlowField(playerX, playerY, [wall], CELL_FLOW, HALF_FLOW)

    const { fx, fy } = sampleFlow(ff, enemyX, enemyY)

    // Le flux doit pointer globalement vers la gauche (vers le joueur)
    expect(fx).toBeLessThan(0)

    // La composante Y doit être non nulle (contournement du mur)
    expect(Math.abs(fy)).toBeGreaterThan(0.05)
  })

  it('1b. ennemi dans un couloir ouvert → direction directement vers le joueur (pas d\'obstacle sur le trajet)', () => {
    // Mur au nord de l'ennemi, mais le trajet joueur↔ennemi est libre
    const playerX = 500
    const playerY = 500
    const enemyX = 500
    const enemyY = 700

    // Mur loin au-dessus, pas sur le trajet
    const wallAway: Obstacle = {
      kind: 'segment',
      x: 500, y: 100,
      x2: 500, y2: 200,
      thickness: 40,
      blocks: 'both'
    }

    const ff = buildFlowField(playerX, playerY, [wallAway], CELL_FLOW, HALF_FLOW)
    const { fx, fy } = sampleFlow(ff, enemyX, enemyY)

    // Doit pointer vers le joueur (fy < 0 = vers le haut)
    expect(fy).toBeLessThan(0)
    // La composante X doit être ~ 0 (trajet direct)
    expect(Math.abs(fx)).toBeLessThan(0.5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sans obstacle — sanity + équivalence flowField=null
// ─────────────────────────────────────────────────────────────────────────────

describe('flowField — sans obstacle (2)', () => {
  it('2a. buildFlowField([]) → cellules pointent vers le joueur (sanity)', () => {
    const playerX = 1000
    const playerY = 1000

    const ff = buildFlowField(playerX, playerY, [], CELL_FLOW, HALF_FLOW)

    // Ennemi à gauche du joueur → flux doit pointer à droite (fx > 0)
    const { fx: fxLeft } = sampleFlow(ff, playerX - 400, playerY)
    expect(fxLeft).toBeGreaterThan(0)

    // Ennemi en dessous → flux doit pointer vers le haut (fy < 0)
    const { fy: fyBelow } = sampleFlow(ff, playerX, playerY + 400)
    expect(fyBelow).toBeLessThan(0)
  })

  it('2b. enemyAiSystem avec flowField=null → même vélocité que sans paramètre (chase pur)', () => {
    // Run sans paramètre (comportement historique)
    function runNoFlow(): { vx: number; vy: number } {
      const w = new World()
      addPlayer(w, 0, 0)
      const e = addEnemy(w, 100, 50, 60)
      enemyAiSystem(w, 0, 16)
      const vel = w.get(e, 'velocity')
      return { vx: vel?.x ?? 0, vy: vel?.y ?? 0 }
    }

    // Run avec flowField explicitement null
    function runNullFlow(): { vx: number; vy: number } {
      const w = new World()
      addPlayer(w, 0, 0)
      const e = addEnemy(w, 100, 50, 60)
      enemyAiSystem(w, 0, 16, null)
      const vel = w.get(e, 'velocity')
      return { vx: vel?.x ?? 0, vy: vel?.y ?? 0 }
    }

    const a = runNoFlow()
    const b = runNullFlow()
    expect(a.vx).toBe(b.vx)
    expect(a.vy).toBe(b.vy)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Déterminisme
// ─────────────────────────────────────────────────────────────────────────────

describe('flowField — déterminisme (3)', () => {
  it('3. mêmes entrées → mêmes dirX/dirY (bit-exact)', () => {
    const obs: Obstacle[] = [
      { kind: 'circle', x: 800, y: 800, r: 100, blocks: 'both' },
      { kind: 'segment', x: 400, y: 600, x2: 900, y2: 600, thickness: 40, blocks: 'enemies' }
    ]
    const ff1 = buildFlowField(1000, 1000, obs, CELL_FLOW, HALF_FLOW)
    const ff2 = buildFlowField(1000, 1000, obs, CELL_FLOW, HALF_FLOW)

    expect(ff1.dirX).toEqual(ff2.dirX)
    expect(ff1.dirY).toEqual(ff2.dirY)
    expect(ff1.originX).toBe(ff2.originX)
    expect(ff1.originY).toBe(ff2.originY)
    expect(ff1.cols).toBe(ff2.cols)
    expect(ff1.rows).toBe(ff2.rows)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. sampleFlow hors fenêtre → {0, 0}
// ─────────────────────────────────────────────────────────────────────────────

describe('flowField — sampleFlow hors fenêtre (4)', () => {
  it('4a. position très éloignée du joueur → {fx:0, fy:0}', () => {
    const ff = buildFlowField(1000, 1000, [], CELL_FLOW, HALF_FLOW)
    // La fenêtre est de 2×HALF_FLOW = 4096px centrée sur (1000,1000) → de -1048 à 3048
    // Position à l'extérieur :
    const { fx, fy } = sampleFlow(ff, 99999, 99999)
    expect(fx).toBe(0)
    expect(fy).toBe(0)
  })

  it('4b. position négative hors fenêtre → {fx:0, fy:0}', () => {
    const ff = buildFlowField(1000, 1000, [], CELL_FLOW, HALF_FLOW)
    const { fx, fy } = sampleFlow(ff, -5000, -5000)
    expect(fx).toBe(0)
    expect(fy).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cellule murée / inatteignable → {0, 0}
// ─────────────────────────────────────────────────────────────────────────────

describe('flowField — cellule inatteignable (5)', () => {
  it('5. ennemi encerclé par des obstacles → sampleFlow retourne {0,0}', () => {
    // On entoure une zone avec des cercles obstacles très larges pour isoler une cellule
    const playerX = 1000
    const playerY = 1000
    const enemyX = 1000
    const enemyY = 1400 // 400px sous le joueur

    // Cercle énorme qui entoure la zone de l'ennemi (isole du BFS)
    // L'obstacle est entre le joueur et l'ennemi — assez grand pour bloquer tous les chemins
    const bigWall: Obstacle = {
      kind: 'segment',
      x: playerX - HALF_FLOW + CELL_FLOW,
      y: playerY + 200,
      x2: playerX + HALF_FLOW - CELL_FLOW,
      y2: playerY + 200,
      thickness: HALF_FLOW * 2, // mur infiniment épais → bloque tout
      blocks: 'both'
    }

    const ff = buildFlowField(playerX, playerY, [bigWall], CELL_FLOW, HALF_FLOW)
    const { fx, fy } = sampleFlow(ff, enemyX, enemyY)
    expect(fx).toBe(0)
    expect(fy).toBe(0)
  })
})
