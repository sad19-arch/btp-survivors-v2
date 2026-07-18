import { describe, it, expect } from 'vitest'
import { App } from '@/app/app'
import { STEP_MS } from '@core/clock'
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
    expect(s.menu?.items.map((i) => i.id)).toEqual(['jouer', 'players', 'stage', 'scores', 'succes', 'options', 'editeur'])
    expect(s.players.length).toBe(0)
  })

  it('l\'item « Éditeur » émet launchEditor (effet de bord câblé hors App pure)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    let launched = false
    app.events.addEventListener('launchEditor', () => { launched = true })
    const editorIndex = app.getState().menu?.items.findIndex((i) => i.id === 'editeur') ?? -1
    expect(editorIndex).toBeGreaterThanOrEqual(0)
    app.clickItem(editorIndex)
    expect(launched).toBe(true)
    expect(app.getState().screen).toBe('title') // l'App reste au titre ; le boot éditeur est géré par main.ts
  })

  it('le sélecteur « Niveau » cycle les phases et lance le stage choisi', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    const item = () => app.getState().menu?.items[2]
    expect(item()?.id).toBe('stage')
    expect(item()?.label).toContain('Terrain vierge')
    app.nav('down') // focus « players » (index 1)
    app.nav('down') // focus le sélecteur de niveau (index 2)
    app.confirm() // cycle → phase suivante
    expect(item()?.label).toContain('Terrassement')
    expect(app.getState().screen).toBe('title') // toujours au titre, pas de partie lancée
    app.nav('up')
    app.nav('up') // focus « Jouer »
    app.confirm() // ouvre la sélection de personnage (solo → 1 joueur)
    expect(app.getState().screen).toBe('characterSelect')
    app.confirm() // valide le perso par défaut du carrousel → lance la partie
    expect(app.getState().screen).toBe('game')
    expect(app.getState().stageId).toBe('terrassement') // le stage choisi est bien lancé
  })

  it('le sélecteur « Joueurs » cycle le nombre borné [1,4] et lance la coop choisie', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    const item = () => app.getState().menu?.items[1]
    expect(item()?.id).toBe('players')
    expect(item()?.label).toContain('1')
    app.nav('down') // focus « players » (index 1)
    app.nav('right')
    expect(item()?.label).toContain('2')
    app.nav('right')
    app.nav('right')
    expect(item()?.label).toContain('4')
    app.nav('right') // borné à 4, pas de cycle
    expect(item()?.label).toContain('4')
    app.nav('left')
    app.nav('left')
    app.nav('left')
    expect(item()?.label).toContain('1')
    app.nav('left') // borné à 1
    expect(item()?.label).toContain('1')

    // Remonte à 2 puis lance : la partie démarre avec 2 joueurs.
    app.nav('right')
    app.nav('up') // focus « Jouer »
    app.confirm() // ouvre la sélection de personnage — joueur 1/2
    expect(app.getState().screen).toBe('characterSelect')
    expect(app.getState().characterSelect).toEqual({ player: 1, total: 2, charId: 'ouvrier' })
    app.confirm() // P1 valide son perso → tour du joueur 2
    expect(app.getState().characterSelect).toEqual({ player: 2, total: 2, charId: 'ouvrier' })
    app.confirm() // P2 valide son perso → lance la partie
    expect(app.getState().screen).toBe('game')
    expect(app.getState().players.length).toBe(2)
  })

  it('autostart démarre directement en jeu', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const s = app.getState()
    expect(s.screen).toBe('game')
    expect(s.players.length).toBe(1)
    expect(s.menu).toBeNull()
  })

  it('navigue puis valide « Jouer » pour lancer la partie (via la sélection de personnage)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    expect(app.getState().menu?.index).toBe(0)
    app.nav('down')
    expect(app.getState().menu?.index).toBe(1)
    app.nav('up')
    expect(app.getState().menu?.index).toBe(0) // sur « Jouer »
    app.confirm()
    expect(app.getState().screen).toBe('characterSelect')
    app.confirm() // valide le perso par défaut (solo, 1 seul joueur)
    expect(app.getState().screen).toBe('game')
    expect(app.getState().players.length).toBe(1)
  })

  it('« Scores » au titre ouvre le tableau du niveau sélectionné, et « B » revient au titre', () => {
    localStorage.clear() // profil neuf : aucun stage n'a de score
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    // Atteint « Scores » UNIQUEMENT par nav() — aucune fonction n'exige la souris (règle 8).
    app.nav('down') // players
    app.nav('down') // stage
    app.nav('down') // scores
    expect(app.getState().menu?.index).toBe(3)
    app.confirm()
    const s = app.getState()
    expect(s.screen).toBe('hiscores')
    expect(s.hiScores?.stageId).toBe('terrain_vierge')
    // Consultation, pas inscription : aucune ligne en surbrillance, et tableau vide.
    expect(s.hiScores?.rank).toBe(-1)
    expect(s.hiScores?.entries).toEqual([])
    app.back()
    expect(app.getState().screen).toBe('title')
  })

  it('« Scores » suit le sélecteur de niveau du titre (les classements sont par stage)', () => {
    localStorage.clear()
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    app.nav('down') // players
    app.nav('down') // stage
    app.nav('right') // niveau suivant : terrassement
    app.nav('down') // scores
    app.confirm()
    // C'est TOUT le pari de l'option (a) : pas de 2e sélecteur dans l'écran des
    // scores, le niveau choisi au titre décide du tableau affiché.
    expect(app.getState().hiScores?.stageId).toBe('terrassement')
    expect(app.getState().hiScores?.stageTitle).toBe('Terrassement')
  })

  it('met en pause puis reprend', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.pause()
    expect(app.getState().screen).toBe('paused')
    expect(app.getState().menu?.items.map((i) => i.id)).toEqual(['reprendre', 'evolutions', 'options', 'recommencer', 'quitter'])
    app.resume()
    expect(app.getState().screen).toBe('game')
  })

  it('« Quitter » depuis la pause ramène au titre', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.pause()
    // focus sur « quitter » (index 4 : reprendre, évolutions, options, recommencer, quitter)
    app.nav('down')
    app.nav('down')
    app.nav('down')
    app.nav('down')
    expect(app.getState().menu?.index).toBe(4)
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

describe('App — sélection SÉQUENTIELLE de personnage (titre → characterSelect → jeu)', () => {
  it('solo : « Jouer » ouvre characterSelect (P1/1) puis confirm lance la partie avec le perso choisi', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    app.confirm() // « Jouer » (focus par défaut = index 0)
    expect(app.getState().screen).toBe('characterSelect')
    expect(app.getState().characterSelect).toEqual({ player: 1, total: 1, charId: 'ouvrier' })
    const label0 = app.getState().menu?.items[0]?.label
    app.nav('right') // cycle vers le perso suivant du roster
    const label1 = app.getState().menu?.items[0]?.label
    expect(label1).not.toBe(label0)
    app.confirm() // valide → dernier (et seul) joueur → lance la partie
    const s = app.getState()
    expect(s.screen).toBe('game')
    expect(s.players.length).toBe(1)
    const p1 = s.players[0]
    expect(p1?.characterId).toBeDefined()
    // L'arme de départ du joueur correspond bien au perso choisi (pas au défaut 'ouvrier').
    expect(p1?.inventory.weapons[0]?.id).not.toBe('cloueur')
  })

  it('coop 2 joueurs : chacun choisit son perso à son tour, puis la partie démarre avec les deux personnages', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    app.nav('down') // focus « players »
    app.nav('right') // 2 joueurs
    app.nav('up') // focus « Jouer »
    app.confirm() // ouvre characterSelect — P1
    expect(app.getState().characterSelect).toEqual({ player: 1, total: 2, charId: 'ouvrier' })
    app.nav('right') // P1 choisit le perso suivant (index 1 du roster)
    const p1Label = app.getState().menu?.items[0]?.label
    app.confirm() // valide P1 → tour de P2
    expect(app.getState().characterSelect).toEqual({ player: 2, total: 2, charId: 'ouvrier' })
    // Le curseur est remis à 0 pour le joueur suivant (le carrousel repart du début).
    const p2Label = app.getState().menu?.items[0]?.label
    app.confirm() // valide P2 (perso par défaut du carrousel) → lance la partie
    const s = app.getState()
    expect(s.screen).toBe('game')
    expect(s.players.length).toBe(2)
    const [j1, j2] = s.players
    expect(j1?.characterId).toBeDefined()
    expect(j2?.characterId).toBeDefined()
    expect(j1?.characterId).not.toBe(j2?.characterId)
    // Armes de départ distinctes, cohérentes avec les persos choisis.
    expect(j1?.inventory.weapons[0]?.id).not.toBe(j2?.inventory.weapons[0]?.id)
    expect(p1Label).not.toBe(p2Label)
  })

  it('restart conserve le personnage choisi (pas de retour silencieux à l’ouvrier)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    app.confirm() // « Jouer » → characterSelect
    app.nav('right') // choisit le perso d'index 1 du roster (soudeur → scie)
    app.confirm() // lance la partie
    const before = app.getState().players[0]
    expect(before?.characterId).toBe('soudeur')
    expect(before?.inventory.weapons[0]?.id).toBe('scie')
    app.restart()
    const after = app.getState().players[0]
    // Le perso (et son arme) survit au restart — pas de reset vers l'ouvrier/cloueur.
    expect(after?.characterId).toBe('soudeur')
    expect(after?.inventory.weapons[0]?.id).toBe('scie')
  })

  it('back depuis characterSelect P1 revient au titre ; depuis P2 revient à P1', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    app.nav('down')
    app.nav('right') // 2 joueurs
    app.nav('up')
    app.confirm() // characterSelect P1/2
    app.confirm() // valide P1 → P2/2
    expect(app.getState().characterSelect).toEqual({ player: 2, total: 2, charId: 'ouvrier' })
    app.back() // retour à P1
    expect(app.getState().screen).toBe('characterSelect')
    expect(app.getState().characterSelect).toEqual({ player: 1, total: 2, charId: 'ouvrier' })
    app.back() // retour au titre
    expect(app.getState().screen).toBe('title')
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

describe('App — inventaire résolu (getState().players[i].inventory)', () => {
  it("l'arme de départ apparaît dans l'inventaire avec son nom résolu", () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    const p = app.getState().players[0]
    const cloueur = p?.inventory.weapons.find((w) => w.id === 'cloueur')
    expect(cloueur?.name).toBe('Cloueur')
    expect(cloueur?.level).toBeGreaterThanOrEqual(1)
  })

  it('les armes/passifs octroyés via debugGrant sont résolus (id, nom, niveau)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({
      weapons: [{ id: 'scie', level: 3 }],
      passives: [{ id: 'air_comprime', level: 2 }]
    })
    const p = app.getState().players[0]
    expect(p?.inventory.weapons).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'scie', name: 'Scie orbitale', level: 3 })])
    )
    expect(p?.inventory.passives).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'air_comprime', name: 'Air comprimé', level: 2 })])
    )
  })

  it('un id de contenu inconnu se replie sur son id brut (garde, pas de crash)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({ weapons: [{ id: 'arme_inexistante', level: 1 }] })
    const p = app.getState().players[0]
    const entry = p?.inventory.weapons.find((w) => w.id === 'arme_inexistante')
    expect(entry?.name).toBe('arme_inexistante')
  })
})

describe('App — delta lisible sur les cartes weapon-up', () => {
  it('une carte weapon-up possédée a un champ delta non vide contenant « dégâts »', () => {
    // Stratégie : pré-charger des armes à niv 1 (éligibles weapon-up),
    // avancer plusieurs level-ups jusqu'à trouver au moins une carte weapon-up.
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({
      weapons: [
        { id: 'scie', level: 1 },
        { id: 'marteau', level: 1 },
        { id: 'pied_de_biche', level: 1 },
        { id: 'court_circuit', level: 1 },
        { id: 'boulons', level: 1 }
      ]
    })
    let weaponUpItems: Array<{ kind?: string; delta?: string }> = []
    // Faire plusieurs level-ups jusqu'à tomber sur au moins une carte weapon-up.
    for (let attempt = 0; attempt < 5 && weaponUpItems.length === 0; attempt++) {
      app.debugAddXp(10_000)
      for (let t = 0; t < 10_000 && app.getState().screen !== 'upgrade'; t += 100) {
        app.advanceTime(100)
      }
      if (app.getState().screen === 'upgrade') {
        weaponUpItems = (app.getState().menu?.items ?? []).filter((i) => i.kind === 'weapon-up')
        if (weaponUpItems.length > 0) { break }
        // Choisir la première carte et passer à l'essai suivant.
        app.confirm()
        for (let t = 0; t < 1000; t += 100) { app.advanceTime(100) }
      }
    }
    expect(weaponUpItems.length).toBeGreaterThan(0)
    const hasDelta = weaponUpItems.some((i) => typeof i.delta === 'string' && i.delta !== '')
    expect(hasDelta).toBe(true)
    const deltaItem = weaponUpItems.find((i) => typeof i.delta === 'string' && i.delta !== '')
    expect(deltaItem?.delta).toContain('dégâts')
  })

  it('les cartes passive-up et weapon-new ne portent pas de champ delta', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugGrant({
      weapons: [{ id: 'scie', level: 1 }, { id: 'marteau', level: 1 }]
    })
    app.debugAddXp(10_000)
    for (let t = 0; t < 10_000 && app.getState().screen !== 'upgrade'; t += 100) {
      app.advanceTime(100)
    }
    const s = app.getState()
    expect(s.screen).toBe('upgrade')
    const items = s.menu?.items ?? []
    const nonWeaponUp = items.filter((i) => i.kind !== 'weapon-up')
    for (const item of nonWeaponUp) {
      expect(item.delta).toBeUndefined()
    }
  })
})

describe('App — gel « casino » à l\'ouverture de coffre', () => {
  it('coffre ouvert → partie GELÉE le temps de la machine à sous ; A la skippe (dégèle)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugSpawnChestOnPlayer() // coffre spawné SUR le joueur → ramassé au 1er pas
    app.advanceTime(STEP_MS)
    const t0 = app.getState().elapsedMs
    // Gelé : le temps de jeu n'avance plus tant que la machine à sous tourne.
    app.advanceTime(1000)
    expect(app.getState().elapsedMs).toBe(t0)
    // A saute le spectacle : incrémente le token (→ overlay ferme) et dégèle.
    const token0 = app.getState().chestSkipToken
    app.confirm()
    expect(app.getState().chestSkipToken).toBe(token0 + 1)
    // Dégelé (après la grâce de skip, cf. `CHEST_SKIP_GRACE_MS` — 2 avances : la 1re
    // consomme la grâce, la 2e fait effectivement repartir la sim).
    app.advanceTime(100)
    app.advanceTime(100)
    expect(app.getState().elapsedMs).toBeGreaterThan(t0)
  })

  /**
   * Fix course modale coffre (retour playtest) : `confirm()` NE remet PAS
   * `chestRevealMsLeft` à 0 dans le même appel — sinon le `advanceTime()` de la
   * MÊME frame (routeInput → confirm() → advanceTime, dans `GameScene.update()`)
   * ferait déjà repartir la sim avant que la boucle DOM indépendante
   * (`overlay.sync()`, sur son propre rAF dans `main.ts`) n'ait eu l'occasion de
   * retirer le panneau `.jackpot`. Une grâce (`CHEST_SKIP_GRACE_MS`) garde le gel
   * actif un instant de plus après le skip.
   */
  it('skip (A) laisse une grâce : le gel reste actif un instant de plus AVANT que la sim ne reprenne', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: true })
    app.debugSpawnChestOnPlayer()
    app.advanceTime(STEP_MS)
    const t0 = app.getState().elapsedMs
    app.confirm() // skip
    // Immédiatement après le skip, la sim est ENCORE gelée (grâce en cours).
    expect(app.getState().elapsedMs).toBe(t0)
    // Un premier advanceTime consomme la grâce restante — la sim n'avance PAS ENCORE.
    app.advanceTime(100)
    expect(app.getState().elapsedMs).toBe(t0)
    // La grâce est épuisée : la sim reprend enfin.
    app.advanceTime(100)
    expect(app.getState().elapsedMs).toBeGreaterThan(t0)
  })
})
