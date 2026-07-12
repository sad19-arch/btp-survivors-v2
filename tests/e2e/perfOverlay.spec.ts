import { test, expect } from '@playwright/test'

/**
 * Overlay de diagnostic perf (`?perf=1`) : panneau DOM DA 16-bit affichant le
 * snapshot de `debugPerfProfile()`. Gated par le flag seul — présent avec
 * `?perf=1`, absent sans.
 */
test('overlay perf present avec ?perf=1', async ({ page }) => {
  await page.goto('/?test=1&autostart=solo&perf=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await expect(page.locator('.perf-overlay')).toBeVisible()
})

test('overlay perf absent sans le flag', async ({ page }) => {
  await page.goto('/?test=1&autostart=solo')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await expect(page.locator('.perf-overlay')).toHaveCount(0)
})
