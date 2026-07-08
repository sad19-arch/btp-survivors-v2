/**
 * T6 — Capture des beats clés du script terrassement.
 *
 * Spec jetable (non-lite, NON headless-lite) : boot level 2 avec intro=1.
 * Produit 5 PNG dans test-results/cine/ :
 *   t02-1-wide.png      t≈0     plan large initial
 *   t02-2-clonk.png     t≈850   gros plan pelle/fosse après le Clonk
 *   t02-3-one.png       t≈1300  un seul homme-boue remonte
 *   t02-4-punchin.png   t≈1900  punch-in sur l'ouvrier gêné
 *   t02-5-forty.png     t≈2450  les quarante jaillissent
 *
 * Le contrôleur nettoiera ce spec après validation DA.
 */

import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

test('cineCap - capture beats terrassement (T6)', async ({ page }) => {
  test.setTimeout(90000)

  const outDir = path.resolve('test-results/cine')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  // Boot NON-lite (vraies textures) avec intro activée sur le stage terrassement (level=2).
  await page.goto('/?autostart=solo&level=2&seed=1&test=1&intro=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 80000 })

  // Vérifie que l'intro est active.
  const state0 = await page.evaluate(() => window.__GAME__?.getState())
  expect(state0?.introActive).toBe(true)

  // Beat 1 : t≈0 — plan large initial (caméra vient d'être posée).
  await page.screenshot({ path: path.join(outDir, 't02-1-wide.png') })

  // Beat 2 : t≈850 — après le Clonk (cut gros plan + shake).
  // 500ms (wait plan large) + 250ms (wait clonk) + 100ms de marge = 850.
  await page.evaluate(() => window.__GAME__?.advanceTime(850))
  const info850 = await page.evaluate(() => window.__GAME__?.debugIntroInfo?.())
  expect(info850?.elapsedMs ?? 0).toBeGreaterThanOrEqual(850)
  await page.screenshot({ path: path.join(outDir, 't02-2-clonk.png') })

  // Beat 3 : t≈1300 — un seul homme-boue apparaît (zoom sur la fosse).
  // 850 + 450ms (wait homme-boue) = 1300.
  await page.evaluate(() => window.__GAME__?.advanceTime(450))
  await page.screenshot({ path: path.join(outDir, 't02-3-one.png') })

  // Beat 4 : t≈1900 — punch-in sur l'ouvrier + temps comique.
  // 1300 + 600ms (wait punch-in) = 1900.
  await page.evaluate(() => window.__GAME__?.advanceTime(600))
  await page.screenshot({ path: path.join(outDir, 't02-4-punchin.png') })

  // Beat 5 : t≈2450 — les quarante jaillissent (flash + shake).
  // 1900 + 500ms (wait forty) + 50ms marge = 2450.
  await page.evaluate(() => window.__GAME__?.advanceTime(550))
  await page.screenshot({ path: path.join(outDir, 't02-5-forty.png') })

  // Vérifie que les 5 PNG ont bien été écrits.
  const beats = ['t02-1-wide', 't02-2-clonk', 't02-3-one', 't02-4-punchin', 't02-5-forty']
  for (const beat of beats) {
    const filePath = path.join(outDir, `${beat}.png`)
    expect(fs.existsSync(filePath), `PNG manquant : ${filePath}`).toBe(true)
  }
})
