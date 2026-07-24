import { test, expect } from '@playwright/test'

test('un pad à index creux et les évolutions sans MP3 ne bloquent pas le restart', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      connected: true,
      id: 'Regression sparse Xbox pad',
      index: 1,
      mapping: 'standard',
      timestamp: 0,
      vibrationActuator: null
    }
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [null, pad]
    })
  })

  const relevantErrors: string[] = []
  const browserErrors: string[] = []
  const record = (message: string): void => {
    browserErrors.push(message)
    if (/removeAllListeners|Error decoding audio|Failed to process file|Unable to decode audio data/.test(message)) {
      relevantErrors.push(message)
    }
  }
  page.on('pageerror', (error) => record(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      record(message.text())
    }
  })

  await page.goto('/?autostart=solo&level=1&seed=42&test=1&lite=1')
  try {
    await page.waitForFunction(() => window.__GAME__?.ready === true, undefined, { timeout: 15_000 })
  } catch {
    throw new Error(`boot incomplet avec pad creux: ${browserErrors.join(' | ')}`)
  }
  const firstRunId = await page.evaluate(() => window.__GAME__?.getState().runId ?? -1)

  await page.evaluate(() => {
    const game = window.__GAME__
    game?.debugPlayWeaponSfx('tronconneuse_chantier')
    game?.debugPlayWeaponSfx('brise_roche')
    game?.debugPlayWeaponSfx('barre_a_mine')
    game?.restart()
  })

  await page.waitForFunction((previousRunId) => {
    const state = window.__GAME__?.getState()
    return state !== undefined && state.runId > previousRunId && state.screen === 'game'
  }, firstRunId)
  await expect.poll(async () => page.evaluate(() => window.__GAME__?.ready)).toBe(true)
  expect(relevantErrors).toEqual([])
})
