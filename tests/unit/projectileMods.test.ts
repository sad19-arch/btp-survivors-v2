/**
 * Tests TDD pour les extensions de projectiles (Task 4 Persos-A) :
 *   - ricochet (`bounces`) : rebondit vers l'ennemi le plus proche non-touché
 *   - boomerang (`boomerangOutMs`) : s'inverse au bout d'un temps, revient vers l'owner
 *   - gros rayon (`projectileRadius`) : radius configuré posé lors du tir
 *
 * Construire la grille comme weaponGrid.test.ts.
 * Utiliser les vrais systèmes (collisionSystem, movementSystem, boomerangSystem).
 */

import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { SpatialGrid } from '@core/spatialGrid'
import { collisionSystem } from '@core/systems/collision'
import { boomerangSystem } from '@core/systems/boomerang'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function spawnProjectile(
  w: World,
  x: number,
  y: number,
  vx: number,
  vy: number,
  opts: {
    damage?: number
    ownerId?: number
    radius?: number
    pierce?: number
    bounces?: number
    boomerangOutMs?: number
    returning?: boolean
    hitIds?: number[]
  } = {}
): number {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: vx, y: vy })
  w.add(e, 'projectile', {
    type: 'test',
    damage: opts.damage ?? 10,
    ownerId: opts.ownerId ?? 1,
    lifeMs: 5000,
    radius: opts.radius ?? 6,
    pierce: opts.pierce ?? 0,
    ...(opts.bounces !== undefined ? { bounces: opts.bounces } : {}),
    ...(opts.boomerangOutMs !== undefined ? { boomerangOutMs: opts.boomerangOutMs } : {}),
    ...(opts.returning !== undefined ? { returning: opts.returning } : {}),
    ...(opts.hitIds !== undefined ? { hitIds: opts.hitIds } : {})
  })
  return e
}

function spawnEnemy(w: World, x: number, y: number, hp = 50): number {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 1 })
  return e
}

function spawnPlayer(w: World, x: number, y: number, playerId = 1): number {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', { playerId, speed: 0, vigilance: 0, damageMult: 1, cooldownMult: 1, pickupRadius: 0 })
  return e
}

function buildGrid(w: World): SpatialGrid {
  const g = new SpatialGrid(64)
  for (const e of w.query('enemy', 'position')) {
    const p = w.get(e, 'position')
    if (p !== undefined) {
      g.insert(e, p.x, p.y)
    }
  }
  return g
}

// ──────────────────────────────────────────────────────────────
// RICOCHET
// ──────────────────────────────────────────────────────────────

describe('ricochet (bounces)', () => {
  it('après impact sur e1, le projectile bounces:1 se redirige vers e2 et le touche', () => {
    const w = new World()
    // Projectile à (0,0) qui file vers +x à 500px/s
    const proj = spawnProjectile(w, 0, 0, 500, 0, { bounces: 1, hitIds: [] })
    // e1 à (0,0) — superposé : hit immédiat
    const e1 = spawnEnemy(w, 0, 0)
    // e2 à (100,0) — candidat de rebond
    const e2 = spawnEnemy(w, 100, 0)

    // Pas 1 : collision → e1 touché, projectile redirigé vers e2, PAS despawné
    collisionSystem(w, 16, buildGrid(w))

    expect(w.get(e1, 'health')?.hp).toBe(40)   // e1 touché
    expect(w.alive(proj)).toBe(true)             // projectile survit (bounces géré)
    expect(w.get(proj, 'projectile')?.bounces).toBe(0) // bounces décrémenté

    // La vélocité du projectile doit pointer vers e2 (x > 0, y ≈ 0)
    const vel = w.get(proj, 'velocity')
    expect(vel).toBeDefined()
    if (vel !== undefined) {
      expect(vel.x).toBeGreaterThan(0)
    }

    // Déplacer manuellement le projectile pour le mettre au contact de e2
    const ppos = w.get(proj, 'position')
    if (ppos !== undefined) {
      ppos.x = 100
      ppos.y = 0
    }

    // Pas 2 : collision → e2 touché, plus de bounces → projectile despawn
    collisionSystem(w, 16, buildGrid(w))

    expect(w.get(e2, 'health')?.hp).toBe(40)    // e2 touché
    expect(w.alive(proj)).toBe(false)             // despawné (bounces=0 épuisé)
  })

  it('sans candidat de rebond, un projectile bounces:1 despawn normalement après impact', () => {
    const w = new World()
    const proj = spawnProjectile(w, 0, 0, 500, 0, { bounces: 1, hitIds: [] })
    const e1 = spawnEnemy(w, 0, 0) // seul ennemi
    // Aucun autre ennemi vivant dans le rayon

    collisionSystem(w, 16, buildGrid(w))

    expect(w.get(e1, 'health')?.hp).toBe(40)
    expect(w.alive(proj)).toBe(false) // aucune cible de rebond → despawn classique
  })

  it('un projectile sans bounces se comporte exactement comme avant (inchangé)', () => {
    const w = new World()
    const proj = spawnProjectile(w, 0, 0, 500, 0) // pas de bounces
    const e1 = spawnEnemy(w, 0, 0)

    collisionSystem(w, 16, buildGrid(w))

    expect(w.get(e1, 'health')?.hp).toBe(40)
    expect(w.alive(proj)).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────
// BOOMERANG
// ──────────────────────────────────────────────────────────────

describe('boomerang (boomerangOutMs)', () => {
  it("après boomerangOutMs ms, returning passe à true et la vélocité s'inverse", () => {
    const w = new World()
    // Owner (joueur 1) à l'origine
    spawnPlayer(w, 0, 0, 1)

    // Projectile lancé vers +x (speed 200 px/s), boomerang en 200ms.
    // On le place loin de l'owner (200px) pour que le retour ne despawn pas immédiatement.
    const proj = spawnProjectile(w, 200, 0, 200, 0, { ownerId: 1, boomerangOutMs: 200 })

    // On simule 100ms de boomerangSystem — pas encore inversé
    boomerangSystem(w, 100)
    expect(w.get(proj, 'projectile')?.returning).toBeFalsy()

    // 101ms supplémentaires → total 201ms > 200ms → inversion
    boomerangSystem(w, 101)
    expect(w.alive(proj)).toBe(true) // pas encore à portée de l'owner (dist = 200 > 24)
    expect(w.get(proj, 'projectile')?.returning).toBe(true)

    // Après inversion, la vélocité x doit pointer vers l'owner (x négatif puisque proj est à x=200, owner à x=0)
    const vel = w.get(proj, 'velocity')
    expect(vel).toBeDefined()
    if (vel !== undefined) {
      // vx doit être négatif (se dirige vers x=0 depuis x=200)
      expect(vel.x).toBeLessThan(0)
    }
  })

  it("quand returning=true et le projectile passe à moins de 24px de l'owner, il despawn", () => {
    const w = new World()
    // Owner à l'origine
    spawnPlayer(w, 0, 0, 1)

    // Projectile déjà en retour, position proche de l'owner
    const proj = spawnProjectile(w, 20, 0, -200, 0, {
      ownerId: 1,
      boomerangOutMs: 0,
      returning: true
    })

    // Forcer returning=true directement dans le composant
    const projComp = w.get(proj, 'projectile')
    if (projComp !== undefined) {
      projComp.returning = true
    }

    // Un tick de boomerang : dist(owner) = 20 < 24 → despawn
    boomerangSystem(w, 16)

    expect(w.alive(proj)).toBe(false)
  })

  it("un projectile sans boomerangOutMs n'est pas affecté par boomerangSystem", () => {
    const w = new World()
    spawnPlayer(w, 0, 0, 1)
    // Pas de boomerangOutMs → doit rester inchangé
    const proj = spawnProjectile(w, 100, 0, 200, 0, { ownerId: 1 })

    boomerangSystem(w, 100)
    boomerangSystem(w, 100)

    expect(w.alive(proj)).toBe(true)
    const vel = w.get(proj, 'velocity')
    expect(vel?.x).toBe(200) // inchangé
    expect(vel?.y).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────
// GROS RAYON (projectileRadius)
// ──────────────────────────────────────────────────────────────

describe('projectileRadius (gros rayon)', () => {
  it('un projectile radius=50 touche un ennemi hors portée du rayon par défaut (6)', () => {
    const w = new World()
    // projectile avec grand rayon
    const proj = spawnProjectile(w, 0, 0, 0, 0, { radius: 50, pierce: 0 })
    // ennemi à 40px — hors portée avec rayon 6 (6+HITBOX.enemy=32 < 40), dans portée avec 50 (50+32=82 > 40)
    const en = spawnEnemy(w, 40, 0)

    collisionSystem(w, 16, buildGrid(w))

    expect(w.get(en, 'health')?.hp).toBeLessThan(50) // touché grâce au grand rayon
    expect(w.alive(proj)).toBe(false) // consommé (pierce=0)
  })
})
