import { test, expect } from '@playwright/test'

/**
 * Tier-2 (seam) : le HUD manettes (« Manettes N/4 » + 4 pastilles) est présent
 * dès qu'on est en jeu (hors intro). En headless aucune manette n'est branchée →
 * « 0/4 » et 4 pastilles éteintes. La logique de mapping est couverte en unit
 * (`tests/unit/gamepadHud.test.ts`) ; ici on valide le rendu DOM réel.
 */
test('HUD manettes : « Manettes N/4 » + 4 pastilles', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  // Passer l'intro (le HUD manettes n'apparaît qu'ensuite).
  await page.evaluate(() => {
    const g = window.__GAME__
    if (g === undefined) {
      return
    }
    for (let t = 0; t < 6000 && g.getState().introActive; t += 100) {
      g.advanceTime(100)
    }
  })
  await page.waitForSelector('.pad__label', { timeout: 5000 })
  const label = await page.locator('.pad__label').textContent()
  expect(label).toContain('Manettes')
  expect(label).toContain('0/4')
  expect(await page.locator('.pad__pip').count()).toBe(4)
})
