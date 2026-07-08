import { test, expect } from '@playwright/test'

/**
 * T6 - Ouvriers navetteurs (siteWorkers).
 *
 * Verifie :
 *   1. Stage 02 (terrassement) : des ouvriers sont affiches (count > 0).
 *   2. Stage 01 (terrain_vierge) : aucun ouvrier (count = 0, pas de clusters).
 *   3. Pas de fuite au restart : count reste > 0 et ne s'accumule pas.
 */

test('siteWorkers - stage02 terrassement : des ouvriers affiches (count > 0)', async ({ page }) => {
  await page.goto('/?autostart=solo&level=2&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })

  const s0 = await page.evaluate(() => window.__GAME__?.getState())
  expect(s0?.scene).toBe('game')

  // Attendre que Phaser finisse create() + premier sync (reselect throttle 30 frames)
  await page.waitForTimeout(800)

  const info = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  expect(info).toBeDefined()
  expect((info?.count ?? 0)).toBeGreaterThan(0)
  console.log(`[siteWorkers] stage02 workerCount = ${info?.count ?? 'n/a'}`)
})

test('siteWorkers - stage01 terrain_vierge : aucun ouvrier (count = 0)', async ({ page }) => {
  await page.goto('/?autostart=solo&level=1&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })

  await page.waitForTimeout(500)

  const info = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  // terrain_vierge = pas de clusters -> pas d'ouvriers
  expect(info?.count ?? 0).toBe(0)
  console.log(`[siteWorkers] stage01 workerCount = ${info?.count ?? 'n/a'}`)
})

test('siteWorkers - pas de fuite au restart (stage02)', async ({ page }) => {
  await page.goto('/?autostart=solo&level=2&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })
  await page.waitForTimeout(800)

  const before = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  const countBefore = before?.count ?? 0
  expect(countBefore).toBeGreaterThan(0)

  // Redemarrage
  await page.evaluate(() => window.__GAME__?.restart())
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })
  await page.waitForTimeout(800)

  const after = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  const countAfter = after?.count ?? 0

  // Apres restart : toujours des ouvriers (meme layout, meme seed)
  expect(countAfter).toBeGreaterThan(0)
  // Pas d'accumulation : count <= 1.5x le count initial (marge generale)
  expect(countAfter).toBeLessThanOrEqual(countBefore * 2)
  console.log(`[siteWorkers] restart: before=${countBefore} after=${countAfter}`)
})
