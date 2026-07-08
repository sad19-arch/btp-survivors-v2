import { test, expect } from '@playwright/test'

/**
 * Capture de VALIDATION (golden) — vue d'ensemble + zoom cluster du stage 02
 * (terrassement). Utilise le seam `debugCameraOverview` qui GÈLE la caméra sur
 * un cadrage fixe (sinon le cameraController relerp le zoom + re-suit le joueur).
 * Pur outil de revue visuelle.
 */
test('golden overview — arène composée stage 02', async ({ page }) => {
  await page.goto('/?autostart=solo&level=2&seed=1&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) {
      window.__GAME__?.advanceTime(100)
    }
  })

  // Vue d'ensemble (zoom arrière gelé).
  await page.evaluate(() => {
    window.__GAME__?.debugCameraOverview?.(0.08, 5120, 3840) // centre monde 10240×7680
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/golden-stage02-overview.png' })

  // Zoom sur un cluster d'excavation (seed 1 → ancre ~1386,1632) : vérifier la
  // cohérence (fosse + anneau de clôture + pelleteuse groupés).
  await page.evaluate(() => {
    window.__GAME__?.debugCameraOverview?.(0.55, 4233, 694)
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/golden-stage02-cluster.png' })

  expect(true).toBe(true)
})
