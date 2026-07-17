import { describe, it, expect } from 'vitest'
import {
  commutePos,
  panicDecision,
  AT_END_THRESHOLD,
  PANIC_R
} from '@render/workerBehavior'

// Points de test : A=(0,0), B=(300,0), dist=300
// Vitesse 60 px/s -> aller=5s, retour=5s, periode=10s
const SPEED = 60

describe('commutePos', () => {
  it('retourne A au demarrage (t=0)', () => {
    const p = commutePos(0, 0, 300, 0, 0, SPEED)
    expect(p.x).toBeCloseTo(0, 1)
    expect(p.y).toBeCloseTo(0, 1)
    expect(p.leg).toBe('ab')
  })

  it('retourne B a la fin du trajet aller (t=4999ms)', () => {
    // Juste avant la fin de la phase aller (leg=ab)
    const p = commutePos(0, 0, 300, 0, 4999, SPEED)
    expect(p.x).toBeCloseTo(300, 0)
    expect(p.y).toBeCloseTo(0, 1)
    expect(p.leg).toBe('ab')
    expect(p.atEnd).toBe(true)
  })

  it('leg=ba sur le trajet retour (t juste apres 5000ms)', () => {
    const p = commutePos(0, 0, 300, 0, 5001, SPEED)
    expect(p.leg).toBe('ba')
    expect(p.x).toBeLessThan(300)
    expect(p.x).toBeGreaterThan(0)
  })

  it('revient en A a la fin du cycle (t=10000ms)', () => {
    const p = commutePos(0, 0, 300, 0, 10000, SPEED)
    expect(p.x).toBeCloseTo(0, 1)
    expect(p.y).toBeCloseTo(0, 1)
    expect(p.atEnd).toBe(true)
  })

  it('est deterministe : meme entree => meme resultat', () => {
    const r1 = commutePos(100, 200, 500, 800, 12345, 75)
    const r2 = commutePos(100, 200, 500, 800, 12345, 75)
    expect(r1).toEqual(r2)
  })

  it('atEnd=false en milieu de trajet (x=150)', () => {
    // A 2500ms, x=150px = milieu, loin des extremites
    const p = commutePos(0, 0, 300, 0, 2500, SPEED)
    expect(p.x).toBeCloseTo(150, 1)
    expect(p.atEnd).toBe(false)
  })

  it('atEnd=true quand le worker est dans AT_END_THRESHOLD de A (t petit)', () => {
    // A t=0, x=0, distToA=0 < AT_END_THRESHOLD -> atEnd=true
    // Verification a t=0 (debut = extremite A)
    const p = commutePos(0, 0, 300, 0, 0, SPEED)
    expect(p.atEnd).toBe(true)
    // Et a t tel que x=AT_END_THRESHOLD/2 (bien dans le seuil)
    const tHalf = ((AT_END_THRESHOLD / 2) / 300) * 5000
    const p2 = commutePos(0, 0, 300, 0, tHalf, SPEED)
    expect(p2.atEnd).toBe(true)
  })

  it('cas degenere A=B : retourne A, atEnd=true', () => {
    const p = commutePos(50, 50, 50, 50, 9999, 60)
    expect(p.x).toBe(50)
    expect(p.y).toBe(50)
    expect(p.atEnd).toBe(true)
  })

  it('gere un trajet diagonal correctement', () => {
    // A=(0,0) B=(300,400), dist=500, speed=50 -> aller=10s
    const start = commutePos(0, 0, 300, 400, 0, 50)
    expect(start.x).toBeCloseTo(0, 1)
    expect(start.y).toBeCloseTo(0, 1)
    expect(start.leg).toBe('ab')
    // Mi-aller : t=5000ms, x=150, y=200
    const mid = commutePos(0, 0, 300, 400, 5000, 50)
    expect(mid.x).toBeCloseTo(150, 1)
    expect(mid.y).toBeCloseTo(200, 1)
    expect(mid.leg).toBe('ab')
  })
})

describe('panicDecision', () => {
  it('pas de fuite si pas ennemi (ex/ey=null)', () => {
    const r = panicDecision(100, 100, null, null, PANIC_R)
    expect(r.flee).toBe(false)
    expect(r.fx).toBe(0)
    expect(r.fy).toBe(0)
  })

  it('pas de fuite si ennemi hors du rayon (dist > PANIC_R)', () => {
    // Ennemi a 200 px, PANIC_R=180
    const r = panicDecision(0, 0, 200, 0, PANIC_R)
    expect(r.flee).toBe(false)
  })

  it('fuite declenchee si ennemi dans le rayon (dist < PANIC_R)', () => {
    // Ennemi a 100 px < 180
    const r = panicDecision(0, 0, 100, 0, PANIC_R)
    expect(r.flee).toBe(true)
  })

  it('direction de fuite opposee a l\'ennemi, normalisee', () => {
    // Worker en (100,0), ennemi en (0,0) -> fuite vers +x
    const r = panicDecision(100, 0, 0, 0, PANIC_R)
    expect(r.flee).toBe(true)
    expect(r.fx).toBeCloseTo(1, 3)
    expect(r.fy).toBeCloseTo(0, 3)
  })

  it('direction normalisee pour ennemi diagonal', () => {
    // Worker en (0,0), ennemi en (3,4) (dist=5) -> fuite (-3/5, -4/5)
    const r = panicDecision(0, 0, 3, 4, 10)
    expect(r.flee).toBe(true)
    expect(r.fx).toBeCloseTo(-3 / 5, 3)
    expect(r.fy).toBeCloseTo(-4 / 5, 3)
  })

  it('cas ennemi coincident : fuite vers le haut (convention)', () => {
    const r = panicDecision(50, 50, 50, 50, PANIC_R)
    expect(r.flee).toBe(true)
    expect(r.fx).toBe(0)
    expect(r.fy).toBe(-1)
  })

  it('exactement sur la bordure du rayon : pas de fuite (dist >= panicR)', () => {
    const r = panicDecision(0, 0, PANIC_R, 0, PANIC_R)
    expect(r.flee).toBe(false)
  })
})
