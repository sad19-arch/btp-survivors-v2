import { test, expect } from '@playwright/test'

/**
 * Valide le rendu des cartes de level-up dans le navigateur :
 * - couleur arme (card--weapon) / passif (card--passive)
 * - ligne de description visible
 * - rangée de pips de niveau (.card__pips)
 */

test('cartes de level-up : couleur, description et pips visibles', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // Forcer un level-up : ajouter de l'XP puis avancer le temps pour que le sim traite.
  await page.evaluate(() => {
    const g = window.__GAME__
    if (g === undefined) { return }
    // Injecter l'XP + avancer jusqu'à ce que le level-up soit traité (max 10 s simulées).
    g.debugAddXp(10000)
    for (let t = 0; t < 10_000 && g.getState().screen !== 'upgrade'; t += 100) {
      g.advanceTime(100)
    }
  })

  // Vérifier que l'écran upgrade est actif (état sim)
  const screen = await page.evaluate(() => window.__GAME__?.getState().screen)
  expect(screen).toBe('upgrade')

  // Attendre que l'overlay DOM soit rendu (rafAnimFrame)
  await page.waitForSelector('.card', { timeout: 5000 })

  // Au moins une carte avec classe couleur (weapon ou passif)
  const weaponCards = page.locator('.card.card--weapon')
  const passiveCards = page.locator('.card.card--passive')
  const coloredCount = (await weaponCards.count()) + (await passiveCards.count())
  expect(coloredCount).toBeGreaterThan(0)

  // Au moins une carte a une ligne de description non vide
  await page.waitForSelector('.card__desc', { timeout: 3000 })
  const descElements = page.locator('.card__desc')
  const descCount = await descElements.count()
  expect(descCount).toBeGreaterThan(0)
  const firstDesc = await descElements.first().textContent()
  expect(firstDesc?.trim().length ?? 0).toBeGreaterThan(0)

  // Au moins une carte a des pips de niveau
  const pipsContainers = page.locator('.card__pips')
  expect(await pipsContainers.count()).toBeGreaterThan(0)

  // Les pips existent (remplis ou vides)
  const allPips = page.locator('.pip')
  expect(await allPips.count()).toBeGreaterThan(0)
})
