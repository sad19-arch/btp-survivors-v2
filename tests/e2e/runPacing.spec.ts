import { test, expect } from '@playwright/test'

test('la respiration coupe les spawns et invite à explorer', async ({ page }) => {
  await page.goto('/?autostart=solo&level=1&seed=42&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.evaluate(() => {
    window.__GAME__?.debugSpawnEnemies(60, 220)
    window.__GAME__?.advanceTime(100)
  })
  await page.waitForFunction(() => {
    const game = window.__GAME__
    const state = game?.getState()
    const rendered = game?.debugEnemyRenderInfo?.() ?? []
    return ['motton', 'enracineur'].every((type) => {
      const ids = state?.enemies.filter((enemy) => enemy.type === type).map((enemy) => enemy.id) ?? []
      return rendered.some((entry) => ids.includes(entry.id) && entry.texture === type)
    })
  })

  const sawMotton = await page.evaluate(() => {
    const game = window.__GAME__
    let sawSwarm = false
    game?.skipIntro()
    game?.debugGrant({ weapons: [{ id: 'marteau', level: 8 }] })
    game?.setInput(1, { move: { x: 0.7, y: 0.7 }, attack: true })
    while ((game?.getState().elapsedMs ?? 0) < 75_200 && game?.getState().screen !== 'gameover') {
      if (game?.getState().pendingLevelUp !== null) {
        game?.chooseUpgrade(0)
      }
      game?.advanceTime(100)
      const mottonIds = game?.getState().enemies.filter((enemy) => enemy.type === 'motton').map((enemy) => enemy.id) ?? []
      sawSwarm ||= mottonIds.length > 0
    }
    return sawSwarm
  })

  const before = await page.evaluate(() => ({
    state: window.__GAME__?.getState(),
    ids: window.__GAME__?.getState().enemies.map((enemy) => enemy.id) ?? []
  }))
  expect(before.state?.runBeat).toBe('breather')
  expect(sawMotton).toBe(true)
  await expect(page.locator('.hud__breather')).toHaveCount(0)

  await page.evaluate(() => {
    const game = window.__GAME__
    game?.setInput(1, { move: { x: 1, y: 0 }, attack: false })
    game?.advanceTime(5_000)
  })
  const afterIds = await page.evaluate(() => window.__GAME__?.getState().enemies.map((enemy) => enemy.id) ?? [])
  expect(afterIds.every((id) => before.ids.includes(id))).toBe(true)

  await page.evaluate(() => window.__GAME__?.advanceTime(7_000))
  expect(await page.evaluate(() => window.__GAME__?.getState().runBeat)).toBe('pressure')
  await expect(page.locator('.hud__breather')).toHaveCount(0)
})
