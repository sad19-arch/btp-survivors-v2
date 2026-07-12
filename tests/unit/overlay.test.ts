import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    expect(items.length).toBe(4) // Jouer, Joueurs (sélecteur), Niveau (sélecteur), Options
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

  it('.card__delta présent et non vide sur une carte weapon-up', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    // Donner de nombreuses armes pour garantir weapon-up au tirage.
    app.debugGrant({
      weapons: [
        { id: 'scie', level: 1 },
        { id: 'marteau', level: 1 },
        { id: 'pied_de_biche', level: 1 },
        { id: 'court_circuit', level: 1 },
        { id: 'boulons', level: 1 }
      ]
    })
    // Boucler sur plusieurs level-ups jusqu'à avoir au moins une carte weapon-up visible.
    for (let attempt = 0; attempt < 5; attempt++) {
      app.debugAddXp(10_000)
      for (let t = 0; t < 10_000 && app.getState().screen !== 'upgrade'; t += 100) {
        app.advanceTime(100)
      }
      if (app.getState().screen === 'upgrade') {
        const items = app.getState().menu?.items ?? []
        const hasWeaponUp = items.some((i) => i.kind === 'weapon-up')
        if (hasWeaponUp) { break }
        app.confirm()
        for (let t = 0; t < 1000; t += 100) { app.advanceTime(100) }
      }
    }
    const { root, overlay } = mount()
    overlay.sync(app.getState())
    // Au moins une carte doit avoir .card__delta non vide.
    const deltas = root.querySelectorAll('.card__delta')
    expect(deltas.length).toBeGreaterThan(0)
    expect(deltas[0]?.textContent?.trim().length ?? 0).toBeGreaterThan(0)
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
    // Format : level/maxLevel (ex. "1/8") — plus 'Nv.' depuis la refonte cartes.
    expect(root.querySelector('.inv__lvl')?.textContent).toMatch(/\d+\/\d+/)
  })

  it('rangée passifs porte la classe inv__row--passives', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({
      weapons: [{ id: 'scie', level: 2 }],
      passives: [{ id: 'air_comprime', level: 1 }]
    })
    const { root, overlay } = mount()
    overlay.sync(app.getState())
    // La 2e rangée doit porter la classe inv__row--passives.
    expect(root.querySelector('.inv__row--passives')).not.toBeNull()
    // Les tuiles passifs portent inv__tile--sm (petites).
    const smTiles = root.querySelectorAll('.inv__tile--sm')
    const expectedPassives = app.getState().players[0]?.inventory.passives.length ?? 0
    expect(smTiles.length).toBe(expectedPassives)
  })

  it('tuiles armes sont dans .inv__row sans --passives, tuiles passifs dans .inv__row--passives', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({
      weapons: [{ id: 'marteau', level: 1 }, { id: 'scie', level: 1 }],
      passives: [{ id: 'air_comprime', level: 2 }, { id: 'caisse_outils', level: 1 }]
    })
    const { root, overlay } = mount()
    overlay.sync(app.getState())
    // Rangée armes : .inv__row sans --passives
    const weaponRow = root.querySelector('.inv__row:not(.inv__row--passives)')
    expect(weaponRow).not.toBeNull()
    expect(weaponRow?.querySelectorAll('.inv__tile').length).toBe(2)
    // Rangée passifs : .inv__row--passives
    const passiveRow = root.querySelector('.inv__row--passives')
    expect(passiveRow).not.toBeNull()
    expect(passiveRow?.querySelectorAll('.inv__tile--sm').length).toBe(2)
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

  it('tuile arme evolveReady:true porte inv__tile--evolve-ready + .inv__evolve-mark', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({
      weapons: [{ id: 'scie', level: 3 }]
    })
    const { root, overlay } = mount()
    // Forge un état avec evolveReady sur la première arme.
    const state = app.getState()
    const patched = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              inventory: {
                ...p.inventory,
                weapons: p.inventory.weapons.map((w, j) =>
                  j === 0
                    ? { ...w, evolveReady: true, evolveHint: 'Prête à évoluer !' }
                    : w
                )
              }
            }
          : p
      )
    }
    overlay.sync(patched)
    const weaponTiles = root.querySelectorAll('.inv__row:not(.inv__row--passives) .inv__tile')
    expect(weaponTiles.length).toBeGreaterThan(0)
    const firstTile = weaponTiles[0]
    expect(firstTile?.classList.contains('inv__tile--evolve-ready')).toBe(true)
    expect(firstTile?.querySelector('.inv__evolve-mark')).not.toBeNull()
  })

  it('tuile arme evolveReady:false/absent ne porte PAS inv__tile--evolve-ready', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({
      weapons: [{ id: 'scie', level: 2 }]
    })
    const { root, overlay } = mount()
    overlay.sync(app.getState())
    const tiles = root.querySelectorAll('.inv__tile')
    tiles.forEach((tile) => {
      expect(tile.classList.contains('inv__tile--evolve-ready')).toBe(false)
      expect(tile.querySelector('.inv__evolve-mark')).toBeNull()
    })
  })

  it('evolveReady trigger un rebuild de signature (sig change)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({ weapons: [{ id: 'scie', level: 3 }] })
    const { root, overlay } = mount()
    const state = app.getState()
    // Premier sync sans evolveReady.
    overlay.sync(state)
    const countBefore = root.querySelectorAll('.inv__tile--evolve-ready').length
    expect(countBefore).toBe(0)
    // Deuxième sync avec evolveReady:true — même niveau, donc la sig DOIT changer grâce au :${e.evolveReady ? 1 : 0}.
    const patched = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              inventory: {
                ...p.inventory,
                weapons: p.inventory.weapons.map((w, j) =>
                  j === 0 ? { ...w, evolveReady: true } : w
                )
              }
            }
          : p
      )
    }
    overlay.sync(patched)
    expect(root.querySelectorAll('.inv__tile--evolve-ready').length).toBe(1)
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

describe('Overlay — HUD multi-joueur (co-op)', () => {
  it('3 joueurs → 3 mini-HUD, PV/niveau par joueur, couleurs distinctes', () => {
    const app = new App({ seed: 1, mode: 'coop3', autostart: true })
    const { root, overlay } = mount()
    overlay.sync(app.getState())

    const state = app.getState()
    expect(state.players.length).toBe(3)

    const cards = root.querySelectorAll<HTMLElement>('.hud__pcard')
    expect(cards.length).toBe(3)

    cards.forEach((card, i) => {
      const p = state.players[i]
      expect(p).toBeDefined()
      expect(card.textContent).toContain(`J${p?.id}`)
      expect(card.textContent).toContain(`PV ${Math.ceil(p?.hp ?? 0)}`)
      expect(card.textContent).toContain(`Nv ${p?.level ?? 1}`)
    })

    const colors = Array.from(cards).map(
      (card) => card.querySelector<HTMLElement>('.hud__pswatch')?.style.backgroundColor
    )
    expect(new Set(colors).size).toBe(colors.length) // toutes distinctes
  })

  it('solo (1 joueur) → pas de bandeau .hud__players, HUD inchangé', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const { root, overlay } = mount()
    overlay.sync(app.getState())

    expect(root.querySelector('.hud__players')).toBeNull()
    expect(root.querySelectorAll('.hud__pcard').length).toBe(0)

    const hud = root.querySelector<HTMLElement>('.hud')
    expect(hud?.style.display).toBe('flex')
    expect(hud?.textContent).toContain('Niv. 1')
    expect(hud?.textContent).toContain('PV ')
    expect(hud?.textContent).toContain('XP ')
  })
})

describe('Overlay — jackpot (anticipation + roulette)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('showJackpot applique jackpot--charging IMMEDIATEMENT (avant toute roulette)', () => {
    const { root, overlay } = mount()
    overlay.showJackpot('Mitrailleuse a clous')
    // Dès l'appel synchrone, la classe d'anticipation doit être présente.
    const panel = root.querySelector('.jackpot')
    expect(panel).not.toBeNull()
    expect(panel?.classList.contains('jackpot--charging')).toBe(true)
  })

  it('jackpot--charging retire apres la phase d anticipation (500 ms)', () => {
    const { root, overlay } = mount()
    overlay.showJackpot('Mitrailleuse a clous')
    const panel = root.querySelector('.jackpot')
    expect(panel?.classList.contains('jackpot--charging')).toBe(true)
    // Avance dans le temps après anticipationMs.
    vi.advanceTimersByTime(500)
    expect(panel?.classList.contains('jackpot--charging')).toBe(false)
  })

  it('le panneau affiche le nom de l arme (winner dans la roulette)', () => {
    const { root, overlay } = mount()
    overlay.showJackpot('Mitrailleuse a clous')
    // Le DOM est construit synchronement, le winner est dans le reel.
    const winner = root.querySelector('.jackpot__item--winner')
    expect(winner).not.toBeNull()
    expect(winner?.textContent).toBe('Mitrailleuse a clous')
  })

  it('le panneau disparait apres anticipation + totalMs (2000 ms)', () => {
    const { root, overlay } = mount()
    overlay.showJackpot('Mitrailleuse a clous')
    // Toujours visible après 1999 ms.
    vi.advanceTimersByTime(1999)
    expect(root.querySelector('.jackpot')).not.toBeNull()
    // Fermé après 2000 ms (500 anticipation + 1500 total).
    vi.advanceTimersByTime(1)
    expect(root.querySelector('.jackpot')).toBeNull()
  })

  it('re-trigger immédiat n exécute pas les timers du jackpot précédent (pas de fuite)', () => {
    const { root, overlay } = mount()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    overlay.showJackpot('Arme A', cb1)
    // Re-trigger avant que quoi que ce soit ne se termine.
    overlay.showJackpot('Arme B', cb2)
    // Avance jusqu à la fermeture du 2e jackpot.
    vi.advanceTimersByTime(2001)
    // Le callback du 1er jackpot ne doit PAS avoir été appelé (timers annulés).
    expect(cb1).not.toHaveBeenCalled()
    // Le callback du 2e doit l'avoir été exactement une fois.
    expect(cb2).toHaveBeenCalledTimes(1)
    // Le panneau est fermé.
    expect(root.querySelector('.jackpot')).toBeNull()
  })
})

// ── Helpers pour les tests du Rapport de chantier ────────────────────────────

function makeDeathReport(overrides: Partial<import('@/app/appState').DeathReport> = {}): import('@/app/appState').DeathReport {
  return {
    elapsedMs: 300_000,   // 5:00
    kills: 1248,
    progressRatio: 0.25,
    progressPercent: 25,
    remainingSeconds: 900,
    stageDurationMs: 1_200_000, // 20:00
    quote: 'Meme les cachalots ne survivent pas ici.',
    ...overrides
  }
}

function makeGameoverState(
  report: import('@/app/appState').DeathReport | null
): import('@/app/appState').AppViewState {
  const app = new App({ seed: 42, mode: 'solo', autostart: false })
  const base = app.getState()
  return {
    ...base,
    screen: 'gameover',
    deathReport: report,
    menu: {
      screen: 'gameover',
      items: [
        { id: 'recommencer', label: 'Recommencer', hint: null },
        { id: 'titre', label: 'Menu titre', hint: null }
      ],
      index: 0
    }
  }
}

describe('Overlay — Rapport de chantier (game-over)', () => {
  it('rend le titre CHANTIER INTERROMPU, la phrase, la barre, les stats et les boutons', () => {
    const report = makeDeathReport({ progressPercent: 84, progressRatio: 0.84, quote: 'Vous etiez si pres.' })
    const state = makeGameoverState(report)
    const { root, overlay } = mount()
    overlay.sync(state)

    // 1. Titre
    expect(root.querySelector('.report__title')?.textContent).toBe('CHANTIER INTERROMPU')

    // 2. Phrase — culte car ratio > 0.8
    const quoteEl = root.querySelector('.report__quote')
    expect(quoteEl).not.toBeNull()
    expect(quoteEl?.textContent).toContain('Vous etiez si pres.')
    expect(quoteEl?.classList.contains('report__quote--cult')).toBe(true)

    // 3. Barre
    const bar = root.querySelector('.report__bar')
    expect(bar).not.toBeNull()
    // Marqueur : clamp(84, 3, 94) = 84 → left: 84%
    const marker = root.querySelector<HTMLElement>('.report__marker')
    expect(marker).not.toBeNull()
    expect(marker?.style.left).toBe('84%')

    // 4. Stats : 4 lignes
    const stats = root.querySelector('.report__stats')
    expect(stats).not.toBeNull()
    // pourcentage
    expect(stats?.textContent).toContain('84 %')
    // kills formaté
    expect(stats?.textContent).toContain('1 248')
    // temps tenu
    expect(stats?.textContent).toContain('5:00')
    // durée totale
    expect(stats?.textContent).toContain('20:00')

    // 5. Boutons
    const items = root.querySelectorAll('.menu__item')
    expect(items.length).toBe(2)
    expect(items[0]?.textContent).toBe('Recommencer')
  })

  it('progressPercent 2 → marqueur clampé à 3%', () => {
    const report = makeDeathReport({ progressPercent: 2, progressRatio: 0.02 })
    const state = makeGameoverState(report)
    const { root, overlay } = mount()
    overlay.sync(state)

    const marker = root.querySelector<HTMLElement>('.report__marker')
    expect(marker).not.toBeNull()
    expect(marker?.style.left).toBe('3%')
  })

  it('progressPercent 95 → marqueur clampé à 94%', () => {
    const report = makeDeathReport({ progressPercent: 95, progressRatio: 0.95 })
    const state = makeGameoverState(report)
    const { root, overlay } = mount()
    overlay.sync(state)

    const marker = root.querySelector<HTMLElement>('.report__marker')
    expect(marker?.style.left).toBe('94%')
  })

  it('progressRatio <= 0.8 → phrase sans classe --cult', () => {
    const report = makeDeathReport({ progressPercent: 50, progressRatio: 0.50 })
    const state = makeGameoverState(report)
    const { root, overlay } = mount()
    overlay.sync(state)

    const quoteEl = root.querySelector('.report__quote')
    expect(quoteEl).not.toBeNull()
    expect(quoteEl?.classList.contains('report__quote--cult')).toBe(false)
  })

  it('garde-fou : deathReport null → panneau minimal avec titre, sans crash', () => {
    const state = makeGameoverState(null)
    const { root, overlay } = mount()
    expect(() => overlay.sync(state)).not.toThrow()
    expect(root.querySelector('.panel__title')?.textContent).toBe('CHANTIER INTERROMPU')
    expect(root.querySelector('.report__bar')).toBeNull()
  })
})
