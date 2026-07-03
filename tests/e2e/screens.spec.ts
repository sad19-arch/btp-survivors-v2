import { test, expect } from '@playwright/test'

/**
 * Vérifie le rendu réel de l'overlay DOM (écrans 16-bit) dans le navigateur,
 * et la navigation manette/clavier simulée via le seam → DOM.
 */

test('l’écran titre s’affiche et se navigue', async ({ page }) => {
  await page.goto('/?seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await expect(page.locator('.panel__title')).toHaveText('BTP Survivors')
  await expect(page.locator('.menu__item')).toHaveCount(5)
  await expect(page.locator('.menu__item--focus')).toHaveText('Jouer')

  // Navigue d'un cran : le focus descend sur le sélecteur de joueurs.
  await page.evaluate(() => window.__GAME__?.nav('down'))
  await expect(page.locator('.menu__item--focus')).toContainText('Joueurs')

  // Navigue d'un cran de plus : le focus descend sur le sélecteur de niveau.
  await page.evaluate(() => window.__GAME__?.nav('down'))
  await expect(page.locator('.menu__item--focus')).toContainText('Niveau')

  // Valide « Jouer » (retour en haut puis confirm) → écran de jeu, HUD visible.
  await page.evaluate(() => {
    window.__GAME__?.nav('up')
    window.__GAME__?.nav('up')
    window.__GAME__?.confirm()
  })
  await expect(page.locator('.panel')).toHaveCount(0)
  await expect(page.locator('.hud')).toContainText('Niv. 1')

  // L'inventaire (armes/passifs) est visible en jeu : l'arme de départ apparaît,
  // avec un marqueur de niveau (« Nv. »).
  await expect(page.locator('.inv__tile').first()).toBeVisible()
  await expect(page.locator('.inv')).toContainText('Nv.')

  // L'icône pixel (lot B3) de l'arme de départ se charge RÉELLEMENT : l'<img>
  // n'a pas été retiré au profit du monogramme, et sa largeur naturelle est > 0.
  const startIcon = page.locator('.inv__tile img').first()
  await expect(startIcon).toBeVisible()
  await expect
    .poll(() => startIcon.evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0)))
    .toBeGreaterThan(0)
})

test('l’écran de pause s’affiche', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.evaluate(() => window.__GAME__?.pause())
  await expect(page.locator('.panel__title')).toHaveText('Pause')
  await expect(page.locator('.menu__item')).toHaveCount(4)
})

test('sélectionner 2 joueurs au titre lance une coop', async ({ page }) => {
  await page.goto('/?seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // Focus « Joueurs », augmente à 2, puis lance depuis « Jouer ».
  await page.evaluate(() => {
    window.__GAME__?.nav('down')
    window.__GAME__?.nav('right')
    window.__GAME__?.nav('up')
    window.__GAME__?.confirm()
  })

  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().players.length))
    .toBe(2)
})
