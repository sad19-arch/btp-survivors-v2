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

/**
 * P4 refonte mobile — champ de vision : le zoom caméra vient de la source de
 * vérité responsive. Desktop : 1.2 STRICT (parité PC, zéro régression).
 * Mobile : adaptatif — la DIAGONALE de monde visible rejoint la référence PC
 * (1600×900, demi-diag ≈ 918) sans jamais la dépasser (les spawns, ancrés à
 * SPAWN.ringRadius = 1040, restent hors écran).
 */
test('FOV : zoom desktop 1.2 strict / mobile élargi (diagonale ≈ référence PC)', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile'
  await page.goto('/?autostart=solo&level=1&seed=7&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const cam = await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__?: { scene: { getScene(k: string): { cameras: { main: { zoom: number; width: number; height: number } } } } } }).__PHASER_GAME__
    if (g === undefined) { return null }
    const c = g.scene.getScene('game').cameras.main
    return { zoom: c.zoom, w: c.width, h: c.height }
  })
  expect(cam).not.toBeNull()
  if (cam === null) { return }

  if (isMobile) {
    // Zoom adaptatif dans les bornes [0.45, 1.2[ et vue NETTEMENT élargie.
    expect(cam.zoom).toBeGreaterThanOrEqual(0.45)
    expect(cam.zoom).toBeLessThan(0.7)
    const visibleW = cam.w / cam.zoom
    const visibleHalfDiag = Math.hypot(cam.w, cam.h) / 2 / cam.zoom
    // Avant P4 : ~343 unités monde de large sur Pixel 7. Après : > 700 (≈ ×2.3).
    expect(visibleW).toBeGreaterThan(700)
    // Invariant spawn hors-écran : diagonale visible ≤ référence PC (918) + arrondi.
    expect(visibleHalfDiag).toBeLessThanOrEqual(919)
  } else {
    expect(cam.zoom).toBeCloseTo(1.2, 5)
  }
})
