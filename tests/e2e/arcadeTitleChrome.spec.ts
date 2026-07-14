import { test, expect } from '@playwright/test'

/**
 * Refonte arcade P1 : l'écran titre porte l'habillage de borne (1UP/HI-SCORE,
 * INSERT COIN, PUSH START, © studio). Le HI-SCORE est lu de localStorage.
 */
test('titre arcade : habillage présent + HI-SCORE lu de localStorage', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('btp:hiscore', '28900'))
  await page.goto('/?test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, undefined, { timeout: 60000 })
  await expect(page.locator('.insertcoin')).toBeVisible()
  await expect(page.locator('.pushstart__label')).toHaveText('PUSH START')
  await expect(page.locator('.arcbar__hi')).toContainText('028900')
  await expect(page.locator('.studio')).toContainText('AIL ENTERTAINMENT')
  await page.screenshot({ path: 'test-results/arcade-title.png' })
})
