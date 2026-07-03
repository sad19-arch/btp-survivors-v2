import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import { routeInput, type FrameInput } from '@input/intents'

describe('routeInput', () => {
  it('navigue dans le menu titre via les actions ponctuelles', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['down'] }]]))
    expect(app.getState().menu?.index).toBe(1)
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['up'] }]]))
    expect(app.getState().menu?.index).toBe(0)
  })

  it('confirme « Jouer » et lance la partie', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['confirm'] }]]))
    expect(app.getState().screen).toBe('game')
  })

  it('transmet le déplacement au joueur en jeu', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    routeInput(app, new Map([[1, { move: { x: 1, y: 0 }, pressed: [] }]]))
    app.advanceTime(500)
    expect(app.getState().players[0]?.vx ?? 0).toBeGreaterThan(0)
  })

  it('« pause » bascule en pause puis reprend', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['pause'] }]]))
    expect(app.getState().screen).toBe('paused')
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['pause'] }]]))
    expect(app.getState().screen).toBe('game')
  })

  it('« back » en jeu met en pause', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['back'] }]]))
    expect(app.getState().screen).toBe('paused')
  })

  it('déplace chaque joueur indépendamment en coop', () => {
    const app = new App({ seed: 1, mode: 'coop', autostart: true })
    const perPlayer = new Map<number, FrameInput>([
      [1, { move: { x: 1, y: 0 }, pressed: [] }],
      [2, { move: { x: -1, y: 0 }, pressed: [] }],
    ])
    routeInput(app, perPlayer)
    app.advanceTime(500)
    const state = app.getState()
    expect(state.players[0]?.vx ?? 0).toBeGreaterThan(0)
    expect(state.players[1]?.vx ?? 0).toBeLessThan(0)
  })

  it('agrège la navigation menu : un seul joueur appuie → un cran', () => {
    const app = new App({ seed: 1, mode: 'coop', autostart: false })
    const perPlayer = new Map<number, FrameInput>([
      [1, { move: { x: 0, y: 0 }, pressed: [] }],
      [2, { move: { x: 0, y: 0 }, pressed: ['down'] }],
    ])
    routeInput(app, perPlayer)
    expect(app.getState().menu?.index).toBe(1)
  })

  it('dédup la navigation menu : deux joueurs appuient la même direction → un seul cran', () => {
    const app = new App({ seed: 1, mode: 'coop', autostart: false })
    const perPlayer = new Map<number, FrameInput>([
      [1, { move: { x: 0, y: 0 }, pressed: ['down'] }],
      [2, { move: { x: 0, y: 0 }, pressed: ['down'] }],
    ])
    routeInput(app, perPlayer)
    expect(app.getState().menu?.index).toBe(1)
  })
})
