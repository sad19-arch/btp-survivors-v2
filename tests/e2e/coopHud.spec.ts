import { test, expect } from '@playwright/test'

/**
 * Régression : en co-op, CHAQUE joueur doit avoir son HUD dédié (PV, XP, armes).
 * Avant le correctif, `syncHud`/`syncInventory` étaient câblés en dur sur
 * `state.players[0]` : J2/J3/J4 n'avaient ni barre de vie ni inventaire.
 */

test('co-op 2 joueurs : chaque joueur a son bloc HUD (PV + XP + armes)', async ({ page }) => {
  await page.goto('/?autostart=coop&seed=7&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.waitForSelector('.phud', { timeout: 5000 })

  // Un bloc par joueur, et chacun porte SES barres + SES armes.
  await expect(page.locator('.phud')).toHaveCount(2)
  for (const id of [1, 2]) {
    const block = page.locator(`.phud--p${id}`)
    await expect(block).toHaveCount(1)
    await expect(block.locator('.hud__bar--hp')).toHaveCount(1)
    await expect(block.locator('.hud__bar--xp')).toHaveCount(1)
    await expect(block.locator('.phud__id')).toHaveText(`J${id}`)
    // L'arme de départ de CE joueur est affichée dans SON bloc.
    expect(await block.locator('.inv__tile').count()).toBeGreaterThan(0)
  }
})

test('co-op 4 joueurs : 4 blocs, un par coin, sans doublon d\'inventaire', async ({ page }) => {
  await page.goto('/?autostart=coop4&seed=7&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.waitForSelector('.phud', { timeout: 5000 })

  await expect(page.locator('.phud')).toHaveCount(4)
  // Le panneau d'inventaire solo est inerte en co-op (sinon J1 serait affiché 2 fois).
  await expect(page.locator('.inv')).toHaveCount(0)

  // Les 4 blocs occupent 4 coins distincts.
  const boxes = await page.locator('.phud').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y) }
    })
  )
  const corners = new Set(boxes.map((b) => `${b.x < 640 ? 'L' : 'R'}${b.y < 360 ? 'T' : 'B'}`))
  expect(corners.size).toBe(4)
})

test('solo : HUD historique inchangé (pas de bloc joueur, inventaire dédié présent)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=7&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.waitForSelector('.hud__bar--hp', { timeout: 5000 })

  await expect(page.locator('.phud')).toHaveCount(0)
  await expect(page.locator('.hud__hp')).toHaveCount(1)
  await expect(page.locator('.inv')).toHaveCount(1)
})
