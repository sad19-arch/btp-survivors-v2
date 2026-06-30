import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import { routeInput } from '@input/intents'

describe('routeInput', () => {
  it('navigue dans le menu titre via les actions ponctuelles', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    routeInput(app, { move: { x: 0, y: 0 }, pressed: ['down'] })
    expect(app.getState().menu?.index).toBe(1)
    routeInput(app, { move: { x: 0, y: 0 }, pressed: ['up'] })
    expect(app.getState().menu?.index).toBe(0)
  })

  it('confirme « Jouer » et lance la partie', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    routeInput(app, { move: { x: 0, y: 0 }, pressed: ['confirm'] })
    expect(app.getState().screen).toBe('game')
  })

  it('transmet le déplacement au joueur en jeu', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    routeInput(app, { move: { x: 1, y: 0 }, pressed: [] })
    app.advanceTime(500)
    expect(app.getState().players[0]?.vx ?? 0).toBeGreaterThan(0)
  })

  it('« pause » bascule en pause puis reprend', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    routeInput(app, { move: { x: 0, y: 0 }, pressed: ['pause'] })
    expect(app.getState().screen).toBe('paused')
    routeInput(app, { move: { x: 0, y: 0 }, pressed: ['pause'] })
    expect(app.getState().screen).toBe('game')
  })

  it('« back » en jeu met en pause', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    routeInput(app, { move: { x: 0, y: 0 }, pressed: ['back'] })
    expect(app.getState().screen).toBe('paused')
  })
})
