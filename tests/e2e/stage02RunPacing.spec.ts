import { test, expect } from '@playwright/test'

test('le terrassement alterne chantier actif et évacuation des déblais', async ({ page }) => {
  await page.goto('/?autostart=solo&level=2&seed=42&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.evaluate(() => {
    window.__GAME__?.debugSpawnEnemies(60, 220)
    window.__GAME__?.advanceTime(100)
  })
  await page.waitForFunction(() => {
    const game = window.__GAME__
    const state = game?.getState()
    const rendered = game?.debugEnemyRenderInfo?.() ?? []
    return ['boueux', 'foreur', 'rocheux'].every((type) => {
      const ids = state?.enemies.filter((enemy) => enemy.type === type).map((enemy) => enemy.id) ?? []
      const texture = `enemy_s2_${type}`
      return rendered.some((entry) => ids.includes(entry.id) && entry.texture === texture)
    })
  })

  await page.evaluate(() => {
    const game = window.__GAME__
    game?.skipIntro()
    game?.debugGrant({ weapons: [{ id: 'marteau', level: 8 }] })
    game?.setInput(1, { move: { x: 0.7, y: 0.7 }, attack: true })
    while ((game?.getState().elapsedMs ?? 0) < 70_200 && game?.getState().screen !== 'gameover') {
      if (game?.getState().pendingLevelUp !== null) {
        game?.chooseUpgrade(0)
      }
      game?.advanceTime(100)
    }
  })

  const before = await page.evaluate(() => ({
    state: window.__GAME__?.getState(),
    ids: window.__GAME__?.getState().enemies.map((enemy) => enemy.id) ?? []
  }))
  expect(before.state?.stageId).toBe('terrassement')
  expect(before.state?.runBeat).toBe('breather')
  await expect(page.locator('.hud__breather')).toHaveCount(0)

  await page.evaluate(() => {
    window.__GAME__?.setInput(1, { move: { x: 1, y: 0 }, attack: false })
    window.__GAME__?.advanceTime(5_000)
  })
  const afterIds = await page.evaluate(() => window.__GAME__?.getState().enemies.map((enemy) => enemy.id) ?? [])
  expect(afterIds.every((id) => before.ids.includes(id))).toBe(true)

  await page.evaluate(() => window.__GAME__?.advanceTime(9_000))
  expect(await page.evaluate(() => window.__GAME__?.getState().runBeat)).toBe('pressure')
  await expect(page.locator('.hud__breather')).toHaveCount(0)
})
