import { test, expect } from '@playwright/test'

/**
 * Écran de mort « Rapport de chantier » — validation e2e via le seam JSON.
 * Pilote le vrai jeu (Phaser + overlay DOM) en headless déterministe.
 */

test('deathScreen — debugKillPlayer → gameover → rapport peuplé + DOM correct', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // S'assurer qu'on est bien en jeu avant de tuer le joueur.
  const s0 = await page.evaluate(() => window.__GAME__?.getState())
  expect(s0?.screen).toBe('game')

  // Tuer le joueur via l'API debug.
  await page.evaluate(() => window.__GAME__?.debugKillPlayer())

  // Avancer le temps pour que la sim traite la mort (quelques frames).
  await page.evaluate(() => window.__GAME__?.advanceTime(500))

  // Attendre l'écran game-over (poll maximal 5 s).
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen), { timeout: 5000 })
    .toBe('gameover')

  // Vérifier que deathReport est peuplé.
  const report = await page.evaluate(() => window.__GAME__?.getState().deathReport)
  expect(report).not.toBeNull()
  expect(report?.progressPercent).toBeGreaterThanOrEqual(0)
  expect(typeof report?.quote).toBe('string')
  expect((report?.quote ?? '').length).toBeGreaterThan(0)
  expect(report?.stageDurationMs).toBeGreaterThan(0)

  // DOM : barre présente.
  await expect(page.locator('.report__bar')).toBeVisible()

  // Phrase non vide.
  await expect(page.locator('.report__quote')).not.toBeEmpty()

  // Stats présentes (les 4 lignes).
  const stats = page.locator('.report__stats')
  await expect(stats).toBeVisible()
  await expect(stats).toContainText('%')
  await expect(stats).toContainText(':')

  // Bouton Recommencer présent et focusé.
  const items = page.locator('.menu__item')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toHaveText('Recommencer')
  await expect(items.first()).toHaveClass(/menu__item--focus/)

  // Screenshot pour régression visuelle.
  await page.screenshot({ path: 'test-results/death-screen-report.png', fullPage: false })
})
