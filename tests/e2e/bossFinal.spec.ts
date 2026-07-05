import { test, expect } from '@playwright/test'

/**
 * Tier-2 (seam) : le boss FINAL doit être visuellement distinct du mid-boss —
 * barre de PV nommée « CONTREMAÎTRE MAUDIT » + bandeau d'arrivée dédié
 * (`.banner--boss-final`). Mirroir de `tests/unit/overlay.test.ts` (identité
 * du boss), ici via le seam sur le vrai jeu (App + Overlay).
 */

test('boss final → barre "CONTREMAÎTRE MAUDIT" + bandeau .banner--boss-final', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => {
    window.__GAME__?.debugSpawnBoss('final')
    window.__GAME__?.advanceTime(100)
  })

  const bossBarName = page.locator('.bossbar__name')
  await expect(bossBarName).toBeVisible()
  await expect(bossBarName).toContainText('CONTREMAÎTRE MAUDIT')

  const banner = page.locator('.banner--boss-final')
  await expect(banner).toBeVisible()
})
