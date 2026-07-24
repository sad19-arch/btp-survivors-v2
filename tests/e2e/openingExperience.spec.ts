import { expect, test } from '@playwright/test'

test('ouverture : intro gelée puis premier kill rendu et sonorisé', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/?autostart=solo&level=1&seed=42&test=1&intro=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })

  const before = await page.evaluate(() => window.__GAME__?.getState())
  expect(before?.introActive).toBe(true)
  expect(before?.elapsedMs).toBe(0)
  expect(before?.enemies).toHaveLength(1)
  const player = before?.players[0]
  const enemy = before?.enemies[0]
  expect((enemy?.y ?? 0) - (player?.y ?? 0)).toBeGreaterThan(450)

  await page.evaluate(() => window.__GAME__?.advanceTime(1000))
  const frozen = await page.evaluate(() => window.__GAME__?.getState())
  expect(frozen?.elapsedMs).toBe(0)
  expect(frozen?.score).toBe(0)
  expect(frozen?.enemies[0]?.x).toBe(enemy?.x)
  expect(frozen?.enemies[0]?.y).toBe(enemy?.y)

  await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      return
    }
    const counts = { fired: 0, killed: 0 }
    game.events.addEventListener('weaponFired', () => { counts.fired++ })
    game.events.addEventListener('enemyKilled', () => { counts.killed++ })
    ;(window as Window & { __OPENING_EVENTS__?: typeof counts }).__OPENING_EVENTS__ = counts
    game.skipIntro()
  })

  await page.evaluate(() => new Promise<void>((resolve) => {
    let ticks = 0
    const interval = setInterval(() => {
      window.__GAME__?.advanceTime(100)
      ticks++
      if (ticks >= 80 || (window.__GAME__?.getState().score ?? 0) > 0) {
        clearInterval(interval)
        resolve()
      }
    }, 20)
  }))

  const after = await page.evaluate(() => ({
    state: window.__GAME__?.getState(),
    events: (window as Window & { __OPENING_EVENTS__?: { fired: number; killed: number } }).__OPENING_EVENTS__,
    feedback: window.__GAME__?.debugFeedbackInfo?.()
  }))
  expect(after.state?.introActive).toBe(false)
  expect(after.state?.score).toBeGreaterThanOrEqual(1)
  expect(after.state?.elapsedMs ?? Infinity).toBeLessThanOrEqual(8000)
  expect(after.events?.fired ?? 0).toBeGreaterThan(0)
  expect(after.events?.killed ?? 0).toBeGreaterThan(0)
  expect(after.feedback?.spawnedTotal ?? 0).toBeGreaterThan(0)
})
