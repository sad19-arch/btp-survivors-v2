import { expect, test } from '@playwright/test'

for (const scenario of [
  { weaponId: 'brouette', level: 1, projectileType: 'brouette', radius: 26, scale: 0.62 },
  { weaponId: 'brouette', level: 8, projectileType: 'brouette', radius: 40, scale: 0.7116 },
  { weaponId: 'transpalette', level: 1, projectileType: 'transpalette', radius: 40, scale: 0.82 }
] as const) {
  test(`échelle Brouette : ${scenario.weaponId} niveau ${scenario.level}`, async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'validation Chromium uniquement')

    await page.addInitScript(() => {
      localStorage.setItem('btp:fullscreen_settings_v1', JSON.stringify({ preference: 'windowed' }))
    })
    await page.goto('/?autostart=solo&level=1&seed=42&test=1&lite=1')
    await page.waitForFunction(() => window.__GAME__?.ready === true)
    await page.evaluate(({ weaponId, level }) => {
      const game = window.__GAME__
      if (game === undefined) {
        throw new Error('Seam __GAME__ absent')
      }
      game.skipIntro()
      game.debugGrant({ weapons: [{ id: weaponId, level }], passives: [] })
      game.debugSpawnEnemies(30, 260)
    }, scenario)

    let travelPx = 0
    let observed: { type: string; radius: number | undefined; scale: number } | null = null
    let previous = await page.evaluate(() => window.__GAME__?.getState().players[0] ?? null)
    for (let step = 0; step < 50; step++) {
      const current = await page.evaluate(({ currentStep, weaponId, level }) => {
        const game = window.__GAME__
        if (game === undefined) {
          return null
        }
        game.setInput(1, {
          move: {
            x: currentStep % 18 < 9 ? 1 : -1,
            y: currentStep % 14 < 7 ? 1 : -1
          },
          attack: true
        })
        game.advanceTime(80)
        if (game.getState().pendingLevelUp !== null) {
          game.chooseUpgrade(0)
          game.debugGrant({ weapons: [{ id: weaponId, level }], passives: [] })
        }
        return game.getState().players[0] ?? null
      }, { currentStep: step, weaponId: scenario.weaponId, level: scenario.level })
      if (current !== null && previous !== null) {
        travelPx += Math.hypot(current.x - previous.x, current.y - previous.y)
      }
      previous = current
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      }))
      const info = await page.evaluate(() => window.__GAME__?.debugBrouetteInfo?.() ?? [])
      observed ??= info.find((entry) => entry.type === scenario.projectileType) ?? null
    }

    expect(travelPx).toBeGreaterThan(400)
    expect(observed).not.toBeNull()
    expect(observed?.radius).toBe(scenario.radius)
    expect(observed?.scale).toBeCloseTo(scenario.scale, 3)
  })
}
