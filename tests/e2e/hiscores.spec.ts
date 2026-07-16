import { test, expect } from '@playwright/test'

/**
 * Flux « tableau des scores » de bout en bout, via le seam JSON (aucun pixel
 * n'est interprété) : fin de run → saisie du prénom → inscription → tableau →
 * la ligne SURVIT à un rechargement de page.
 *
 * Le prénom est saisi UNIQUEMENT avec nav()/confirm() : c'est la preuve
 * exécutable qu'aucune fonction n'exige la souris ni le clavier alphabétique
 * (règle 8 — 100 % manette).
 */

const STAGE = 'terrain_vierge'
const NAME = 'CHANTIER' // 8 lettres = les 8 cases

/** Mène une run solo déterministe jusqu'au rapport de fin. */
async function reachReport(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?autostart=solo&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.evaluate(() => window.__GAME__?.debugKillPlayer())
  await page.evaluate(() => window.__GAME__?.advanceTime(500))
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen), { timeout: 5000 })
    .toBe('gameover')
}

test('high scores — saisie 100 % manette, inscription, tableau, persistance', async ({ page }, testInfo) => {
  // Pas de `localStorage.clear()` ici : le contexte Playwright est déjà neuf par
  // test — et un clear posé en `addInitScript` se rejouerait AU RECHARGEMENT,
  // effaçant précisément ce que ce test doit prouver comme persistant.
  await reachReport(page)

  // Le rapport de chantier reste l'écran de fin : le tableau ne l'escamote pas.
  await expect(page.locator('.report__bar')).toBeVisible()
  const runScore = await page.evaluate(() => window.__GAME__?.getState().runReport?.runScore ?? 0)
  expect(runScore).toBeGreaterThan(0)

  // Quitter le rapport ouvre la saisie (le tableau est vide → le score qualifie).
  await page.evaluate(() => window.__GAME__?.confirm())
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen))
    .toBe('nameEntry')
  await expect(page.locator('.namecell')).toHaveCount(8)
  await expect(page.locator('.namecell--focus')).toHaveCount(1)

  // ── Saisie du nom : QUE des directions + valider. Aucune touche de caractère,
  // aucun clic. On monte la lettre de la case jusqu'à la bonne, puis on avance.
  await page.evaluate((name) => {
    const g = window.__GAME__
    if (g === undefined) {
      return
    }
    for (let i = 0; i < name.length; i++) {
      let guard = 0
      while (g.getState().nameEntry?.chars[i] !== name[i] && guard < 60) {
        g.nav('up')
        guard++
      }
      if (i < name.length - 1) {
        g.nav('right')
      }
    }
  }, NAME)
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().nameEntry?.name))
    .toBe(NAME)
  // Le DOM suit l'état : la grille se redessine quand la lettre/le curseur bouge.
  await expect(page.locator('.namegrid')).toContainText('C')
  await expect(page.locator('.namecell--focus')).toHaveText('R') // curseur sur la 8e case

  // ── Validation → inscription → tableau, ligne du joueur en surbrillance.
  await page.evaluate(() => window.__GAME__?.confirm())
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen))
    .toBe('hiscores')
  const me = page.locator('.hiscore-row--me')
  await expect(me).toHaveCount(1)
  await expect(me).toContainText(NAME)
  await expect(page.evaluate(() => window.__GAME__?.getState().hiScores?.rank)).resolves.toBe(0)

  // ── Anti-scroll : le panneau (20 lignes max) DOIT tenir dans l'écran, sinon la
  // plaque « Retour » devient inatteignable à la manette (le jeu n'a pas de scroll).
  if (testInfo.project.name === 'chromium') {
    const panel = await page.locator('.panel--hiscores').boundingBox()
    const viewport = page.viewportSize()
    if (panel === null || viewport === null) {
      throw new Error('panneau ou viewport introuvable')
    }
    expect(panel.y).toBeGreaterThanOrEqual(0)
    expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height)
    await expect(page.locator('.panel--hiscores .menu__item')).toHaveCount(1)
    await expect(page.locator('.panel--hiscores .menu__item--focus')).toHaveText('Retour')
  }

  // « Retour » rend la main au rapport (le joueur peut Recommencer / quitter).
  await page.evaluate(() => window.__GAME__?.confirm())
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen))
    .toBe('gameover')

  // ── Persistance : après un RECHARGEMENT complet, la ligne est toujours là.
  await page.goto('/?seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  const stored = await page.evaluate(() => window.localStorage.getItem('btp:hiscores_v1'))
  expect(stored).toContain(NAME)
  const parsed = JSON.parse(stored ?? '{}') as Record<string, { name: string; score: number }[]>
  expect(parsed[STAGE]?.[0]?.name).toBe(NAME)
  expect(parsed[STAGE]?.[0]?.score).toBe(runScore)

  // Et le HI-SCORE du titre n'est plus figé à « 000000 » (writeHiScore est branché).
  await expect(page.locator('.arcbar__hi')).not.toHaveText('HI-SCORE 000000')
  await expect(page.locator('.arcbar__hi')).toHaveText(`HI-SCORE ${String(runScore).padStart(6, '0')}`)
})

test('high scores — un score non qualifiant ne demande pas de nom', async ({ page }) => {
  // Tableau déjà plein de scores inatteignables → aucune run ne peut y entrer.
  await page.addInitScript(() => {
    window.localStorage.clear()
    const full = Array.from({ length: 20 }, (_, i) => ({
      name: `TOP${i}`,
      score: 9_000_000 + i,
      kills: 1,
      elapsedMs: 1000,
      level: 1
    }))
    window.localStorage.setItem('btp:hiscores_v1', JSON.stringify({ terrain_vierge: full }))
  })
  await reachReport(page)

  // Valider « Recommencer » relance directement : pas de détour par la saisie.
  await page.evaluate(() => window.__GAME__?.confirm())
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen))
    .not.toBe('nameEntry')
  expect(await page.locator('.namecell').count()).toBe(0)
})
