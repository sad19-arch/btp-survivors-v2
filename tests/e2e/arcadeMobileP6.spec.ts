import { test, expect } from '@playwright/test'

/**
 * P6 — skin mobile paysage : (1) sur un vrai tactile tenu en PORTRAIT, l'invite
 * « tourne l'appareil » se superpose ; (2) en PAYSAGE elle disparaît et le HUD
 * reste compact (ne dévore pas l'écran — leçon « HUD géant en paysage »).
 *
 * Ne concerne que les devices tactiles → skip sur le projet desktop (pointer fin).
 */

async function isTouch(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
}

test('portrait tactile → invite « tourne l\'appareil » visible', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 }) // Pixel 7 portrait
  await page.goto('/?seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  test.skip(!(await isTouch(page)), 'device pointer fin (desktop) — invite non applicable')

  const hint = page.locator('.rotate-hint--show')
  await expect(hint).toBeVisible()
  await expect(page.locator('.rotate-hint__title')).toHaveText('TOURNE L\'APPAREIL')
})

test('paysage tactile → invite masquée + HUD compact (non géant)', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 }) // Pixel 7 paysage
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  test.skip(!(await isTouch(page)), 'device pointer fin (desktop) — skin mobile non applicable')

  // L'invite ne doit PAS être montrée en paysage.
  await expect(page.locator('.rotate-hint--show')).toHaveCount(0)

  // Le HUD (barre haut-gauche) reste compact : hauteur rendue bornée à ~45% de
  // la hauteur du viewport paysage (sans le fix d'échelle, il dévorait la moitié).
  const hud = page.locator('.hud')
  const box = await hud.boundingBox()
  if (box === null) {throw new Error('HUD introuvable')}
  expect(box.height).toBeLessThan(412 * 0.45)
})
