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
  it('spawn une entité hazard AUTOUR du joueur (décalée, pas sur lui) quand le cooldown est écoulé', () => {
    const w = new World()
    addPlayerWithGoudron(w, 0) // joueur en (100,200), immobile
    weaponSystem(w, 16)
    const hazards = [...w.query('hazard', 'position')]
    expect(hazards).toHaveLength(1)
    const id = hazards[0] as EntityId
    const pos = w.get(id, 'position')
    const haz = w.get(id, 'hazard')
    // La flaque n'est PAS centrée sur le joueur : décalée d'environ 64 px (HAZARD_OFFSET_RADIUS).
    const dist = Math.hypot((pos?.x ?? 100) - 100, (pos?.y ?? 200) - 200)
    expect(dist).toBeGreaterThan(40)
    expect(dist).toBeLessThan(90)
    expect(haz?.ownerId).toBe(1)
    expect(haz?.type).toBe('goudron')
    expect(haz?.damagePerTick).toBeGreaterThan(0)
    expect(haz?.radius).toBeGreaterThan(0)
    expect(haz?.tickMs).toBeGreaterThan(0)
    expect(haz?.lifeMs).toBeGreaterThan(0)
  })

  it('oriente la flaque vers le déplacement du joueur (goudron posé devant lui)', () => {
    const w = new World()
    const p = addPlayerWithGoudron(w, 0) // joueur en (100,200)
    const v = w.get(p, 'velocity')
    if (v !== undefined) {
      v.x = 100 // se déplace vers la droite (+x)
      v.y = 0
    }
    weaponSystem(w, 16)
    const pos = w.get([...w.query('hazard', 'position')][0] as EntityId, 'position')
    // Flaque devant le joueur : décalée en +x, ~alignée en y.
    expect((pos?.x ?? 100) - 100).toBeGreaterThan(40)
    expect(Math.abs((pos?.y ?? 200) - 200)).toBeLessThan(5)
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

  it('count=2 → 2 flaques décalées autour du joueur, à des positions différentes', () => {
    const w = new World()
    addPlayerWithGoudronCount2(w) // joueur en (0,0), immobile
    weaponSystem(w, 16)
    const hazards = [...w.query('hazard', 'position')]
    expect(hazards).toHaveLength(2)
    const pos0 = w.get(hazards[0] as EntityId, 'position')
    const pos1 = w.get(hazards[1] as EntityId, 'position')
    // Positions distinctes (réparties autour de la direction de base)...
    expect(pos0?.y).not.toBe(pos1?.y)
    // ...et toutes deux décalées du centre (≈64 px), jamais sur le joueur.
    expect(Math.hypot(pos0?.x ?? 0, pos0?.y ?? 0)).toBeGreaterThan(40)
    expect(Math.hypot(pos1?.x ?? 0, pos1?.y ?? 0)).toBeGreaterThan(40)
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
