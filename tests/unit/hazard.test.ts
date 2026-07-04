/**
 * Tests TDD — système hazard (goudron : zone au sol DoT).
 *
 * Contrat :
 *   - weaponSystem avec kind 'hazard' → spawn une entité hazard à la position joueur.
 *   - hazardSystem : tick dégâts périodiques aux ennemis dans le rayon.
 *     Avancer de tickMs  → 1 tick de dégâts.
 *     Avancer de tickMs/2 → 0 tick de dégâts.
 *   - Après lifeMs, l'entité hazard est despawnée.
 *   - count > 1 → plusieurs flaques avec offset radial déterministe.
 *   - Les hazards sont exposés dans le view-state (Simulation.getState()).
 */
import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { weaponSystem } from '@core/systems/weapon'
import { hazardSystem } from '@core/systems/hazard'
import { Simulation } from '@core/simulation'
import type { EntityId } from '@core/types'
import { BASE_STATS } from '@content/passives'

// --- Helpers ----------------------------------------------------------------

function addPlayerWithGoudron(w: World, cooldownLeftMs = 0): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x: 100, y: 200 })
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
  w.add(e, 'weapons', { slots: [{ id: 'goudron', level: 1, cooldownLeftMs }] })
  w.add(e, 'stats', { ...BASE_STATS })
  return e
}

function addPlayerWithGoudronCount2(w: World): EntityId {
  // Niveau 5 → count: 2 (selon buildLevels avec override { 5: { count: 2 } })
  const e = w.spawn()
  w.add(e, 'position', { x: 0, y: 0 })
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
  w.add(e, 'weapons', { slots: [{ id: 'goudron', level: 5, cooldownLeftMs: 0 }] })
  w.add(e, 'stats', { ...BASE_STATS })
  return e
}

function addEnemy(w: World, x: number, y: number, hp = 100): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'enemy', {
    type: 'paperasse',
    speed: 0,
    isElite: false,
    isBoss: false,
    contactDamage: 0,
    xpValue: 5
  })
  return e
}

// --- Tests ------------------------------------------------------------------

describe('weaponSystem kind hazard (goudron)', () => {
  it('spawn une entité hazard à la position du joueur quand le cooldown est écoulé', () => {
    const w = new World()
    addPlayerWithGoudron(w, 0)
    weaponSystem(w, 16)
    const hazards = [...w.query('hazard', 'position')]
    expect(hazards).toHaveLength(1)
    const id = hazards[0] as EntityId
    const pos = w.get(id, 'position')
    const haz = w.get(id, 'hazard')
    expect(pos?.x).toBe(100)
    expect(pos?.y).toBe(200)
    expect(haz?.ownerId).toBe(1)
    expect(haz?.type).toBe('goudron')
    expect(haz?.damagePerTick).toBeGreaterThan(0)
    expect(haz?.radius).toBeGreaterThan(0)
    expect(haz?.tickMs).toBeGreaterThan(0)
    expect(haz?.lifeMs).toBeGreaterThan(0)
  })

  it('ne spawne pas de hazard si le cooldown n\'est pas écoulé', () => {
    const w = new World()
    addPlayerWithGoudron(w, 2000)
    weaponSystem(w, 16)
    expect([...w.query('hazard')]).toHaveLength(0)
  })

  it('remet le cooldown après avoir posé une flaque', () => {
    const w = new World()
    const p = addPlayerWithGoudron(w, 0)
    weaponSystem(w, 16)
    const slot = w.get(p, 'weapons')?.slots[0]
    expect(slot?.cooldownLeftMs ?? 0).toBeGreaterThan(0)
  })

  it('count=2 → spawne 2 flaques avec positions légèrement différentes', () => {
    const w = new World()
    addPlayerWithGoudronCount2(w)
    weaponSystem(w, 16)
    const hazards = [...w.query('hazard', 'position')]
    expect(hazards).toHaveLength(2)
    const id0 = hazards[0] as EntityId
    const id1 = hazards[1] as EntityId
    const pos0 = w.get(id0, 'position')
    const pos1 = w.get(id1, 'position')
    // Les deux flaques doivent être à des positions différentes (offset radial).
    expect(pos0?.x).not.toBe(pos1?.x)
  })
})

describe('hazardSystem — tick de dégâts et expiration', () => {
  it('après un intervalle tickMs, inflige damagePerTick à un ennemi dans le rayon', () => {
    const w = new World()
    // Pose une flaque manuellement (tickLeftMs=0 = prêt à tick immédiatement).
    const haz = w.spawn()
    w.add(haz, 'position', { x: 0, y: 0 })
    w.add(haz, 'hazard', {
      type: 'goudron',
      ownerId: 1,
      damagePerTick: 10,
      radius: 80,
      tickMs: 400,
      tickLeftMs: 0,
      lifeMs: 3000
    })
    const enemy = addEnemy(w, 50, 0, 100) // dans le rayon (80)

    hazardSystem(w, 400) // exactement 1 tickMs → 1 tick
    expect(w.get(enemy, 'health')?.hp).toBe(90) // 100 - 10
  })

  it('avancer de tickMs/2 ne déclenche pas de tick', () => {
    const w = new World()
    const haz = w.spawn()
    w.add(haz, 'position', { x: 0, y: 0 })
    w.add(haz, 'hazard', {
      type: 'goudron',
      ownerId: 1,
      damagePerTick: 10,
      radius: 80,
      tickMs: 400,
      tickLeftMs: 400, // pas encore prêt : doit décrémenter mais pas ticker
      lifeMs: 3000
    })
    const enemy = addEnemy(w, 50, 0, 100)

    hazardSystem(w, 200) // tickMs/2 = 200 → tickLeftMs passe à 200, pas de tick
    expect(w.get(enemy, 'health')?.hp).toBe(100) // intact
  })

  it('n\'inflige pas de dégâts à un ennemi hors du rayon', () => {
    const w = new World()
    const haz = w.spawn()
    w.add(haz, 'position', { x: 0, y: 0 })
    w.add(haz, 'hazard', {
      type: 'goudron',
      ownerId: 1,
      damagePerTick: 10,
      radius: 80,
      tickMs: 400,
      tickLeftMs: 0,
      lifeMs: 3000
    })
    const far = addEnemy(w, 500, 0, 100) // hors rayon

    hazardSystem(w, 400)
    expect(w.get(far, 'health')?.hp).toBe(100) // intact
  })

  it('n\'inflige pas de dégâts aux ennemis morts', () => {
    const w = new World()
    const haz = w.spawn()
    w.add(haz, 'position', { x: 0, y: 0 })
    w.add(haz, 'hazard', {
      type: 'goudron',
      ownerId: 1,
      damagePerTick: 10,
      radius: 80,
      tickMs: 400,
      tickLeftMs: 0,
      lifeMs: 3000
    })
    const dead = addEnemy(w, 10, 0, 0) // déjà mort (hp = 0)

    hazardSystem(w, 400)
    // HP ne descend pas en négatif : un ennemi mort n'est pas ciblé.
    expect(w.get(dead, 'health')?.hp).toBe(0)
  })

  it('accumule plusieurs ticks sur une longue avance', () => {
    const w = new World()
    const haz = w.spawn()
    w.add(haz, 'position', { x: 0, y: 0 })
    w.add(haz, 'hazard', {
      type: 'goudron',
      ownerId: 1,
      damagePerTick: 10,
      radius: 80,
      tickMs: 400,
      tickLeftMs: 0,
      lifeMs: 10000
    })
    const enemy = addEnemy(w, 50, 0, 200)

    hazardSystem(w, 800) // 2 × tickMs → 2 ticks
    expect(w.get(enemy, 'health')?.hp).toBe(180) // 200 - 20
  })

  it('despawne la flaque après lifeMs', () => {
    const w = new World()
    const haz = w.spawn()
    w.add(haz, 'position', { x: 0, y: 0 })
    w.add(haz, 'hazard', {
      type: 'goudron',
      ownerId: 1,
      damagePerTick: 5,
      radius: 80,
      tickMs: 400,
      tickLeftMs: 400,
      lifeMs: 500
    })

    hazardSystem(w, 600) // > lifeMs (500) → expire
    expect(w.alive(haz)).toBe(false)
  })

  it('reste vivante tant que lifeMs n\'est pas écoulée', () => {
    const w = new World()
    const haz = w.spawn()
    w.add(haz, 'position', { x: 0, y: 0 })
    w.add(haz, 'hazard', {
      type: 'goudron',
      ownerId: 1,
      damagePerTick: 5,
      radius: 80,
      tickMs: 400,
      tickLeftMs: 400,
      lifeMs: 1000
    })

    hazardSystem(w, 400) // < lifeMs
    expect(w.alive(haz)).toBe(true)
  })
})

describe('view-state hazards (Simulation.getState)', () => {
  it('expose les hazards actifs dans getState après avoir posé une flaque', () => {
    const sim = new Simulation({ seed: 42, mode: 'solo' })
    // Donne directement l'arme goudron au joueur 1.
    sim.debugGrant({ weapons: [{ id: 'goudron', level: 1 }] }, 1)
    // Avance assez pour que le cooldown soit écoulé.
    sim.advanceTime(3000)
    const state = sim.getState()
    expect(state.hazards).toBeDefined()
    // Au moins une flaque a dû être posée dans les 3 secondes.
    expect(state.hazards.length).toBeGreaterThanOrEqual(1)
    const h = state.hazards[0]
    expect(h).toBeDefined()
    if (h !== undefined) {
      expect(typeof h.id).toBe('number')
      expect(typeof h.x).toBe('number')
      expect(typeof h.y).toBe('number')
      expect(typeof h.radius).toBe('number')
      expect(typeof h.remainingMs).toBe('number')
    }
  })
})
