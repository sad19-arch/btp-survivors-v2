import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import type { EvolvedEvent } from '@core/events'

/** Avance (en ramassant les gemmes) jusqu'à l'écran d'upgrade. */
function advanceToUpgrade(app: App, maxMs: number): void {
  let t = 0
  while (t < maxMs && app.getState().screen !== 'upgrade') {
    const s = app.getState()
    const p = s.players[0]
    if (p !== undefined) {
      const targets = s.pickups.length > 0 ? s.pickups : s.enemies
      let tx = p.x
      let ty = p.y
      let bd = Infinity
      for (const g of targets) {
        const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2
        if (d < bd) {
          bd = d
          tx = g.x
          ty = g.y
        }
      }
      app.setInput(1, { move: { x: tx - p.x, y: ty - p.y }, attack: false })
    }
    app.advanceTime(100)
    t += 100
  }
}

describe('App — écrans & navigation', () => {
  it('démarre sur le titre quand autostart est faux', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    const s = app.getState()
    expect(s.screen).toBe('title')
    expect(s.menu?.items.map((i) => i.id)).toEqual(['jouer', 'stage', 'options', 'credits'])
    expect(s.players.length).toBe(0)
  })

  it('le sélecteur « Niveau » cycle les phases et lance le stage choisi', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    const item = () => app.getState().menu?.items[1]
    expect(item()?.id).toBe('stage')
    expect(item()?.label).toContain('Terrain vierge')
    app.nav('down') // focus le sélecteur (index 1)
    app.confirm() // cycle → phase suivante
    expect(item()?.label).toContain('Terrassement')
    expect(app.getState().screen).toBe('title') // toujours au titre, pas de partie lancée
    app.nav('up') // focus « Jouer »
    app.confirm()
    expect(app.getState().screen).toBe('game')
    expect(app.getState().stageId).toBe('terrassement') // le stage choisi est bien lancé
  })

  it('autostart démarre directement en jeu', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const s = app.getState()
    expect(s.screen).toBe('game')
    expect(s.players.length).toBe(1)
    expect(s.menu).toBeNull()
  })

  it('navigue puis valide « Jouer » pour lancer la partie', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    expect(app.getState().menu?.index).toBe(0)
    app.nav('down')
    expect(app.getState().menu?.index).toBe(1)
    app.nav('up')
    expect(app.getState().menu?.index).toBe(0) // sur « Jouer »
    app.confirm()
    expect(app.getState().screen).toBe('game')
    expect(app.getState().players.length).toBe(1)
  })

  it('met en pause puis reprend', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.pause()
    expect(app.getState().screen).toBe('paused')
    expect(app.getState().menu?.items.map((i) => i.id)).toEqual(['reprendre', 'options', 'recommencer', 'quitter'])
    app.resume()
    expect(app.getState().screen).toBe('game')
  })

  it('« Quitter » depuis la pause ramène au titre', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.pause()
    // focus sur « quitter » (index 3 : reprendre, options, recommencer, quitter)
    app.nav('down')
    app.nav('down')
    app.nav('down')
    expect(app.getState().menu?.index).toBe(3)
    app.confirm()
    expect(app.getState().screen).toBe('title')
  })

  it('back en jeu met en pause, back en pause reprend', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.back()
    expect(app.getState().screen).toBe('paused')
    app.back()
    expect(app.getState().screen).toBe('game')
  })

  it('montée de niveau → écran upgrade avec 4 cartes ; le choix relance le jeu', () => {
    const app = new App({ seed: 123, mode: 'solo', autostart: true })
    advanceToUpgrade(app, 120_000)
    const s = app.getState()
    expect(s.screen).toBe('upgrade')
    expect(s.menu?.items.length).toBe(4)
    expect(s.menu?.items[0]?.hint).not.toBeNull() // l'effet est décrit
    app.confirm()
    expect(app.getState().screen).toBe('game')
  })
})

describe('App — helpers de debug (passe-plat vers Simulation, pour le seam)', () => {
  it('debugGrant + debugAddXp fast-forward un level-up sans planter', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({ weapons: [{ id: 'cloueur', level: 1 }] })
    app.debugAddXp(1_000_000)
    app.advanceTime(100)
    // Soit un level-up est en attente (carte à choisir), soit l'inventaire était
    // déjà couvert et le temps continue — dans tous les cas, pas de plantage et
    // la scène de jeu reste valide.
    expect(['game', 'upgrade']).toContain(app.getState().screen)
  })

  it('debugSpawnChestOnPlayer fait apparaître un coffre ramassable immédiatement', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugSpawnChestOnPlayer()
    app.advanceTime(200)
    // Sans évolution éligible, le coffre applique un bonus de soin (borné) — on
    // vérifie juste que l'appel ne plante pas et que le joueur est toujours là.
    expect(app.getState().players.length).toBe(1)
  })

  it('debugSpawnBoss("mid") fait apparaître un ennemi boss sans attendre le seuil temporel', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugSpawnBoss('mid')
    const s = app.getState()
    expect(s.enemies.some((e) => e.isBoss)).toBe(true)
  })

  it("l'évolution d'arme est relayée par App (EvolvedEvent)", () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    let evolvedId = ''
    app.events.addEventListener('evolved', (e) => {
      evolvedId = (e as EvolvedEvent).weaponId
    })
    app.debugGrant({ weapons: [{ id: 'cloueur', level: 8 }], passives: [{ id: 'air_comprime', level: 1 }] })
    app.debugSpawnChestOnPlayer()
    app.advanceTime(200)
    expect(evolvedId).toBe('mitrailleuse_clous')
  })
})
