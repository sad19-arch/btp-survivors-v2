import { test, expect } from '@playwright/test'

test('coop4 : chaque joueur blessé fait vibrer uniquement sa propre manette', async ({ page }) => {
  await page.addInitScript(() => {
    const counts = [0, 0, 0, 0]
    const pads = counts.map((_, index) => ({
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      connected: true,
      id: `Pad haptique P${index + 1}`,
      index,
      mapping: 'standard',
      timestamp: 0,
      vibrationActuator: {
        playEffect: () => {
          counts[index] = (counts[index] ?? 0) + 1
          return Promise.resolve('complete')
        },
        reset: () => Promise.resolve(),
      },
    }))
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => pads,
    })
    ;(window as Window & { __RUMBLE_COUNTS__?: number[] }).__RUMBLE_COUNTS__ = counts
  })

  await page.goto('/?autostart=coop4&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  for (let playerId = 1; playerId <= 4; playerId++) {
    const before = await page.evaluate(
      () => [...((window as Window & { __RUMBLE_COUNTS__?: number[] }).__RUMBLE_COUNTS__ ?? [])]
    )
    const after = await page.evaluate((id) => {
      window.__GAME__?.debugKillPlayer(id)
      window.__GAME__?.advanceTime(20)
      return [...((window as Window & { __RUMBLE_COUNTS__?: number[] }).__RUMBLE_COUNTS__ ?? [])]
    }, playerId)

    expect(after[playerId - 1]).toBe((before[playerId - 1] ?? 0) + 1)
    for (let padIndex = 0; padIndex < 4; padIndex++) {
      if (padIndex !== playerId - 1) {
        expect(after[padIndex]).toBe(before[padIndex])
      }
    }
  }
})
