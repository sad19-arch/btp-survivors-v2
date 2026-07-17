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
 * P4 refonte mobile + MOB-LATER — champ de vision : le zoom caméra vient de la
 * source de vérité responsive (`computeViewport`), adaptatif à la TAILLE du
 * viewport et non au type d'entrée.
 *
 * Ce test exigeait « desktop = 1.2 STRICT ». Cette règle N'EXISTE PLUS : MOB-LATER
 * (« zoom adaptatif aussi sur petit écran PC ») l'a remplacée par une formule
 * unique — zoom = clamp(demi-diagonale écran / REF_HALF_DIAG, 0.45, 1.2). Un écran
 * ≥ 1920×1080 y retombe exactement sur 1.2 (parité PC intacte), mais le viewport
 * Playwright « Desktop Chrome » fait 1280×720 → 0.80. L'égalité stricte encodait
 * donc la taille de la fenêtre de test, pas une règle produit.
 *
 * L'INVARIANT réel, lui, est le même pour les deux plateformes et vaut mieux qu'une
 * égalité : la demi-diagonale de monde visible reste ≤ la référence PC (≈ 918), donc
 * en-deçà de SPAWN.ringRadius = 1040 — les ennemis apparaissent HORS écran. C'est
 * la propriété de gameplay que la formule sert ; c'est elle qu'on verrouille.
 */
test('FOV : zoom adaptatif borné / diagonale visible ≤ référence PC (spawn hors-écran)', async ({ page }, testInfo) => {
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

  const visibleW = cam.w / cam.zoom
  const visibleHalfDiag = Math.hypot(cam.w, cam.h) / 2 / cam.zoom

  // ─ Invariant commun aux DEUX plateformes (c'est le cœur du test) ─
  // Bornes de la formule : jamais plus zoomé que la référence PC, jamais moins
  // lisible que le plancher (héros ~99 px monde ⇒ ≥ ~45 px écran).
  expect(cam.zoom).toBeGreaterThanOrEqual(0.45)
  expect(cam.zoom).toBeLessThanOrEqual(1.2)
  // Spawn hors-écran : diagonale visible ≤ référence PC (918) + tolérance d'arrondi
  // (`cameraZoom` est snappé à 2 décimales). Au-delà, un ennemi apparu sur l'anneau
  // SPAWN.ringRadius = 1040 serait visible à l'écran — bug de gameplay, pas cosmétique.
  expect(visibleHalfDiag).toBeLessThanOrEqual(919)

  if (isMobile) {
    // Pixel 7 (412×839) : la formule dé-zoome fortement.
    expect(cam.zoom).toBeLessThan(0.7)
    // Avant P4 : ~343 unités monde de large sur Pixel 7. Après : > 700 (≈ ×2.3).
    expect(visibleW).toBeGreaterThan(700)
  } else {
    // Desktop Chrome (1280×720) : plus petit que la référence 1920×1080, donc la
    // formule dé-zoome AUSSI sur PC (MOB-LATER). Borne haute stricte : à 1.2 sur
    // 1280×720 la vue serait ~1.5× trop étroite et le jeu injouable au regard de la
    // référence — c'est la régression que le seuil garde, pas une valeur figée.
    expect(cam.zoom).toBeLessThan(1.2)
    expect(visibleW).toBeGreaterThan(900)
  }
})
