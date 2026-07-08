import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import { INTRO } from '@content/config'

describe('introClock — horloge d\'intro pilotable', () => {
  describe('intro activée (intro: true)', () => {
    it('juste après start : introActive=true, introElapsedMs=0', () => {
      const app = new App({ seed: 1, mode: 'solo', autostart: true, intro: true })
      const s = app.getState()
      expect(s.introActive).toBe(true)
      expect(s.introElapsedMs).toBe(0)
    })

    it('après advanceTime(500) : introElapsedMs=500, introActive=true', () => {
      const app = new App({ seed: 1, mode: 'solo', autostart: true, intro: true })
      app.advanceTime(500)
      const s = app.getState()
      expect(s.introElapsedMs).toBe(500)
      expect(s.introActive).toBe(true)
    })

    it('après advanceTime cumulé >= stageCinematicMs : introActive=false', () => {
      const app = new App({ seed: 1, mode: 'solo', autostart: true, intro: true })
      // Avance en plusieurs pas pour dépasser stageCinematicMs (6500 ms)
      app.advanceTime(3000)
      app.advanceTime(3000)
      app.advanceTime(1000) // total 7000 >= 6500
      const s = app.getState()
      expect(s.introActive).toBe(false)
    })

    it('skipIntro() termine l\'intro immédiatement ; advanceTime ensuite fait avancer elapsedMs', () => {
      const app = new App({ seed: 1, mode: 'solo', autostart: true, intro: true })
      // Vérifie que l'intro est active
      expect(app.getState().introActive).toBe(true)
      app.skipIntro()
      expect(app.getState().introActive).toBe(false)
      // La sim doit avancer après le skip (≥ 1 pas fixe ~16.67 ms)
      const before = app.getState().elapsedMs
      app.advanceTime(20)
      expect(app.getState().elapsedMs).toBeGreaterThan(before)
    })
  })

  describe('intro désactivée (intro: false / défaut)', () => {
    it('introActive=false et introElapsedMs=0 dès le départ', () => {
      const app = new App({ seed: 1, mode: 'solo', autostart: true })
      const s = app.getState()
      expect(s.introActive).toBe(false)
      expect(s.introElapsedMs).toBe(0)
    })

    it('skipIntro() est un no-op sûr (pas de crash, introActive reste false)', () => {
      const app = new App({ seed: 1, mode: 'solo', autostart: true })
      expect(() => app.skipIntro()).not.toThrow()
      expect(app.getState().introActive).toBe(false)
    })
  })

  describe('valeurs de config', () => {
    it('INTRO.stageCinematicMs est 6500', () => {
      expect(INTRO.stageCinematicMs).toBe(6500)
    })

    it('INTRO.durationMs est 2000 (valeur d\'origine inchangée)', () => {
      expect(INTRO.durationMs).toBe(2000)
    })
  })
})
