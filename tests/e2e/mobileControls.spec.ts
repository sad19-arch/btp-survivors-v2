import { test, expect } from '@playwright/test'

/**
 * Contrôles & HUD mobile. Le stick tactile + le bouton pause ne sont instanciés
 * que sur un device au pointeur grossier (Pixel 7) ; la classe `.ui-mobile`
 * (échelle du HUD) suit le viewport étroit. Sur desktop (chromium) : aucun des
 * deux → régression zéro. Assertions par projet via `testInfo.project.name`.
 */
test('stick/pause + .ui-mobile : présents sur mobile, absents sur desktop', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile'
  await page.goto('/?autostart=solo&level=1&seed=7&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const uiMobile = await page.evaluate(
    () => document.getElementById('ui-root')?.classList.contains('ui-mobile') ?? false
  )
  expect(uiMobile).toBe(isMobile)

  if (isMobile) {
    await expect(page.locator('.touch-stick')).toBeVisible()
    await expect(page.locator('.touch-pause')).toBeVisible()
  } else {
    await expect(page.locator('.touch-stick')).toHaveCount(0)
    await expect(page.locator('.touch-pause')).toHaveCount(0)
  }
})

test('mobile : le stick est masqué hors du jeu (au titre)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'stick tactile mobile uniquement')
  await page.goto('/?test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await expect(page.locator('.touch-stick')).toBeHidden()
})
