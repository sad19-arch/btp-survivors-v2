/**
 * Tests T3 — resolveObstacleCollisions
 *
 * Verifie : push-out circle/segment, ciblage both/enemies, determinisme, no-op vide.
 */

import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { resolveObstacleCollisions } from '@core/systems/obstacleCollision'
import { HITBOX } from '@content/config'
import type { Obstacle } from '@core/siteLayout'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makePlayer(world: World, x: number, y: number): number {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'player', {
    playerId: 1,
    speed: 200,
    vigilance: 100,
    damageMult: 1,
    cooldownMult: 1,
    pickupRadius: 90
  })
  return e
}

function makeEnemy(world: World, x: number, y: number): number {
  const e = world.spawn()
  world.add(e, 'position', { x, y })
  world.add(e, 'enemy', {
    type: 'fast',
    speed: 120,
    isElite: false,
    isBoss: false,
    contactDamage: 10,
    xpValue: 1
  })
  return e
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Entite penetrant un obstacle circle (blocks=both) → repoussee au contact
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveObstacleCollisions — obstacle circle (both)', () => {
  const obstacleR = 60
  const circleObs: Obstacle = { kind: 'circle', x: 500, y: 500, r: obstacleR, blocks: 'both' }

  it('1a. joueur penetrant → repoussee exactement au contact (d === R+r)', () => {
    const w = new World()
    // Joueur a l'interieur de l'obstacle (centre du cercle = 500,500)
    const e = makePlayer(w, 505, 500)
    resolveObstacleCollisions(w, [circleObs])
    const pos = w.get(e, 'position')
    expect(pos).toBeDefined()
    if (pos === undefined) {return}
    const dx = pos.x - circleObs.x
    const dy = pos.y - circleObs.y
    const d = Math.hypot(dx, dy)
    const expected = HITBOX.player + obstacleR
    expect(d).toBeCloseTo(expected, 5)
  })

  it('1b. ennemi penetrant → repoussee exactement au contact (d === R+r)', () => {
    const w = new World()
    const e = makeEnemy(w, 510, 500)
    resolveObstacleCollisions(w, [circleObs])
    const pos = w.get(e, 'position')
    expect(pos).toBeDefined()
    if (pos === undefined) {return}
    const dx = pos.x - circleObs.x
    const dy = pos.y - circleObs.y
    const d = Math.hypot(dx, dy)
    const expected = HITBOX.enemy + obstacleR
    expect(d).toBeCloseTo(expected, 5)
  })

  it("1c. entite deja a l'exterieur → position inchangee", () => {
    const w = new World()
    const farX = 700
    const farY = 500
    const e = makePlayer(w, farX, farY)
    resolveObstacleCollisions(w, [circleObs])
    const pos = w.get(e, 'position')
    expect(pos).toEqual({ x: farX, y: farY })
  })

  it('1d. entite au centre exact (d=0) → repousse en +x, d === R+r', () => {
    const w = new World()
    const e = makeEnemy(w, 500, 500) // Centre exact de l'obstacle
    resolveObstacleCollisions(w, [circleObs])
    const pos = w.get(e, 'position')
    expect(pos).toBeDefined()
    if (pos === undefined) {return}
    const dx = pos.x - circleObs.x
    const dy = pos.y - circleObs.y
    const d = Math.hypot(dx, dy)
    const expected = HITBOX.enemy + obstacleR
    expect(d).toBeCloseTo(expected, 5)
    // Direction +x
    expect(pos.x).toBeGreaterThan(circleObs.x)
    expect(pos.y).toBeCloseTo(circleObs.y, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Entite penetrant un obstacle segment (blocks=both) → repoussee au contact
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveObstacleCollisions — obstacle segment (both)', () => {
  const thickness = 40
  // Segment horizontal de x=200 a x=800, y=400
  const segObs: Obstacle = {
    kind: 'segment',
    x: 200, y: 400,
    x2: 800, y2: 400,
    thickness,
    blocks: 'both'
  }

  it('2a. joueur penetrant le segment par le dessus → repoussee au-dessus', () => {
    const w = new World()
    // Joueur juste au-dessus du segment mais dans l'epaisseur
    const e = makePlayer(w, 500, 390) // distance au segment = 10 < R+thickness/2 = 36
    resolveObstacleCollisions(w, [segObs])
    const pos = w.get(e, 'position')
    expect(pos).toBeDefined()
    if (pos === undefined) {return}
    // Point le plus proche sur le segment est (500, 400)
    const dy = pos.y - 400
    // La distance doit etre exactement R + thickness/2
    expect(Math.abs(dy)).toBeCloseTo(HITBOX.player + thickness / 2, 5)
    // Direction : pousse vers le haut (dy negatif)
    expect(pos.y).toBeLessThan(400)
  })

  it('2b. ennemi penetrant → repoussee exactement au contact', () => {
    const w = new World()
    const e = makeEnemy(w, 500, 395) // distance = 5 < HITBOX.enemy + thickness/2 = 32
    resolveObstacleCollisions(w, [segObs])
    const pos = w.get(e, 'position')
    expect(pos).toBeDefined()
    if (pos === undefined) {return}
    // Closest = (500, 400)
    const dy = pos.y - 400
    expect(Math.abs(dy)).toBeCloseTo(HITBOX.enemy + thickness / 2, 5)
  })

  it('2c. entite hors de portee → position inchangee', () => {
    const w = new World()
    const e = makePlayer(w, 500, 300) // loin au-dessus
    resolveObstacleCollisions(w, [segObs])
    expect(w.get(e, 'position')).toEqual({ x: 500, y: 300 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Obstacle blocks='enemies' → repousse ennemi mais PAS le joueur
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveObstacleCollisions — blocks='enemies'", () => {
  const enemyOnlyObs: Obstacle = { kind: 'circle', x: 1000, y: 1000, r: 50, blocks: 'enemies' }

  it('3a. ennemi penetrant → repoussee', () => {
    const w = new World()
    const e = makeEnemy(w, 1010, 1000) // a l'interieur
    resolveObstacleCollisions(w, [enemyOnlyObs])
    const pos = w.get(e, 'position')
    expect(pos).toBeDefined()
    if (pos === undefined) {return}
    const d = Math.hypot(pos.x - 1000, pos.y - 1000)
    expect(d).toBeCloseTo(HITBOX.enemy + 50, 5)
  })

  it('3b. joueur penetrant → PAS repoussee (garde sa position)', () => {
    const w = new World()
    const origX = 1010
    const origY = 1000
    const e = makePlayer(w, origX, origY) // a l'interieur du cercle enemies-only
    resolveObstacleCollisions(w, [enemyOnlyObs])
    expect(w.get(e, 'position')).toEqual({ x: origX, y: origY })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Determinisme : meme world + memes obstacles → meme resultat
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveObstacleCollisions — determinisme', () => {
  it('4. deux runs identiques → positions identiques', () => {
    const obstacles: Obstacle[] = [
      { kind: 'circle', x: 400, y: 400, r: 80, blocks: 'both' },
      { kind: 'segment', x: 100, y: 600, x2: 700, y2: 600, thickness: 30, blocks: 'enemies' }
    ]

    function runOnce(): { px: number; py: number; ex: number; ey: number } {
      const w = new World()
      const p = makePlayer(w, 440, 400)
      const en = makeEnemy(w, 400, 605)
      resolveObstacleCollisions(w, obstacles)
      const ppos = w.get(p, 'position')
      const epos = w.get(en, 'position')
      expect(ppos).toBeDefined()
      expect(epos).toBeDefined()
      return {
        px: ppos?.x ?? 0,
        py: ppos?.y ?? 0,
        ex: epos?.x ?? 0,
        ey: epos?.y ?? 0
      }
    }

    const r1 = runOnce()
    const r2 = runOnce()
    expect(r1.px).toBe(r2.px)
    expect(r1.py).toBe(r2.py)
    expect(r1.ex).toBe(r2.ex)
    expect(r1.ey).toBe(r2.ey)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. obstacles vide → aucune position ne change (garde sim:check)
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveObstacleCollisions — obstacles vides (terrain_vierge)', () => {
  it('5. avec obstacles=[] : positions joueur et ennemi inchangees', () => {
    const w = new World()
    const p = makePlayer(w, 300, 300)
    const en = makeEnemy(w, 700, 700)
    resolveObstacleCollisions(w, [])
    expect(w.get(p, 'position')).toEqual({ x: 300, y: 300 })
    expect(w.get(en, 'position')).toEqual({ x: 700, y: 700 })
  })
})
