import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { weaponSystem } from '@core/systems/weapon'
import type { EntityId } from '@core/types'
import type { AuraPulse } from '@core/events'
import { BASE_STATS } from '@content/passives'

function addPlayer(w: World, weaponId: string, facing?: { x: number; y: number }): EntityId {
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
    pickupRadius: 90,
    ...(facing !== undefined ? { facing } : {})
  })
  w.add(e, 'weapons', { slots: [{ id: weaponId, level: 1, cooldownLeftMs: 0 }] })
  w.add(e, 'stats', { ...BASE_STATS })
  return e
}

function addEnemy(w: World, x: number, y: number, hp = 100): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'enemy', { type: 'paperasse', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 5 })
  return e
}

describe('arme aura (marteau)', () => {
  it('inflige des dégâts aux ennemis dans le rayon de l’onde', () => {
    const w = new World()
    addPlayer(w, 'marteau')
    const near = addEnemy(w, 100, 0) // dans le rayon (175 au niveau 1)
    weaponSystem(w, 16) // cooldown à 0 → impulsion immédiate
    expect(w.get(near, 'health')?.hp ?? 100).toBeLessThan(100)
  })

  it('épargne les ennemis hors du rayon', () => {
    const w = new World()
    addPlayer(w, 'marteau')
    const far = addEnemy(w, 500, 0)
    weaponSystem(w, 16)
    expect(w.get(far, 'health')?.hp).toBe(100)
  })

  it('pousse une impulsion de kind "aura" pour le VFX', () => {
    const w = new World()
    addPlayer(w, 'marteau')
    const pulses: AuraPulse[] = []
    weaponSystem(w, 16, pulses)
    expect(pulses).toHaveLength(1)
    expect(pulses[0]?.kind).toBe('aura')
  })
})

describe('arme sweep (pied-de-biche)', () => {
  it('frappe devant le joueur et épargne les ennemis derrière ou sur le côté', () => {
    const w = new World()
    addPlayer(w, 'pied_de_biche', { x: 1, y: 0 })
    const front = addEnemy(w, 100, 0)
    const back = addEnemy(w, -110, 0)
    const side = addEnemy(w, 0, 110)

    weaponSystem(w, 16)

    expect(w.get(front, 'health')?.hp ?? 100).toBeLessThan(100)
    expect(w.get(back, 'health')?.hp).toBe(100)
    expect(w.get(side, 'health')?.hp).toBe(100)
  })

  it('s’auto-oriente vers l’ennemi le plus proche indépendamment du déplacement', () => {
    const w = new World()
    addPlayer(w, 'pied_de_biche', { x: -1, y: 0 })
    const nearest = addEnemy(w, 0, 50)
    const opposite = addEnemy(w, 0, -100)

    weaponSystem(w, 16)

    expect(w.get(nearest, 'health')?.hp ?? 100).toBeLessThan(100)
    expect(w.get(opposite, 'health')?.hp).toBe(100)
  })

  it('pousse une impulsion de kind "sweep" pour le VFX', () => {
    const w = new World()
    addPlayer(w, 'pied_de_biche', { x: 1, y: 0 })
    addEnemy(w, 0, -50)
    const pulses: AuraPulse[] = []
    weaponSystem(w, 16, pulses)
    expect(pulses).toHaveLength(1)
    expect(pulses[0]?.kind).toBe('sweep')
    expect(pulses[0]?.dirX).toBeCloseTo(0)
    expect(pulses[0]?.dirY).toBe(-1)
  })
})

describe('arme strike (court-circuit)', () => {
  it('pousse une impulsion de kind "strike" pour le VFX', () => {
    const w = new World()
    addPlayer(w, 'court_circuit')
    addEnemy(w, 10, 0)
    const pulses: AuraPulse[] = []
    weaponSystem(w, 16, pulses)
    expect(pulses.length).toBeGreaterThan(0)
    expect(pulses[0]?.kind).toBe('strike')
    expect(pulses[0]?.ownerId).toBe(1)
    expect(pulses[0]?.sourceX).toBe(0)
    expect(pulses[0]?.sourceY).toBe(0)
  })
})

describe('arme orbitale (scie)', () => {
  it('crée les lames en orbite autour du joueur', () => {
    const w = new World()
    addPlayer(w, 'scie')
    weaponSystem(w, 16)
    const orbiters = [...w.query('orbiter')]
    expect(orbiters.length).toBe(2) // count niveau 1 = 2
  })

  it('blesse un ennemi situé sur la trajectoire des lames', () => {
    const w = new World()
    addPlayer(w, 'scie')
    const enemy = addEnemy(w, 104, 0) // sur le cercle d'orbite (rayon 104 au niveau 1)
    // Laisse les lames balayer ~1.5 tour.
    for (let i = 0; i < 200; i++) {
      weaponSystem(w, 16)
    }
    expect(w.get(enemy, 'health')?.hp ?? 100).toBeLessThan(100)
  })

  it('émet un impact spécialisé exactement sur chaque victime touchée', () => {
    const w = new World()
    addPlayer(w, 'scie')
    const enemy = addEnemy(w, 104, 0)
    const pulses: AuraPulse[] = []

    weaponSystem(w, 16, pulses)

    expect(w.get(enemy, 'health')?.hp ?? 100).toBeLessThan(100)
    const impact = pulses.find((pulse) => pulse.kind === 'orbital_hit')
    expect(impact).toMatchObject({
      x: 104,
      y: 0,
      weaponId: 'scie',
      ownerId: 1
    })
  })

  it('borne les VFX de contact sans borner les victimes de la Scie', () => {
    const w = new World()
    addPlayer(w, 'scie')
    const enemies = Array.from({ length: 20 }, () => addEnemy(w, 104, 0))
    const pulses: AuraPulse[] = []

    weaponSystem(w, 16, pulses)

    expect(enemies.every((enemy) => (w.get(enemy, 'health')?.hp ?? 100) < 100)).toBe(true)
    expect(pulses.filter((pulse) => pulse.kind === 'orbital_hit')).toHaveLength(12)
  })

  it('supprime les lames quand le propriétaire meurt', () => {
    const w = new World()
    const p = addPlayer(w, 'scie')
    weaponSystem(w, 16)
    expect([...w.query('orbiter')].length).toBe(2)
    const h = w.get(p, 'health')
    if (h !== undefined) {
      h.hp = 0
    }
    weaponSystem(w, 16)
    expect([...w.query('orbiter')].length).toBe(0)
  })
})
