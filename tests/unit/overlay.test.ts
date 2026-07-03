import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import { Overlay } from '@ui/overlay'

function mount(): { root: HTMLElement; overlay: Overlay } {
  const root = document.createElement('div')
  document.body.append(root)
  return { root, overlay: new Overlay(root) }
}

describe('Overlay (DOM)', () => {
  it('affiche le panneau titre avec ses items et le focus', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    const { root, overlay } = mount()
    overlay.sync(app.getState())

    expect(root.querySelector('.panel__title')?.textContent).toBe('BTP Survivors')
    const items = root.querySelectorAll('.menu__item')
    expect(items.length).toBe(4) // Jouer, Niveau (sélecteur), Options, Crédits
    expect(root.querySelectorAll('.menu__item--focus').length).toBe(1)
    expect(items[0]?.classList.contains('menu__item--focus')).toBe(true)
  })

  it('déplace la classe de focus après navigation', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    const { root, overlay } = mount()
    app.nav('down')
    overlay.sync(app.getState())
    const items = root.querySelectorAll('.menu__item')
    expect(items[1]?.classList.contains('menu__item--focus')).toBe(true)
  })

  it('cache la modale en jeu et montre le HUD', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const { root, overlay } = mount()
    overlay.sync(app.getState())
    expect(root.querySelector('.panel')).toBeNull()
    const hud = root.querySelector<HTMLElement>('.hud')
    expect(hud?.style.display).toBe('flex')
    expect(hud?.textContent).toContain('Niv. 1')
  })

  it('affiche 4 cartes sur l’écran d’upgrade', () => {
    const app = new App({ seed: 123, mode: 'solo', autostart: true })
    // Aspire les gemmes jusqu'au level-up.
    let t = 0
    while (t < 120_000 && app.getState().screen !== 'upgrade') {
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
    const { root, overlay } = mount()
    overlay.sync(app.getState())
    expect(root.querySelectorAll('.card').length).toBe(4)
  })
})

describe('Overlay — inventaire HUD (armes/passifs + niveaux)', () => {
  it('affiche une tuile par arme/passif possédé, avec le niveau', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({
      weapons: [{ id: 'scie', level: 3 }],
      passives: [{ id: 'air_comprime', level: 2 }]
    })
    const { root, overlay } = mount()
    // happy-dom n'a pas de vrai décodeur d'image → l'event `error` ne se déclenche
    // pas forcément tout seul ; on vérifie juste que sync() ne plante pas et que
    // les tuiles existent (le fallback monogramme est couvert par un sync direct).
    overlay.sync(app.getState())
    const s = app.getState()
    const expected = s.players[0]?.inventory.weapons.length ?? 0
    const expectedPassives = s.players[0]?.inventory.passives.length ?? 0
    const tiles = root.querySelectorAll('.inv__tile')
    expect(tiles.length).toBe(expected + expectedPassives)
    expect(root.querySelector('.inv')?.textContent).toContain('Nv.')
  })

  it('le fallback monogramme ne plante pas (pas de vraie image en happy-dom)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const { root, overlay } = mount()
    expect(() => overlay.sync(app.getState())).not.toThrow()
    // Force l'échec de chargement de chaque <img> (comme un navigateur réel sans le fichier).
    root.querySelectorAll<HTMLImageElement>('.inv__img').forEach((img) => {
      img.dispatchEvent(new Event('error'))
    })
    expect(root.querySelectorAll('.inv__mono').length).toBeGreaterThan(0)
  })

  it("masque l'inventaire hors écran de jeu (titre)", () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    const { root, overlay } = mount()
    overlay.sync(app.getState())
    expect(root.querySelectorAll('.inv__tile').length).toBe(0)
  })
})

describe('Overlay — identité du boss (mid vs final)', () => {
  it('boss final → barre "CONTREMAÎTRE MAUDIT" + bandeau .banner--boss-final', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugSpawnBoss('final')
    const { root, overlay } = mount()
    overlay.sync(app.getState())

    const name = root.querySelector('.bossbar__name')
    expect(name?.textContent).toContain('MAUDIT')
    expect(root.querySelector('.banner--boss-final')).not.toBeNull()
  })

  it('boss mid → barre "Contremaître" (sans MAUDIT) + bandeau .banner--boss (pas final)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugSpawnBoss('mid')
    const { root, overlay } = mount()
    overlay.sync(app.getState())

    const name = root.querySelector('.bossbar__name')
    expect(name?.textContent).toBe('Contremaître')
    expect(name?.textContent).not.toContain('MAUDIT')
    expect(root.querySelector('.banner--boss')).not.toBeNull()
    expect(root.querySelector('.banner--boss-final')).toBeNull()
  })
})

describe('Overlay — bandeau d’évolution', () => {
  it('showEvolutionBanner insère un .banner--evolution avec le nom de l’arme', () => {
    const { root, overlay } = mount()
    overlay.showEvolutionBanner('Mitrailleuse à clous')
    const banner = root.querySelector('.banner--evolution')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('Mitrailleuse à clous')
  })
})
