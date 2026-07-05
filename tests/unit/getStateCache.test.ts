import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'

describe('App — getStateForFrame (cache par frame)', () => {
  it('renvoie la même référence pour deux lectures à la même frame', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    expect(app.getStateForFrame(5)).toBe(app.getStateForFrame(5))
  })

  it('renvoie un nouvel objet pour une frame différente', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const a = app.getStateForFrame(5)
    const b = app.getStateForFrame(6)
    expect(b).not.toBe(a)
  })
})

/**
 * Régression B2 Task 5 : en `testMode`, `GameScene.update` n'appelle pas
 * `advanceTime` — seul point qui bumpait `frame` avant ce fix. Une interaction
 * menu-only (`nav`, `pause`…) doit donc aussi bumper `frameId`, sinon
 * `getStateForFrame` renvoie un `AppViewState` périmé (focus figé, écran Pause
 * absent) — cf. `tests/e2e/screens.spec.ts:18` et `:33`.
 */
describe('App — fraîcheur de getStateForFrame (bump du compteur frame)', () => {
  it('nav() sans advanceTime bumpe frameId et rafraîchit le focus caché', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })

    const indexBefore = app.getState().menu?.index
    const f0 = app.frameId

    app.nav('down')

    expect(app.frameId).not.toBe(f0)
    const fresh = app.getState()
    const cached = app.getStateForFrame(app.frameId)
    expect(cached.menu?.index).toBe(fresh.menu?.index)
    expect(cached.menu?.index).not.toBe(indexBefore)
  })

  it('pause() sans advanceTime bumpe frameId et le cache reflète l’écran Pause', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })

    const f0 = app.frameId
    app.pause()

    expect(app.frameId).not.toBe(f0)
    expect(app.getStateForFrame(app.frameId).screen).toBe('paused')
  })
})
