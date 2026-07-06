import { test, expect } from '@playwright/test'

/**
 * Phase C — Mini-carte (vie du chantier).
 *
 * Valide via le seam JSON (pas de pixels) :
 * - `.minimap` (panneau bas-gauche) est visible en jeu ;
 * - 5 marqueurs prisonniers (`.minimap__dot--prisoner`) au départ (RESCUE.count) ;
 * - le toggle (`window.__GAME__.toggleMinimap()`, câblé sur M / bouton Back manette)
 *   masque le panneau.
 */
test('mini-carte : présente, togglable, marqueurs prisonniers', async ({ page }) => {
  await page.goto('/?autostart=solo&level=1&seed=7&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })

  const map = page.locator('.minimap')
  await expect(map).toBeVisible()

  // 5 prisonniers au départ (RESCUE.count).
  await expect(page.locator('.minimap__dot--prisoner')).toHaveCount(5)

  // Toggle via le seam (l'action clavier M / manette Back route vers app.toggleMinimap).
  await page.evaluate(() => window.__GAME__?.toggleMinimap?.())
  await expect(map).toBeHidden()
})
