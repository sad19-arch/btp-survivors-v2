import { test, expect } from '@playwright/test'

/**
 * Phase C — Mini-carte (vie du chantier).
 *
 * Valide via le seam JSON (pas de pixels) :
 * - `.minimap` (panneau bas-gauche) est visible en jeu ;
 * - 5 marqueurs prisonniers (`.minimap__dot--prisoner`) au départ (RESCUE.count) ;
 * - le toggle (`window.__GAME__.toggleMinimap()`, câblé sur M / bouton Back manette)
 *   masque le panneau.
 *
 * NB : on démarre sur `level=2` (terrassement) et non `level=1` (terrain_vierge) :
 * ce dernier a désormais une compo committée → ses otages sont « posés en éditeur »
 * (0 par défaut). Les 5 otages procéduraux ne s'exercent que sur un stage non composé.
 */
test('mini-carte : présente, togglable, marqueurs prisonniers', async ({ page }) => {
  await page.goto('/?autostart=solo&level=2&seed=7&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })

  const map = page.locator('.minimap')
  await expect(map).toBeVisible()

  // La mise à jour des marqueurs est throttlée (~4 frames) → attendre explicitement
  // qu'au moins un marqueur prisonnier soit rendu avant de compter (robustesse).
  await page.locator('.minimap__dot--prisoner').first().waitFor({ state: 'attached', timeout: 15000 })

  // 5 prisonniers au départ (RESCUE.count).
  await expect(page.locator('.minimap__dot--prisoner')).toHaveCount(5)

  // Toggle via le seam (l'action clavier M / manette Back route vers app.toggleMinimap).
  await page.evaluate(() => window.__GAME__?.toggleMinimap?.())
  await expect(map).toBeHidden()
})
