import { test, expect } from '@playwright/test'
import * as path from 'path'

/**
 * Checkpoint visuel : stage 03 (fondations) avec composition scriptée premium.
 * Charge le stage 03, laisse le monde se poser (quelques frames simulées),
 * fait une capture PNG dans test-results/golden-stage03-overview.png.
 *
 * L'assertion principale est que le stage CHARGE SANS CRASH
 * (seam ready = true, scène = game). La capture est le produit dérivé
 * (inspecté par l'utilisateur = validation oracle visuel).
 */
test('golden stage 03 — fondations — charge sans crash et produit une capture', async ({ page }) => {
  // Autostart sur le stage 03 (level=3), seed fixe pour reproductibilité.
  await page.goto('/?autostart=solo&level=3&seed=1&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })

  const s0 = await page.evaluate(() => window.__GAME__?.getState())
  expect(s0?.scene).toBe('game')
  expect(s0?.players.length).toBeGreaterThanOrEqual(1)

  // Laisser le streamer charger les chunks initiaux (quelques frames RAF réelles).
  await page.waitForTimeout(500)

  // Avancer un peu pour laisser les ennemis apparaître et confirmer la stabilité.
  await page.evaluate(() => {
    window.__GAME__?.setInput(1, { move: { x: 0, y: 0 }, attack: false })
    window.__GAME__?.advanceTime(3000)
  })

  const s1 = await page.evaluate(() => window.__GAME__?.getState())
  // La partie tourne encore (pas de game over en 3 s avec un joueur immobile au spawn).
  expect(['game', 'upgrade']).toContain(s1?.scene)

  const workers = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  expect(workers?.count ?? 0).toBeGreaterThanOrEqual(3)
  const workerTextures = workers?.workers.map((w) => w.texture) ?? []
  expect(workerTextures).toEqual(expect.arrayContaining([
    'npc_stage03',
    'npc_stage03_coffreur',
    'npc_stage03_betonnier',
  ]))

  // Capture : nom absolu pour que Playwright la place dans test-results/.
  const capturePath = path.join('test-results', 'golden-stage03-overview.png')
  await page.screenshot({ path: capturePath, fullPage: false })

  console.log(`[golden-stage03] capture => ${capturePath}`)
})

/**
 * Vérifie que le stage 03 est stable pendant 10 s simulées (pas de NaN,
 * pas de crash, scène = game ou upgrade).
 */
test('golden stage 03 — stable 10 s', async ({ page }) => {
  await page.goto('/?autostart=solo&level=3&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })

  // Jouer 10 s en mode kite simple.
  await page.evaluate(() => {
    window.__GAME__?.setInput(1, { move: { x: 1, y: 0 }, attack: true })
    window.__GAME__?.advanceTime(10000)
  })

  const s = await page.evaluate(() => window.__GAME__?.getState())
  expect(['game', 'upgrade', 'gameover']).toContain(s?.scene)

  // Pas de NaN dans les positions joueurs.
  const p = s?.players[0]
  if (p !== undefined) {
    expect(isNaN(p.x)).toBe(false)
    expect(isNaN(p.y)).toBe(false)
  }
})
