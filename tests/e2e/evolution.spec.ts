import { test, expect } from '@playwright/test'

/**
 * Tier-2 (seam) : le moment d'evolution d'arme (coffre ramasse + conditions
 * reunies) doit se voir dans le DOM (bandeau) ET dans l'etat (nouvelle arme).
 * Miroir de `tests/unit/chestEvolution.test.ts` (niveau sim), ici via le
 * seam sur le vrai jeu (App + Overlay).
 */

test("coffre d'evolution ramasse -> arme evoluee + bandeau .banner--evolution", async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => {
    window.__GAME__?.debugGrant({
      weapons: [{ id: 'cloueur', level: 8 }],
      passives: [{ id: 'air_comprime', level: 1 }]
    })
    window.__GAME__?.debugSpawnChestOnPlayer()
    window.__GAME__?.advanceTime(200)
  })

  const state = await page.evaluate(() => window.__GAME__?.getState())
  const weaponIds = state?.players[0]?.weapons ?? []
  expect(weaponIds).toContain('mitrailleuse_clous')

  const banner = page.locator('.banner--evolution')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('Mitrailleuse')
})

/**
 * B5 — Panneau jackpot : a la prise d'un coffre d'evolution, le panneau
 * `.jackpot` apparait dans le DOM, affiche le nom de l'arme evoluee, et
 * disparait automatiquement (~1.5s). Le jeu reste navigable pendant l'anim.
 */
test("B5 -- jackpot : panneau .jackpot visible apres coffre d'evolution, disparait ensuite", async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // Preparer les conditions d'evolution et ramasser un coffre.
  await page.evaluate(() => {
    window.__GAME__?.debugGrant({
      weapons: [{ id: 'cloueur', level: 8 }],
      passives: [{ id: 'air_comprime', level: 1 }]
    })
    window.__GAME__?.debugSpawnChestOnPlayer()
    window.__GAME__?.advanceTime(200)
  })

  // Le panneau jackpot doit etre visible immediatement apres la collecte.
  const jackpot = page.locator('.jackpot')
  await expect(jackpot).toBeVisible({ timeout: 1000 })

  // Il contient le nom de l'arme evoluee.
  await expect(jackpot).toContainText('Mitrailleuse')

  // Capture DA du panneau jackpot (regression visuelle).
  await page.screenshot({ path: 'test-results/jackpot-chest.png', fullPage: false })

  // L'etat du jeu reste accessible (pas de gel par l'animation).
  const state = await page.evaluate(() => window.__GAME__?.getState())
  expect(state?.players[0]?.weapons).toContain('mitrailleuse_clous')

  // Le panneau disparait automatiquement (<= 2s apres la collecte).
  await expect(jackpot).not.toBeVisible({ timeout: 2500 })
})

/**
 * B5 — Jackpot DA : le titre du panneau est "EVOLUTION" (DA-safe, pas d'emoji).
 */
test('B5 -- jackpot DA : titre .jackpot__title present, pas emoji', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => {
    window.__GAME__?.debugGrant({
      weapons: [{ id: 'cloueur', level: 8 }],
      passives: [{ id: 'air_comprime', level: 1 }]
    })
    window.__GAME__?.debugSpawnChestOnPlayer()
    window.__GAME__?.advanceTime(200)
  })

  const title = page.locator('.jackpot__title')
  await expect(title).toBeVisible({ timeout: 1000 })
  const text = await title.textContent()
  // Pas d'emoji, texte non vide.
  expect(text).not.toMatch(/[\u{1F300}-\u{1FFFF}]/u)
  expect(text?.length).toBeGreaterThan(0)
})
