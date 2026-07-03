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
