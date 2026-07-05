import { test, expect } from '@playwright/test'

/**
 * Régression phase C : le SKIN du personnage choisi doit être RENDU (vrai sprite
 * texturé), pas un cercle de repli. C'est invisible à `getState` (qui ignore le
 * rendu) — on interroge la sonde `debugRenderInfo` posée par la GameScene. La
 * feuille se charge dynamiquement au 1er rendu de la run (pas préchargée au boot).
 *
 * Non-`lite` (charge des textures) → limité au projet chromium.
 */
test('le skin d’un perso non-défaut est rendu en jeu (pas un cercle de repli)', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'charge des textures : chromium uniquement')

  await page.goto('/?test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // Solo → « Jouer » → characterSelect → samoyède (index 9 du roster).
  await page.evaluate(() => window.__GAME__?.confirm())
  await page.evaluate(() => {
    const G = window.__GAME__
    if (G === undefined) {
      return
    }
    for (let i = 0; i < 9; i++) {
      G.nav('right')
    }
    G.confirm()
  })
  await page.waitForFunction(() => window.__GAME__?.getState().screen === 'game')

  const s = await page.evaluate(() => window.__GAME__?.getState())
  expect(s?.players[0]?.characterId).toBe('samoyede')

  // La feuille dédiée se charge à la volée → le sprite prend sa texture (≠ cercle).
  await page.waitForFunction(
    () => window.__GAME__?.debugRenderInfo?.()?.[0]?.texture === 'player_samoyede',
    null,
    { timeout: 8000 }
  )
  const info = await page.evaluate(() => window.__GAME__?.debugRenderInfo?.())
  expect(info?.[0]?.texture).toBe('player_samoyede') // pas null (= cercle de repli = bug)
})
