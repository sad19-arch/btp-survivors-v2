import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

/**
 * T5 — Câblage moteur cinématique (plomberie intro).
 *
 * Boot avec `?intro=1` pour activer le gel d'intro.
 * Vérifie :
 *   1. introActive === true au ready ; elapsedMs sim === 0 ; debugIntroInfo().active === true.
 *   2. advanceTime(500) → introElapsedMs >= 500 (gel cosmétique progresse).
 *   3. skipIntro() → introActive === false ; advanceTime(20) → elapsedMs sim > 0 ;
 *      debugIntroInfo().actorCount === 0 (pas de fuite).
 *   4. Capture test-results/cine/intro-plumbing.png (trace visuelle).
 */

test('introCinematic - plomberie intro (T5)', async ({ page }) => {
  test.setTimeout(90000)

  // Crée le dossier de sortie si nécessaire (Playwright ne le crée pas automatiquement).
  const outDir = path.resolve('test-results/cine')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  // Boot avec intro activée (intro=1) — niveau 2 pour avoir le stageId terrassement.
  await page.goto('/?autostart=solo&level=2&seed=1&test=1&intro=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 80000 })

  // 1. introActive === true, sim gelée (elapsedMs === 0), debugIntroInfo().active === true.
  const state0 = await page.evaluate(() => window.__GAME__?.getState())
  expect(state0?.introActive).toBe(true)
  expect(state0?.elapsedMs).toBe(0)

  const info0 = await page.evaluate(() => window.__GAME__?.debugIntroInfo?.())
  expect(info0).toBeDefined()
  expect(info0?.active).toBe(true)

  // 2. advanceTime(500) → introElapsedMs >= 500 (gel avance).
  await page.evaluate(() => window.__GAME__?.advanceTime(500))
  const state1 = await page.evaluate(() => window.__GAME__?.getState())
  expect(state1?.introElapsedMs ?? 0).toBeGreaterThanOrEqual(500)
  // La sim est toujours gelée pendant l'intro.
  expect(state1?.elapsedMs).toBe(0)

  // 3. skipIntro() → introActive === false, sim démarre.
  await page.evaluate(() => window.__GAME__?.skipIntro())
  const state2 = await page.evaluate(() => window.__GAME__?.getState())
  expect(state2?.introActive).toBe(false)

  // Un pas de sim → elapsedMs > 0.
  await page.evaluate(() => window.__GAME__?.advanceTime(20))
  const state3 = await page.evaluate(() => window.__GAME__?.getState())
  expect(state3?.elapsedMs ?? 0).toBeGreaterThan(0)

  // Pas de fuite d'acteurs cinéma après le skip.
  const info3 = await page.evaluate(() => window.__GAME__?.debugIntroInfo?.())
  expect(info3?.actorCount ?? 0).toBe(0)

  // 4. Capture visuelle (trace — pas d'assertion sur les pixels).
  await page.screenshot({ path: path.join(outDir, 'intro-plumbing.png') })
})
