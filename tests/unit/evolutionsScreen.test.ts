import { describe, it, expect, beforeEach } from 'vitest'
import { App } from '@/app/app'
import { Overlay } from '@ui/overlay'
import { EVOLUTIONS } from '@content/evolutions'

/**
 * Écran « Évolutions d'armes » (consultation depuis la PAUSE, en run — contrairement
 * aux succès qui sont une surcouche du TITRE). Teste le VRAI chemin de prod (App +
 * Overlay), jamais une réimplémentation du croisement EVOLUTIONS × inventaire.
 */

/** Atteint « Évolutions » depuis la pause UNIQUEMENT par nav()/confirm() (règle 8). */
function openEvolutionsScreen(app: App): void {
  app.pause()
  app.nav('down') // reprendre → évolutions
  app.confirm()
}

describe('écran « Évolutions d\'armes » (consultation depuis la pause)', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('s\'atteint depuis la pause par nav()/confirm(), et « B » revient à la pause', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.advanceTime(16)
    openEvolutionsScreen(app)
    expect(app.getState().screen).toBe('evolutions')
    app.back()
    expect(app.getState().screen).toBe('paused')
  })

  it('« Retour » revient à la pause (le seul item focalisable — aucun scroll)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.advanceTime(16)
    openEvolutionsScreen(app)
    expect(app.getState().menu?.items.map((i) => i.id)).toEqual(['retour'])
    app.confirm()
    expect(app.getState().screen).toBe('paused')
  })

  it('liste l\'arme de départ (cloueur) non évoluée, avec son catalyseur', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.advanceTime(16)
    openEvolutionsScreen(app)
    const view = app.getState().evolutions
    const entry = view?.entries.find((e) => e.weaponId === 'cloueur')
    expect(entry).toBeDefined()
    expect(entry?.evolved).toBe(false)
    expect(entry?.passiveId).toBe('air_comprime')
    expect(entry?.reqBaseLevel).toBe(8)
    expect(view?.evolvedCount).toBe(0)
  })

  it('une arme déjà évoluée ressort marquée « evolved » avec son nom évolué', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.advanceTime(16)
    // Octroi direct de la forme ÉVOLUÉE (raccourci debug équivalent à une évolution
    // obtenue en jeu — la vue ne recalcule rien, elle lit l'inventaire tel quel).
    app.debugGrant({ weapons: [{ id: 'mitrailleuse_clous', level: 1 }] })
    openEvolutionsScreen(app)
    const view = app.getState().evolutions
    const entry = view?.entries.find((e) => e.weaponId === 'mitrailleuse_clous')
    expect(entry).toBeDefined()
    expect(entry?.evolved).toBe(true)
    expect(entry?.evolvedName).toBe('Mitrailleuse à clous')
    expect(view?.evolvedCount).toBeGreaterThanOrEqual(1)
  })

  it('ne liste que les armes déjà acquises (pas un almanach complet)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.advanceTime(16)
    openEvolutionsScreen(app)
    const view = app.getState().evolutions
    // Un run fraîchement démarré n'a que l'arme de départ : au plus 1 entrée,
    // jamais les 12 évolutions du catalogue entier.
    expect(view?.entries.length).toBeLessThan(EVOLUTIONS.length)
    expect(view?.entries.length).toBeGreaterThan(0)
  })
})

describe('écran « Évolutions d\'armes » (rendu DOM)', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('une ligne par arme acquise, étoile éteinte tant que non évoluée', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const overlay = new Overlay(root)
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.advanceTime(16)
    openEvolutionsScreen(app)
    overlay.sync(app.getState())

    const entries = app.getState().evolutions?.entries ?? []
    expect(root.querySelectorAll('.ach-row').length).toBe(entries.length)
    expect(root.querySelectorAll('.ach-row--on').length).toBe(0)
    expect(root.querySelectorAll('.evo__pair').length).toBe(entries.length)
  })

  it('une arme évoluée distingue sa ligne (étoile allumée)', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const overlay = new Overlay(root)
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.advanceTime(16)
    app.debugGrant({ weapons: [{ id: 'mitrailleuse_clous', level: 1 }] })
    openEvolutionsScreen(app)
    overlay.sync(app.getState())

    expect(root.querySelectorAll('.ach-row--on').length).toBe(1)
  })
})
