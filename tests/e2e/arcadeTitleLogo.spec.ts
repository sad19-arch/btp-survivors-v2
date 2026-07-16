import { test, expect } from '@playwright/test'

/**
 * Refonte arcade P0 : l'écran titre affiche le logo sculpté BTP / CARNAGE
 * (planche 2a). Produit aussi une capture pour la revue DA du créateur.
 */
test('écran titre : logo sculpté BTP + CARNAGE présent', async ({ page }) => {
  await page.goto('/?test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, undefined, { timeout: 60000 })
  await expect(page.locator('.logo__btp')).toHaveText('BTP')
  await expect(page.locator('.logo__carnage')).toHaveText('CARNAGE')
  await expect(page.locator('.logo__topper')).toContainText('SUPER CHANTIER')
  await page.screenshot({ path: 'test-results/arcade-title.png' })
})
