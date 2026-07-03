import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { tetherSystem } from '@core/systems/tether'
import type { PlayerComp } from '@core/types'

const PLAYER: PlayerComp = {
  playerId: 1,
  speed: 200,
  vigilance: 100,
  damageMult: 1,
  cooldownMult: 1,
  pickupRadius: 90
}

const MAX_RADIUS = 450

function makePlayer(w: World, id: number, x: number, y: number, vx: number, vy: number): number {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'velocity', { x: vx, y: vy })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', { ...PLAYER, playerId: id })
  return e
}

describe('tetherSystem (fonction pure)', () => {
  it('annule la composante radiale sortante au-delà du rayon', () => {
    const w = new World()
    // Centroïde attendu : (0,0). Deux joueurs opposés, distance chacun 600 > 2*450? non,
    // mais chacun est à 600 du centroïde (>450), donc hors-rayon.
    makePlayer(w, 1, 600, 0, 1, 0) // vitesse purement sortante (+x, éloigne du centre)
    makePlayer(w, 2, -600, 0, -1, 0) // vitesse purement sortante (-x, éloigne du centre)

    tetherSystem(w, 2, MAX_RADIUS)

    const entities = [...w.query('player', 'velocity')]
    const v1 = w.get(entities[0], 'velocity')
    const v2 = w.get(entities[1], 'velocity')
    expect(v1?.x).toBeCloseTo(0)
    expect(v1?.y).toBeCloseTo(0)
    expect(v2?.x).toBeCloseTo(0)
    expect(v2?.y).toBeCloseTo(0)
  })

  it('conserve la vélocité rentrante (dot radial négatif)', () => {
    const w = new World()
    makePlayer(w, 1, 600, 0, -1, 0) // vers le centre : conservé
    makePlayer(w, 2, -600, 0, 1, 0) // contrebalance le centroïde à (0,0)

    tetherSystem(w, 2, MAX_RADIUS)

    const entities = [...w.query('player', 'velocity')]
    const v1 = w.get(entities[0], 'velocity')
    expect(v1).toEqual({ x: -1, y: 0 })
  })

  it('conserve la vélocité tangentielle (dot radial nul)', () => {
    const w = new World()
    makePlayer(w, 1, 600, 0, 0, 1) // tangentielle pure : conservée
    makePlayer(w, 2, -600, 0, 0, -1) // maintient le centroïde à (0,0)

    tetherSystem(w, 2, MAX_RADIUS)

    const entities = [...w.query('player', 'velocity')]
    const v1 = w.get(entities[0], 'velocity')
    expect(v1?.x).toBeCloseTo(0)
    expect(v1?.y).toBeCloseTo(1)
  })

  it('ne touche à rien dans le rayon (d < maxRadius)', () => {
    const w = new World()
    makePlayer(w, 1, 100, 0, 1, 0)
    makePlayer(w, 2, -100, 0, -1, 0)

    tetherSystem(w, 2, MAX_RADIUS)

    const entities = [...w.query('player', 'velocity')]
    const v1 = w.get(entities[0], 'velocity')
    const v2 = w.get(entities[1], 'velocity')
    expect(v1).toEqual({ x: 1, y: 0 })
    expect(v2).toEqual({ x: -1, y: 0 })
  })

  it('no-op strict en solo (playerCount<=1), quel que soit l’écartement', () => {
    const w = new World()
    makePlayer(w, 1, 600, 0, 1, 0)
    makePlayer(w, 2, -600, 0, -1, 0)

    tetherSystem(w, 1, MAX_RADIUS)

    const entities = [...w.query('player', 'velocity')]
    const v1 = w.get(entities[0], 'velocity')
    const v2 = w.get(entities[1], 'velocity')
    expect(v1).toEqual({ x: 1, y: 0 })
    expect(v2).toEqual({ x: -1, y: 0 })
  })

  it('ignore un joueur mort (hp<=0) dans le calcul du centroïde et ne le mute pas', () => {
    const w = new World()
    const alive = makePlayer(w, 1, 600, 0, 1, 0)
    const dead = makePlayer(w, 2, -600, 0, -1, 0)
    const deadHealth = w.get(dead, 'health')
    if (deadHealth !== undefined) {
      deadHealth.hp = 0
    }

    tetherSystem(w, 2, MAX_RADIUS)

    // Centroïde recalculé uniquement sur le joueur 1 vivant → centroïde = (600,0) →
    // le joueur 1 est pile au centroïde (d=0) → guard d===0 → inchangé.
    const v1 = w.get(alive, 'velocity')
    expect(v1).toEqual({ x: 1, y: 0 })
    // Le joueur mort n'est pas muté par le système (skip dès le filtre alive).
    const v2 = w.get(dead, 'velocity')
    expect(v2).toEqual({ x: -1, y: 0 })
  })
})
