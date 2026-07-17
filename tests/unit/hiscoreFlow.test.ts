import { describe, it, expect, beforeEach } from 'vitest'
import { App } from '@/app/app'
import { readHiScores, insertHiScore, type HiScoreEntry } from '@ui/hiscores'
import { readHiScore } from '@ui/hiscore'
import { NAME_ENTRY_ALPHABET } from '@/app/nameEntry'

/**
 * Assemblage du flux « high scores » : fin de run → (si le score qualifie)
 * saisie du prénom → inscription → tableau, ligne du joueur en surbrillance.
 *
 * Teste le VRAI chemin de prod (App + modules `hiscores`/`nameEntry`/`score`),
 * jamais une réimplémentation des formules.
 */

const STAGE = 'terrain_vierge'

/**
 * Une run terminée (game-over déterministe) sur le stage par défaut. Même recette
 * que `runReport.test.ts` : un pas pour initialiser la sim, puis on attend que le
 * système de mort traite les PV ≤ 0 (ce n'est pas garanti au pas suivant).
 */
function deadApp(): App {
  const app = new App({ seed: 42, mode: 'solo', autostart: true })
  app.advanceTime(16)
  reachGameOver(app)
  return app
}

function reachGameOver(app: App): void {
  app.debugKillPlayer()
  let tries = 0
  while (app.getState().screen !== 'gameover' && tries < 50) {
    app.advanceTime(16)
    tries++
  }
  expect(app.getState().screen).toBe('gameover')
}

/** Remplit le top 20 du stage avec des scores inatteignables. */
function fillTable(score = 9_999_999): void {
  for (let i = 0; i < 20; i++) {
    const e: HiScoreEntry = { name: `P${i}`, score: score + i, kills: 1, elapsedMs: 1000, level: 1 }
    insertHiScore(STAGE, e)
  }
}

/** Saisit une lettre sur la case courante (uniquement par `nav`, comme une manette). */
function typeLetter(app: App, letter: string): void {
  const target = NAME_ENTRY_ALPHABET.indexOf(letter)
  expect(target).toBeGreaterThan(0)
  for (let i = 0; i < target; i++) {
    app.nav('up')
  }
}

describe('flux high scores — fin de run → saisie du prénom → tableau', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('la fin de run reste le RAPPORT : la saisie s’ouvre en le quittant', () => {
    const app = deadApp()
    // Le rapport de chantier n'est pas escamoté par le tableau d'honneur.
    expect(app.getState().screen).toBe('gameover')
    app.confirm() // « Recommencer » → détourné vers la saisie (le score qualifie)
    expect(app.getState().screen).toBe('nameEntry')
    // L'action demandée n'a PAS été exécutée : aucune nouvelle run n'a démarré.
    expect(app.getState().elapsedMs).toBeGreaterThan(0)
  })

  it('un score NON qualifiant ne déclenche jamais l’écran de saisie', () => {
    fillTable()
    const app = deadApp()
    expect(app.getState().screen).toBe('gameover')
    app.confirm() // « Recommencer » s'exécute directement
    expect(app.getState().screen).not.toBe('nameEntry')
    expect(readHiScores(STAGE).some((e) => e.name === 'ANONYME')).toBe(false)
  })

  it('saisit un nom uniquement à la manette (nav/confirm) et l’inscrit au bon rang', () => {
    const app = deadApp()
    app.confirm()
    expect(app.getState().screen).toBe('nameEntry')

    // « BOB » — que des directions, aucune touche de caractère : c'est la preuve
    // que l'écran est jouable 100 % manette (règle 8).
    typeLetter(app, 'B')
    app.nav('right')
    typeLetter(app, 'O')
    app.nav('right')
    typeLetter(app, 'B')
    expect(app.getState().nameEntry?.name).toBe('BOB')

    app.confirm()
    const s = app.getState()
    expect(s.screen).toBe('hiscores')
    expect(s.hiScores?.entries[0]?.name).toBe('BOB')
    // La ligne du joueur est désignée pour la surbrillance.
    expect(s.hiScores?.rank).toBe(0)
    // Et elle est bien PERSISTÉE (relecture depuis le stockage, pas depuis la vue).
    expect(readHiScores(STAGE)[0]?.name).toBe('BOB')
  })

  it('le score inscrit est le score de CLASSEMENT du rapport, pas le compteur de kills', () => {
    const app = deadApp()
    const report = app.getState().runReport
    app.confirm()
    app.confirm() // valide un nom vide
    expect(readHiScores(STAGE)[0]?.score).toBe(report?.runScore)
  })

  it('garde one-shot : 100 appels à getState() n’inscrivent rien et ne rejouent pas le rapport', () => {
    const app = deadApp()
    app.confirm()
    typeLetter(app, 'Z')
    app.confirm() // inscription (une fois)
    const first = readHiScores(STAGE)

    for (let i = 0; i < 100; i++) {
      app.getState()
    }
    // getState() tourne à 60 Hz : il ne doit RIEN inscrire.
    expect(readHiScores(STAGE)).toEqual(first)
    expect(readHiScores(STAGE).length).toBe(1)
  })

  it('garde one-shot : re-valider ne crée pas de doublon', () => {
    const app = deadApp()
    app.confirm()
    app.confirm() // inscription
    expect(app.getState().screen).toBe('hiscores')
    expect(readHiScores(STAGE).length).toBe(1)

    // Retour au rapport puis nouvelles validations : le score est déjà traité.
    app.confirm() // « Retour »
    expect(app.getState().screen).toBe('gameover')
    app.confirm() // exécute « Recommencer » cette fois, pas de 2e saisie
    expect(app.getState().screen).not.toBe('nameEntry')
    expect(readHiScores(STAGE).length).toBe(1)
  })

  it('le HI-SCORE du titre est écrit une seule fois et ne régresse jamais', () => {
    const app = deadApp()
    const score = app.getState().runReport?.runScore ?? 0
    expect(score).toBeGreaterThan(0)
    // Écrit dès le rapport (le titre affichait « 000000 » : writeHiScore n'avait aucun appelant).
    expect(readHiScore()).toBe(score)

    for (let i = 0; i < 100; i++) {
      app.getState()
    }
    expect(readHiScore()).toBe(score)

    // Une run suivante, moins bonne, n'écrase pas le meilleur score.
    localStorage.setItem('btp:hiscore', '9999999')
    const app2 = deadApp()
    app2.getState()
    expect(readHiScore()).toBe(9_999_999)
  })

  it('navigation de la grille : gauche/droite bougent la case, haut/bas la lettre', () => {
    const app = deadApp()
    app.confirm()
    expect(app.getState().nameEntry?.cursor).toBe(0)

    app.nav('right')
    expect(app.getState().nameEntry?.cursor).toBe(1)
    app.nav('left')
    expect(app.getState().nameEntry?.cursor).toBe(0)

    app.nav('up')
    expect(app.getState().nameEntry?.chars[0]).toBe('A')
    app.nav('down')
    expect(app.getState().nameEntry?.chars[0]).toBe(' ')
  })

  it('« B » efface la case et ne quitte JAMAIS la saisie (sinon on perd son score)', () => {
    const app = deadApp()
    app.confirm()
    app.nav('up')
    expect(app.getState().nameEntry?.chars[0]).toBe('A')

    app.back()
    expect(app.getState().screen).toBe('nameEntry') // toujours là
    expect(app.getState().nameEntry?.chars[0]).toBe(' ')
  })

  it('une nouvelle run rouvre le droit de s’inscrire', () => {
    const app = deadApp()
    app.confirm()
    app.confirm() // inscrit la 1re run
    app.confirm() // « Retour » → rapport
    app.restart()
    expect(app.getState().screen).toBe('game')
    // Les surcouches de fin de run sont bien refermées par start().
    expect(app.getState().nameEntry).toBeNull()
    expect(app.getState().hiScores).toBeNull()

    reachGameOver(app)
    app.confirm()
    expect(app.getState().screen).toBe('nameEntry')
  })

  it('un nom vide est accepté (l’arcade ne bloque personne) et retombe sur ANONYME', () => {
    const app = deadApp()
    app.confirm()
    app.confirm() // valide sans rien saisir
    expect(readHiScores(STAGE)[0]?.name).toBe('ANONYME')
  })
})
