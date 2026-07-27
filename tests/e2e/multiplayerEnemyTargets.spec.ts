import { test, expect } from '@playwright/test'

test('les ennemis répartissent leurs cibles entre trois joueurs vivants', async ({ page }) => {
  await page.goto('/?autostart=coop3&level=1&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const initialLoads = await page.evaluate(() => {
    const game = window.__GAME__
    game?.skipIntro()
    game?.debugSpawnEnemies(30, 300)
    game?.advanceTime(100)
    const loads = new Map<number, number>()
    for (const enemy of game?.getState().enemies ?? []) {
      if (enemy.targetPlayerId !== undefined) {
        loads.set(enemy.targetPlayerId, (loads.get(enemy.targetPlayerId) ?? 0) + 1)
      }
    }
    return Object.fromEntries(loads)
  })

  expect(initialLoads[1]).toBeGreaterThanOrEqual(10)
  expect(initialLoads[1]).toBe(initialLoads[2])
  expect(initialLoads[2]).toBe(initialLoads[3])

  const afterPlayerTwoFalls = await page.evaluate(() => {
    const game = window.__GAME__
    game?.debugKillPlayer(2)
    game?.advanceTime(100)
    const loads = new Map<number, number>()
    for (const enemy of game?.getState().enemies ?? []) {
      if (enemy.targetPlayerId !== undefined) {
        loads.set(enemy.targetPlayerId, (loads.get(enemy.targetPlayerId) ?? 0) + 1)
      }
    }
    return Object.fromEntries(loads)
  })

  expect(afterPlayerTwoFalls[2]).toBeUndefined()
  expect(Math.abs((afterPlayerTwoFalls[1] ?? 0) - (afterPlayerTwoFalls[3] ?? 0))).toBeLessThanOrEqual(1)
})
