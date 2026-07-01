import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { clamp, worldBoundsSystem } from '@core/systems/bounds'
import type { PlayerComp } from '@core/types'

const PLAYER: PlayerComp = {
  playerId: 1,
  speed: 200,
  vigilance: 100,
  damageMult: 1,
  cooldownMult: 1,
  pickupRadius: 90
}

const BOUNDS = { width: 1600, height: 1200 }

describe('clamp (fonction pure)', () => {
  it('laisse une valeur dans l’intervalle inchangée', () => {
    expect(clamp(50, 0, 100)).toBe(50)
  })

  it('ramène une valeur sous le minimum au minimum', () => {
    expect(clamp(-30, 0, 100)).toBe(0)
  })

  it('ramène une valeur au-dessus du maximum au maximum', () => {
    expect(clamp(9999, 0, 100)).toBe(100)
  })

  it('accepte les bornes exactes', () => {
    expect(clamp(0, 0, 100)).toBe(0)
    expect(clamp(100, 0, 100)).toBe(100)
  })
})

describe('worldBoundsSystem (fonction pure)', () => {
  it('borne un joueur sorti à droite / en bas au bord du monde', () => {
    const w = new World()
    const e = w.spawn()
    w.add(e, 'position', { x: 12800, y: 5000 })
    w.add(e, 'player', PLAYER)
    worldBoundsSystem(w, BOUNDS)
    expect(w.get(e, 'position')).toEqual({ x: 1600, y: 1200 })
  })

  it('borne un joueur sorti à gauche / en haut à l’origine', () => {
    const w = new World()
    const e = w.spawn()
    w.add(e, 'position', { x: -500, y: -20 })
    w.add(e, 'player', PLAYER)
    worldBoundsSystem(w, BOUNDS)
    expect(w.get(e, 'position')).toEqual({ x: 0, y: 0 })
  })

  it('laisse un joueur déjà dans le monde inchangé', () => {
    const w = new World()
    const e = w.spawn()
    w.add(e, 'position', { x: 800, y: 600 })
    w.add(e, 'player', PLAYER)
    worldBoundsSystem(w, BOUNDS)
    expect(w.get(e, 'position')).toEqual({ x: 800, y: 600 })
  })

  it('ne borne PAS les ennemis (apparition hors-champ sur l’anneau de spawn)', () => {
    const w = new World()
    const e = w.spawn()
    // Un ennemi peut légitimement être hors du monde au spawn.
    w.add(e, 'position', { x: -300, y: 1800 })
    w.add(e, 'enemy', {
      type: 'x',
      speed: 60,
      isElite: false,
      isBoss: false,
      contactDamage: 1,
      xpValue: 1
    })
    worldBoundsSystem(w, BOUNDS)
    expect(w.get(e, 'position')).toEqual({ x: -300, y: 1800 })
  })
})
