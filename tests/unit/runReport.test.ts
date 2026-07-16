/**
 * Tests du `runReport` figé dans `AppViewState`.
 *
 * Stratégie :
 * - Partie déterministe (seed fixe) → `debugKillPlayer()` → avance 1 pas → game-over.
 * - Appels répétés à `getState()` → même rapport (figé, stable).
 * - `progressRatio` clampé [0,1], `progressPercent`/`remainingSeconds` cohérents.
 * - Après `restart()` : `runReport` revient à null hors game-over.
 */

import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import { FINAL_BOSS } from '@content/config'

/** Lance une partie solo (seed fixe) et renvoie l'app déjà en jeu. */
function makeApp(seed = 42): App {
  const app = new App({ seed, mode: 'solo', autostart: true })
  // Avance un pas pour s'assurer que la sim est bien initialisée.
  app.advanceTime(16)
  return app
}

/** Force le game-over : tue le joueur et avance jusqu'à ce que la scène change. */
function reachGameOver(app: App): void {
  app.debugKillPlayer()
  // Le système de mort traite les PV ≤ 0 au prochain pas.
  let tries = 0
  while (app.getState().screen !== 'gameover' && tries < 50) {
    app.advanceTime(16)
    tries++
  }
}

describe('runReport — exposition dans AppViewState', () => {
  it('vaut null hors game-over (écran game)', () => {
    const app = makeApp()
    expect(app.getState().screen).toBe('game')
    expect(app.getState().runReport).toBeNull()
  })

  it('vaut null au titre (pas de partie)', () => {
    const app = new App({ seed: 42, mode: 'solo', autostart: false })
    expect(app.getState().screen).toBe('title')
    expect(app.getState().runReport).toBeNull()
  })

  it('est non-null dès que screen === gameover', () => {
    const app = makeApp()
    reachGameOver(app)
    expect(app.getState().screen).toBe('gameover')
    const report = app.getState().runReport
    expect(report).not.toBeNull()
  })

  it('est figé : deux appels successifs à getState() retournent la même référence de rapport', () => {
    const app = makeApp()
    reachGameOver(app)
    const r1 = app.getState().runReport
    const r2 = app.getState().runReport
    expect(r1).not.toBeNull()
    // Même référence (objet identique)
    expect(r1).toBe(r2)
  })

  it('est figé : la quote est identique entre deux appels', () => {
    const app = makeApp()
    reachGameOver(app)
    const q1 = app.getState().runReport?.quote
    const q2 = app.getState().runReport?.quote
    expect(q1).toBeDefined()
    expect(q1).toBe(q2)
  })
})

describe('runReport — cohérence des champs', () => {
  it("elapsedMs correspond a l'etat sim au moment de la mort", () => {
    const app = makeApp()
    // Avance 2 secondes avant de tuer.
    app.advanceTime(2000)
    reachGameOver(app)
    const report = app.getState().runReport
    expect(report).not.toBeNull()
    if (report === null) {
      return
    }
    // On a avancé 16ms (init) + 2000ms + quelques pas → au moins 2000ms.
    expect(report.elapsedMs).toBeGreaterThanOrEqual(2000)
  })

  it('progressRatio clampé dans [0, 1]', () => {
    const app = makeApp()
    reachGameOver(app)
    const report = app.getState().runReport
    expect(report).not.toBeNull()
    if (report === null) {
      return
    }
    expect(report.progressRatio).toBeGreaterThanOrEqual(0)
    expect(report.progressRatio).toBeLessThanOrEqual(1)
  })

  it('progressPercent = floor(progressRatio × 100)', () => {
    const app = makeApp()
    reachGameOver(app)
    const report = app.getState().runReport
    expect(report).not.toBeNull()
    if (report === null) {
      return
    }
    expect(report.progressPercent).toBe(Math.floor(report.progressRatio * 100))
  })

  it('remainingSeconds cohérent avec elapsedMs et stageDurationMs', () => {
    const app = makeApp()
    reachGameOver(app)
    const report = app.getState().runReport
    expect(report).not.toBeNull()
    if (report === null) {
      return
    }
    const expected = Math.max(0, Math.floor(report.stageDurationMs / 1000) - Math.floor(report.elapsedMs / 1000))
    expect(report.remainingSeconds).toBe(expected)
  })

  it('stageDurationMs = FINAL_BOSS.atMs', () => {
    const app = makeApp()
    reachGameOver(app)
    const report = app.getState().runReport
    expect(report).not.toBeNull()
    if (report === null) {
      return
    }
    expect(report.stageDurationMs).toBe(FINAL_BOSS.atMs)
  })

  it('kills ≥ 0', () => {
    const app = makeApp()
    reachGameOver(app)
    const report = app.getState().runReport
    expect(report).not.toBeNull()
    if (report === null) {
      return
    }
    expect(report.kills).toBeGreaterThanOrEqual(0)
  })

  it('quote est une chaîne non vide', () => {
    const app = makeApp()
    reachGameOver(app)
    const report = app.getState().runReport
    expect(report).not.toBeNull()
    if (report === null) {
      return
    }
    expect(typeof report.quote).toBe('string')
    expect(report.quote.length).toBeGreaterThan(0)
  })
})

describe('runReport — reset lifecycle', () => {
  it('redevient null après restart() (hors game-over)', () => {
    const app = makeApp()
    reachGameOver(app)
    expect(app.getState().runReport).not.toBeNull()
    app.restart()
    // Après restart, on est de nouveau en jeu — pas encore en game-over.
    expect(app.getState().screen).toBe('game')
    expect(app.getState().runReport).toBeNull()
  })

  it('redevient null après start() (hors game-over)', () => {
    const app = makeApp()
    reachGameOver(app)
    expect(app.getState().runReport).not.toBeNull()
    app.start('solo')
    expect(app.getState().screen).toBe('game')
    expect(app.getState().runReport).toBeNull()
  })

  it('est recalculé à la prochaine mort après restart()', () => {
    const app = makeApp()
    reachGameOver(app)
    const quote1 = app.getState().runReport?.quote

    app.restart()
    app.advanceTime(16)
    reachGameOver(app)

    const report2 = app.getState().runReport
    expect(report2).not.toBeNull()
    // Le nouveau rapport a une quote (peut être la même ou différente selon Math.random).
    expect(typeof report2?.quote).toBe('string')
    // Le rapport est bien créé à nouveau (non undefined).
    expect(report2?.quote).toBeDefined()
    // Juste pour documenter le comportement : quote1 est définie.
    expect(typeof quote1).toBe('string')
  })
})

describe('debugKillPlayer — seam helper', () => {
  it('tue tous les joueurs au prochain pas → screen gameover', () => {
    const app = makeApp()
    expect(app.getState().screen).toBe('game')
    const state = app.getState()
    // Tous les joueurs sont vivants avant.
    for (const p of state.players) {
      expect(p.hp).toBeGreaterThan(0)
    }
    app.debugKillPlayer()
    app.advanceTime(16)
    expect(app.getState().screen).toBe('gameover')
  })

  it("n'a aucun effet hors d'une partie en cours (sim null)", () => {
    const app = new App({ seed: 42, mode: 'solo', autostart: false })
    // Ne doit pas lever d'erreur.
    expect(() => { app.debugKillPlayer() }).not.toThrow()
    expect(app.getState().screen).toBe('title')
  })
})
