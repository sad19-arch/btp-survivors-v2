import { test, expect } from '@playwright/test'

/**
 * Tier-2 : on pilote le VRAI jeu (Phaser dans le navigateur) via le seam JSON,
 * pas par les pixels. Headless. Déterministe (seed + advanceTime).
 */

test('le seam pilote le joueur et avance le temps de façon déterministe', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=42&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const s0 = await page.evaluate(() => window.__GAME__?.getState())
  expect(s0?.scene).toBe('game')
  expect(s0?.players.length).toBe(1)
  const x0 = s0?.players[0]?.x ?? 0

  await page.evaluate(() => {
    window.__GAME__?.setInput(1, { move: { x: 1, y: 0 }, attack: false })
  })
  await page.evaluate(() => {
    window.__GAME__?.advanceTime(1000)
  })

  const s1 = await page.evaluate(() => window.__GAME__?.getState())
  expect(s1?.players[0]?.x ?? 0).toBeGreaterThan(x0)
  expect(s1?.elapsedMs ?? 0).toBeGreaterThan(0)
})

test('déterminisme: même seed + mêmes inputs ⇒ même état final', async ({ page }) => {
  const run = async (): Promise<unknown> => {
    await page.goto('/?autostart=solo&seed=7&test=1')
    await page.waitForFunction(() => window.__GAME__?.ready === true)
    await page.evaluate(() => {
      window.__GAME__?.setInput(1, { move: { x: 1, y: 0.5 }, attack: false })
    })
    await page.evaluate(() => {
      window.__GAME__?.advanceTime(2000)
    })
    return page.evaluate(() => window.__GAME__?.getState())
  }
  const a = await run()
  const b = await run()
  expect(a).toEqual(b)
})
