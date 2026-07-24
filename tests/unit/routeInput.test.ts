import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import { routeInput, type FrameInput } from '@input/intents'

describe('routeInput', () => {
  it('navigue dans le menu titre via les actions ponctuelles', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['down'], action: false }]]))
    expect(app.getState().menu?.index).toBe(1)
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['up'], action: false }]]))
    expect(app.getState().menu?.index).toBe(0)
  })

  it('confirme « Jouer » puis le personnage par défaut et lance la partie', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['confirm'], action: false }]]))
    expect(app.getState().screen).toBe('characterSelect')
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['confirm'], action: false }]]))
    expect(app.getState().screen).toBe('game')
  })

  it('transmet le déplacement au joueur en jeu', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    routeInput(app, new Map([[1, { move: { x: 1, y: 0 }, pressed: [], action: false }]]))
    app.advanceTime(500)
    expect(app.getState().players[0]?.vx ?? 0).toBeGreaterThan(0)
  })

  it('« pause » bascule en pause puis reprend', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['pause'], action: false }]]))
    expect(app.getState().screen).toBe('paused')
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['pause'], action: false }]]))
    expect(app.getState().screen).toBe('game')
  })

  it('« back » en jeu met en pause', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['back'], action: false }]]))
    expect(app.getState().screen).toBe('paused')
  })

  it('« minimap » bascule la mini-carte via le routeur', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const before = app.getState().minimapVisible
    routeInput(app, new Map([[1, { move: { x: 0, y: 0 }, pressed: ['minimap'], action: false }]]))
    expect(app.getState().minimapVisible).toBe(!before)
  })

  it('déplace chaque joueur indépendamment en coop', () => {
    const app = new App({ seed: 1, mode: 'coop', autostart: true })
    const perPlayer = new Map<number, FrameInput>([
      [1, { move: { x: 1, y: 0 }, pressed: [], action: false }],
      [2, { move: { x: -1, y: 0 }, pressed: [], action: false }],
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
      [1, { move: { x: 0, y: 0 }, pressed: [], action: false }],
      [2, { move: { x: 0, y: 0 }, pressed: ['down'], action: false }],
    ])
    routeInput(app, perPlayer)
    expect(app.getState().menu?.index).toBe(1)
  })

  it('dédup la navigation menu : deux joueurs appuient la même direction → un seul cran', () => {
    const app = new App({ seed: 1, mode: 'coop', autostart: false })
    const perPlayer = new Map<number, FrameInput>([
      [1, { move: { x: 0, y: 0 }, pressed: ['down'], action: false }],
      [2, { move: { x: 0, y: 0 }, pressed: ['down'], action: false }],
    ])
    routeInput(app, perPlayer)
    expect(app.getState().menu?.index).toBe(1)
  })

  it.each([1, 2, 3, 4])(
    'réserve le curseur de level-up à son propriétaire J%d',
    (ownerId) => {
      const app = new App({ seed: 11, mode: 'coop4', autostart: true })
      app.debugAddXp(1000, ownerId)
      app.advanceTime(100)
      expect(app.getState().pendingLevelUp?.playerId).toBe(ownerId)
      expect(app.getState().menu?.index).toBe(0)

      for (let playerId = 1; playerId <= 4; playerId++) {
        if (playerId === ownerId) {
          continue
        }
        routeInput(
          app,
          new Map([
            [playerId, { move: { x: 0, y: 0 }, pressed: ['right'], action: false }],
          ])
        )
        expect(app.getState().menu?.index).toBe(0)
      }

      routeInput(
        app,
        new Map([
          [ownerId, { move: { x: 0, y: 0 }, pressed: ['right'], action: false }],
        ])
      )
      expect(app.getState().menu?.index).toBe(1)
    }
  )

  it('isole les quatre curseurs et démarre après quatre confirmations', () => {
    const app = new App({ seed: 11, mode: 'coop4', autostart: false })
    const press = (playerId: number, action: FrameInput['pressed'][number]) => {
      routeInput(
        app,
        new Map([
          [playerId, { move: { x: 0, y: 0 }, pressed: [action], action: false }],
        ])
      )
    }

    press(1, 'confirm')
    expect(app.getState().characterSelect?.players).toHaveLength(4)

    for (let playerId = 1; playerId <= 4; playerId++) {
      const before = app.getState().characterSelect?.players.map((player) => player.charId)
      press(playerId, 'right')
      const after = app.getState().characterSelect?.players.map((player) => player.charId)
      expect(after?.[playerId - 1]).not.toBe(before?.[playerId - 1])
      for (let otherId = 1; otherId <= 4; otherId++) {
        if (otherId !== playerId) {
          expect(after?.[otherId - 1]).toBe(before?.[otherId - 1])
        }
      }
    }

    for (const playerId of [2, 4, 1]) {
      press(playerId, 'confirm')
      expect(app.getState().screen).toBe('characterSelect')
      expect(app.getState().characterSelect?.players[playerId - 1]?.ready).toBe(true)
    }
    press(3, 'confirm')
    expect(app.getState().screen).toBe('game')
    expect(app.getState().players).toHaveLength(4)
  })

  it('B déverrouille uniquement le joueur qui l’a pressé', () => {
    const app = new App({ seed: 12, mode: 'coop4', autostart: false })
    const frame = (playerId: number, pressed: FrameInput['pressed']) =>
      routeInput(app, new Map([[playerId, { move: { x: 0, y: 0 }, pressed, action: false }]]))

    frame(1, ['confirm'])
    frame(2, ['confirm'])
    expect(app.getState().characterSelect?.players[1]?.ready).toBe(true)
    frame(2, ['back'])
    expect(app.getState().characterSelect?.players[1]?.ready).toBe(false)
    expect(app.getState().screen).toBe('characterSelect')
  })

  it('propage action tenue par joueur (pas d’agrégation, contrairement aux NavAction)', () => {
    const app = new App({ seed: 1, mode: 'coop', autostart: true })
    const perPlayer = new Map<number, FrameInput>([
      [1, { move: { x: 0, y: 0 }, pressed: [], action: true }],
      [2, { move: { x: 0, y: 0 }, pressed: [], action: false }],
    ])
    routeInput(app, perPlayer)
    // Pas d'assertion directe possible sur l'input brut (routé vers Simulation.setInput,
    // pas exposé sur AppViewState) : on vérifie au minimum l'absence d'effet de bord —
    // aucune navigation menu déclenchée par `action` seul.
    expect(app.getState().screen).toBe('game')
  })
})
