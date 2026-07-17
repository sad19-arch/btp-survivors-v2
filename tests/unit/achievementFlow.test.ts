import { describe, it, expect, beforeEach, vi } from 'vitest'
import { App } from '@/app/app'
import { Overlay } from '@ui/overlay'
import { ACHIEVEMENTS } from '@content/achievements'
import { readProgress, readUnlocked, commitRun as realCommitRun } from '@ui/achievements'
import { wireAchievementToasts, type AchievementToastSink } from '@/app/achievementBridge'

/**
 * Assemblage du flux « succès » : fin de run → `commitRun` (UNE fois) → trophée,
 * et l'écran de consultation depuis le titre.
 *
 * Teste le VRAI chemin de prod (App + `src/ui/achievements` + le pont), jamais
 * une réimplémentation des prédicats ou de la fusion.
 */

/**
 * Espion sur `commitRun` — il ENVELOPPE l'implémentation réelle (le profil est
 * réellement écrit), il ne la remplace pas : un mock creux prouverait seulement
 * que le mock est appelé une fois, pas que le profil est juste.
 */
const { commitRunSpy } = vi.hoisted(() => ({ commitRunSpy: vi.fn() }))
vi.mock('@ui/achievements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ui/achievements')>()
  return {
    ...actual,
    commitRun: (run: Parameters<typeof actual.commitRun>[0]): string[] => {
      commitRunSpy(run)
      return actual.commitRun(run)
    }
  }
})

/** Une run terminée (game-over déterministe) — même recette que `hiscoreFlow.test.ts`. */
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

/** Atteint « Succès » depuis le titre UNIQUEMENT par nav()/confirm() (règle 8). */
function openAchievementsScreen(app: App): void {
  app.nav('down') // players
  app.nav('down') // stage
  app.nav('down') // scores
  app.nav('down') // succes
  app.confirm()
}

describe('flux succès — fin de run → profil → trophée', () => {
  beforeEach(() => {
    localStorage.clear()
    commitRunSpy.mockClear()
  })

  /**
   * LE test de non-régression du lot. `commitRun` n'est PAS idempotent (un appel
   * = une run terminée, ses cumuls s'AJOUTENT) et `getState()` tourne à 60 Hz sur
   * l'écran de fin : sans la garde one-shot, une seconde de rapport compterait la
   * run 60 fois.
   */
  it('ne verse la run au profil QU\'UNE fois, même après 100 getState()', () => {
    const app = deadApp()
    for (let i = 0; i < 100; i++) {
      app.getState()
    }
    expect(commitRunSpy).toHaveBeenCalledTimes(1)
  })

  /** Le corollaire OBSERVABLE : les cumuls du profil ne doivent pas dériver. */
  it('les cumuls du profil ne doublent pas quand on reste sur l\'écran de fin', () => {
    const app = deadApp()
    const after = readProgress()
    for (let i = 0; i < 100; i++) {
      app.getState()
    }
    expect(readProgress()).toEqual(after)
  })

  it('une NOUVELLE run reverse ses compteurs (la garde est par run, pas globale)', () => {
    const app = deadApp()
    expect(commitRunSpy).toHaveBeenCalledTimes(1)
    app.restart()
    reachGameOver(app)
    expect(commitRunSpy).toHaveBeenCalledTimes(2)
  })

  /**
   * `bestSurvivalMs` est un RECORD, pas un cumul : il doit arriver BRUT (la
   * fusion en prendra le max). L'envoyer déjà cumulé débloquerait « tenir 10
   * minutes » avec dix runs d'une minute.
   */
  it('envoie des compteurs de RUN cohérents (records bruts, cumuls du run)', () => {
    const app = deadApp()
    const state = app.getState()
    const run = commitRunSpy.mock.calls[0]?.[0] as Record<string, number>
    expect(run.kills).toBe(state.score)
    expect(run.bestSurvivalMs).toBe(state.elapsedMs)
    expect(run.stagesCompleted).toBe(0) // défaite : aucun chantier livré
    expect(run.bossKills).toBe(0)
  })

  /**
   * Le trophée doit VRAIMENT sortir. On passe par le pont de production
   * (`wireAchievementToasts`), pas par un rappel réécrit pour le test.
   */
  it('un succès débloqué en fin de run appelle showAchievement', () => {
    const app = new App({ seed: 42, mode: 'solo', autostart: true })
    const shown: string[] = []
    const sink: AchievementToastSink = { showAchievement: (d) => { shown.push(d.id) } }
    wireAchievementToasts(app.events, sink)

    app.advanceTime(16)
    // Un coffre posé SUR le joueur est ramassé au pas suivant → `ChestOpenedEvent`
    // → le succès « coffre ouvert » tombe, sans dépendre du hasard d'un kill.
    app.debugSpawnChestOnPlayer(1)
    for (let i = 0; i < 50 && app.getState().chestOpen === null; i++) {
      app.advanceTime(16)
    }
    expect(app.getState().chestOpen).not.toBeNull()
    // Le coffre peut ouvrir un choix de cartes (écran gelé) : on le solde.
    if (app.getState().screen === 'upgrade') {
      app.chooseUpgrade(0)
    }
    reachGameOver(app)

    expect(shown).toContain('coffre_ouvert')
    expect(readUnlocked().has('coffre_ouvert')).toBe(true)
  })

  it('un id inconnu du catalogue n\'atteint pas l\'overlay (profil d\'une autre version)', () => {
    const events = new EventTarget()
    const shown: string[] = []
    wireAchievementToasts(events, { showAchievement: (d) => { shown.push(d.id) } })
    events.dispatchEvent(new (class extends Event {
      readonly id = 'succes_du_futur'
      constructor() { super('achievementUnlocked') }
    })())
    expect(shown).toEqual([])
  })
})

describe('écran des succès (consultation depuis le titre)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('s\'atteint depuis le titre par nav()/confirm(), et « B » revient au titre', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    openAchievementsScreen(app)
    expect(app.getState().screen).toBe('achievements')
    app.back()
    expect(app.getState().screen).toBe('title')
  })

  it('« Retour » revient au titre (le seul item focalisable — aucun scroll)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    openAchievementsScreen(app)
    expect(app.getState().menu?.items.map((i) => i.id)).toEqual(['retour'])
    app.confirm()
    expect(app.getState().screen).toBe('title')
  })

  it('profil neuf : TOUT le catalogue est exposé, verrouillé (0 débloqué)', () => {
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    openAchievementsScreen(app)
    const view = app.getState().achievements
    expect(view?.entries.length).toBe(ACHIEVEMENTS.length)
    expect(view?.unlockedCount).toBe(0)
    expect(view?.entries.every((e) => !e.unlocked)).toBe(true)
  })

  it('reflète le profil : un succès acquis ressort débloqué', () => {
    realCommitRun({
      kills: 0, bossKills: 1, chestsOpened: 0, weaponEvolutions: 0,
      prisonersFreed: 0, stagesCompleted: 0, bestSurvivalMs: 0, bestLevel: 1
    })
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    openAchievementsScreen(app)
    const view = app.getState().achievements
    expect(view?.unlockedCount).toBe(1)
    expect(view?.entries.find((e) => e.id === 'premier_boss')?.unlocked).toBe(true)
  })
})

describe('écran des succès (rendu DOM)', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.replaceChildren()
  })

  /**
   * Le piège que l'écran doit éviter : sur un profil neuf, cacher les succès non
   * acquis donnerait un écran VIDE. Ils restent VISIBLES, grisés (doctrine
   * `starRow` : voir ce qu'on a raté).
   */
  it('profil neuf : les succès s\'affichent tous, grisés — pas d\'écran vide', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const overlay = new Overlay(root)
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    openAchievementsScreen(app)
    overlay.sync(app.getState())

    expect(root.querySelectorAll('.ach-row').length).toBe(ACHIEVEMENTS.length)
    expect(root.querySelectorAll('.ach-row--on').length).toBe(0)
    expect(root.querySelector('.panel__subtitle')?.textContent).toBe(`0 / ${ACHIEVEMENTS.length} débloqués`)
    // La condition de chaque succès reste lisible : c'est elle qui donne l'objectif.
    expect(root.querySelectorAll('.ach__desc').length).toBe(ACHIEVEMENTS.length)
  })

  it('un succès acquis se distingue visuellement des autres', () => {
    realCommitRun({
      kills: 0, bossKills: 1, chestsOpened: 0, weaponEvolutions: 0,
      prisonersFreed: 0, stagesCompleted: 0, bestSurvivalMs: 0, bestLevel: 1
    })
    const root = document.createElement('div')
    document.body.append(root)
    const overlay = new Overlay(root)
    const app = new App({ seed: 1, mode: 'solo', autostart: false })
    openAchievementsScreen(app)
    overlay.sync(app.getState())

    expect(root.querySelectorAll('.ach-row--on').length).toBe(1)
    expect(root.querySelectorAll('.ach-row').length).toBe(ACHIEVEMENTS.length)
  })
})
