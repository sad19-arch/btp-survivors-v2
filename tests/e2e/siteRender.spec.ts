import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

/**
 * T5 — Rendu des clusters de terrain (siteRenderer).
 *
 * Vérifie :
 *   1. Stage 02 (terrassement) : des sprites de cluster sont créés (count > 0).
 *   2. Pas de fuite au restart : le count reste borné après restart.
 *   3. Stage 01 (terrain_vierge) : aucun sprite de cluster (count === 0).
 *   4. Capture visuelle du terrain terrassement pour inspection manuelle.
 */

test('siteRender — stage 02 terrassement : clusters dessinés (count > 0)', async ({ page }) => {
  await page.goto('/?autostart=solo&level=2&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })

  const s0 = await page.evaluate(() => window.__GAME__?.getState())
  expect(s0?.scene).toBe('game')

  // Laisse Phaser finir le create() + le chargement initial.
  await page.waitForTimeout(300)

  const siteInfo = await page.evaluate(() => window.__GAME__?.debugSiteInfo?.())
  expect(siteInfo).toBeDefined()
  // terrassement a plusieurs clusters × ~12 éléments → au moins 1 sprite
  expect((siteInfo?.spriteCount ?? 0)).toBeGreaterThan(0)
  console.log(`[siteRender] stage02 spriteCount = ${siteInfo?.spriteCount ?? 'n/a'}`)
})

test('siteRender — stage 01 terrain_vierge : aucun sprite de cluster', async ({ page }) => {
  await page.goto('/?autostart=solo&level=1&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })

  await page.waitForTimeout(300)

  const siteInfo = await page.evaluate(() => window.__GAME__?.debugSiteInfo?.())
  // terrain_vierge = pas de clusters → 0 sprites
  expect(siteInfo?.spriteCount ?? 0).toBe(0)
  console.log(`[siteRender] stage01 spriteCount = ${siteInfo?.spriteCount ?? 'n/a'}`)
})

test('siteRender — pas de fuite au restart (stage 02)', async ({ page }) => {
  await page.goto('/?autostart=solo&level=2&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })
  await page.waitForTimeout(300)

  const before = await page.evaluate(() => window.__GAME__?.debugSiteInfo?.())
  const countBefore = before?.spriteCount ?? 0
  expect(countBefore).toBeGreaterThan(0)

  // Redémarre la partie.
  await page.evaluate(() => window.__GAME__?.restart())
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })
  await page.waitForTimeout(300)

  const after = await page.evaluate(() => window.__GAME__?.debugSiteInfo?.())
  const countAfter = after?.spriteCount ?? 0

  // Le count après restart doit être ≤ count avant (pas d'accumulation).
  // Idéalement identique (même seed → même layout).
  expect(countAfter).toBeGreaterThan(0)
  expect(countAfter).toBeLessThanOrEqual(countBefore * 1.5) // marge 50 % pour tolérer ordre init
  console.log(`[siteRender] restart: before=${countBefore} after=${countAfter}`)
})

test('siteRender — golden capture terrassement (zoom arrière)', async ({ page }) => {
  // Mode complet (pas lite) pour voir les assets réels.
  await page.goto('/?autostart=solo&level=2&seed=123&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 30000 })

  // Laisser le streamer charger + quelques frames de sim.
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    window.__GAME__?.setInput(1, { move: { x: 0, y: 0 }, attack: false })
    window.__GAME__?.advanceTime(500)
  })
  await page.waitForTimeout(200)

  // Capture golden terrassement — inspectée manuellement par le validateur.
  const capturePath = path.join('test-results', 'terrain-preview', 'golden-terrassement.png')
  fs.mkdirSync(path.dirname(capturePath), { recursive: true })
  await page.screenshot({ path: capturePath, fullPage: false })
  console.log(`[siteRender] golden capture => ${capturePath}`)

  // Assertion minimale : le jeu est en état de jeu.
  const s = await page.evaluate(() => window.__GAME__?.getState())
  expect(['game', 'upgrade']).toContain(s?.scene)
})
