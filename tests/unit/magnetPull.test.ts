import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { pickupSystem, startMagnetPull } from '@core/systems/pickup'
import { initialProgress } from '@core/systems/leveling'
import type { EntityId, PickupKind } from '@core/types'

function addPlayer(w: World, x: number, y: number): EntityId {
  const e = w.spawn()
  w.add(e, 'position', { x, y })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
  w.add(e, 'progress', initialProgress())
  return e
}

function addGem(w: World, x: number, y: number, value = 10, type: PickupKind = 'xp'): EntityId {
  const g = w.spawn()
  w.add(g, 'position', { x, y })
  const pk: { type: PickupKind; value: number; lifeMs?: number } = { type, value }
  if (type === 'xp') {
    pk.lifeMs = 20000
  }
  w.add(g, 'pickup', pk)
  return g
}

const xpOf = (w: World, e: EntityId): number => w.get(e, 'progress')?.xp ?? -1
const posXOf = (w: World, e: EntityId): number => w.get(e, 'position')?.x ?? NaN
const isMagnetized = (w: World, e: EntityId): boolean => w.get(e, 'pickup')?.magnetized === true

describe('aimant progressif', () => {
  it('startMagnetPull marque les gemmes xp (pas les heal)', () => {
    const w = new World()
    const g1 = addGem(w, 500, 0)
    const g2 = addGem(w, -300, 0)
    const heal = addGem(w, 100, 0, 18, 'heal')
    startMagnetPull(w)
    expect(isMagnetized(w, g1)).toBe(true)
    expect(isMagnetized(w, g2)).toBe(true)
    expect(isMagnetized(w, heal)).toBe(false)
  })

  it('une gemme aimantée est tirée vers le joueur même hors pickupRadius, sans crédit instantané', () => {
    const w = new World()
    const p = addPlayer(w, 0, 0)
    const gem = addGem(w, 500, 0, 10) // 500 > pickupRadius (90)
    startMagnetPull(w)
    const before = posXOf(w, gem)
    pickupSystem(w, 100, [])
    expect(w.alive(gem)).toBe(true)
    expect(posXOf(w, gem)).toBeLessThan(before) // rapprochée
    expect(xpOf(w, p)).toBe(0) // pas de crédit avant le contact
  })

  it('ramasser un aimant NE crédite PAS instantanément toutes les gemmes (plus de vacuum sec)', () => {
    const w = new World()
    const p = addPlayer(w, 0, 0)
    const gem = addGem(w, 500, 0, 10)
    const mag = addGem(w, 0, 0, 0, 'magnet') // sur le joueur → collecté au 1er tick
    pickupSystem(w, 16, [])
    expect(w.alive(mag)).toBe(false) // aimant consommé
    expect(w.alive(gem)).toBe(true) // la gemme n'a PAS disparu d'un coup
    expect(xpOf(w, p)).toBe(0) // pas créditée tant qu'elle n'a pas atteint le joueur
    expect(isMagnetized(w, gem)).toBe(true) // désormais aimantée
  })

  it('la gemme aimantée finit collectée au contact (XP créditée)', () => {
    const w = new World()
    const p = addPlayer(w, 0, 0)
    const gem = addGem(w, 300, 0, 10)
    startMagnetPull(w)
    for (let i = 0; i < 60; i++) {
      pickupSystem(w, 16, [])
    }
    expect(w.alive(gem)).toBe(false)
    expect(xpOf(w, p)).toBe(10)
  })
})
