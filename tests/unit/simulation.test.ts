import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'

describe('Simulation (façade / seam de test)', () => {
  it('démarre une partie solo prête, avec seed et un joueur vivant', () => {
    const sim = new Simulation({ seed: 42, mode: 'solo' })
    const s = sim.getState()
    expect(s.scene).toBe('game')
    expect(s.seed).toBe(42)
    expect(s.coordSystem).toContain('top-left')
    expect(s.players).toHaveLength(1)
    const p0 = s.players[0]
    expect(p0?.id).toBe(1)
    expect(p0?.alive).toBe(true)
    expect(p0?.hp).toBe(p0?.maxHp)
  })

  it('spawne le bon nombre de joueurs selon le mode', () => {
    expect(new Simulation({ seed: 1, mode: 'coop' }).getState().players).toHaveLength(2)
    expect(new Simulation({ seed: 1, mode: 'coop4' }).getState().players).toHaveLength(4)
  })

  it('setInput + advanceTime déplace le joueur dans la direction demandée', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    const before = sim.getState().players[0]
    sim.setInput(1, { move: { x: 1, y: 0 }, attack: false })
    sim.advanceTime(1000)
    const after = sim.getState().players[0]
    expect(after && before && after.x).toBeGreaterThan(before?.x ?? 0)
    expect(after?.y).toBeCloseTo(before?.y ?? 0)
  })

  it('advanceTime fait avancer le temps logique par pas fixes', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    expect(sim.getState().elapsedMs).toBe(0)
    sim.advanceTime(1000)
    expect(sim.getState().elapsedMs).toBeGreaterThan(0)
    expect(sim.getState().elapsedMs).toBeLessThanOrEqual(1000)
  })

  it('est déterministe : même seed + mêmes inputs ⇒ même état final', () => {
    const run = (): unknown => {
      const sim = new Simulation({ seed: 7, mode: 'solo' })
      sim.setInput(1, { move: { x: 1, y: 0.5 }, attack: false })
      sim.advanceTime(2000)
      return sim.getState()
    }
    expect(run()).toEqual(run())
  })

  it('setSeed réinitialise la partie de façon déterministe', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    sim.setInput(1, { move: { x: 1, y: 0 }, attack: false })
    sim.advanceTime(500)
    sim.setSeed(1)
    const reset = sim.getState()
    expect(reset.elapsedMs).toBe(0)
    expect(reset.seed).toBe(1)
  })

  it('renderToText renvoie une vue texte non vide', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    const text = sim.renderToText()
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(0)
  })

  it('expose un EventTarget pour les événements de jeu', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    expect(sim.events).toBeInstanceOf(EventTarget)
  })
})
