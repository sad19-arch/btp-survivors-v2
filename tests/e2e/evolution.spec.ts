import { test, expect } from '@playwright/test'

/**
 * Tier-2 (seam) : le moment d'évolution d'arme (coffre ramassé + conditions
 * réunies) doit se voir dans le DOM (bandeau) ET dans l'état (nouvelle arme).
 * Mirroir de `tests/unit/chestEvolution.test.ts` (niveau sim), ici via le
 * seam sur le vrai jeu (App + Overlay).
 */

test('coffre d’évolution ramassé → arme évoluée + bandeau .banner--evolution', async ({ page }) => {
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
  await expect(banner).toContainText('Mitrailleuse à clous')
})
