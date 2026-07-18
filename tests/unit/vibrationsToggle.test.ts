import { describe, it, expect, beforeEach } from 'vitest'
import { App } from '@/app/app'
import { loadHaptics } from '@/app/hapticsSettings'

/**
 * Toggle « Vibrations » du menu Options (juice #2) — piloté UNIQUEMENT par
 * nav()/confirm() (règle 8 : 100 % manette/clavier). Vérifie le basculement, la
 * persistance (localStorage) et le libellé, sur le VRAI chemin de prod (App).
 */
function openOptions(app: App): void {
  // Titre : [jouer, players, stage, scores, succes, options(5), editeur] → 5 descentes.
  for (let i = 0; i < 5; i++) {
    app.nav('down')
  }
  app.confirm()
}

describe('Options — toggle Vibrations (juice #2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('les vibrations sont activées par défaut', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    expect(app.getVibrations()).toBe(true)
  })

  it('l\'item Vibrations bascule le réglage, le persiste et met à jour le libellé', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    openOptions(app)
    expect(app.getState().screen).toBe('options')

    const items = app.getState().menu?.items.map((i) => i.id) ?? []
    const idx = items.indexOf('vibrations')
    expect(idx).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < idx; i++) {
      app.nav('down')
    }
    app.confirm()

    expect(app.getVibrations()).toBe(false)
    expect(loadHaptics()).toBe(false) // persisté en localStorage
    const label = app.getState().menu?.items.find((i) => i.id === 'vibrations')?.label ?? ''
    expect(label).toContain('désactivées')
  })
})
