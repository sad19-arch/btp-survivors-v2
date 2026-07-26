import { expect, test } from '@playwright/test'

async function runMobileScenario(page: import('@playwright/test').Page, weaponId: string, level: number) {
  await page.goto('/?autostart=solo&level=1&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  return page.evaluate(({ weaponId: id, level: weaponLevel }) => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({ weapons: [{ id, level: weaponLevel }], passives: [] })
    game.debugSpawnEnemies(24, 220)

    const directions = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 }
    ]
    let previous = game.getState().players[0]
    let travelPx = 0
    let clearAtMs: number | null = null
    for (let step = 0; step < 120; step++) {
      const move = directions[Math.floor(step / 10) % directions.length] ?? { x: 1, y: 0 }
      game.setInput(1, { move, attack: true })
      game.advanceTime(100)
      let state = game.getState()
      if (state.pendingLevelUp !== null) {
        game.chooseUpgrade(0)
        game.debugGrant({ weapons: [{ id, level: weaponLevel }], passives: [] })
        state = game.getState()
      }
      const player = state.players[0]
      if (player !== undefined && previous !== undefined) {
        travelPx += Math.hypot(player.x - previous.x, player.y - previous.y)
      }
      previous = player
      if (clearAtMs === null && (player?.kills ?? 0) >= 25) {
        clearAtMs = state.elapsedMs
      }
    }
    const final = game.getState()
    return {
      travelPx,
      kills: final.players[0]?.kills ?? 0,
      clearAtMs,
      screen: final.screen
    }
  }, { weaponId, level })
}

test('Pied-de-biche frontal : progression N1/N8/évolution avec joueur mobile', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'validation gameplay chromium uniquement')

  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const results = [
    await runMobileScenario(page, 'pied_de_biche', 1),
    await runMobileScenario(page, 'pied_de_biche', 8),
    await runMobileScenario(page, 'barre_a_mine', 1)
  ]
  console.log(`PIED_DE_BICHE_MOBILE=${JSON.stringify(results)}`)

  for (const result of results) {
    expect(result.travelPx).toBeGreaterThan(1_000)
    expect(result.kills).toBeGreaterThan(0)
    expect(result.screen).not.toBe('gameover')
  }
  expect(results.every((result) => result.clearAtMs !== null)).toBe(true)
  expect(results[1]?.clearAtMs ?? Infinity).toBeLessThanOrEqual(results[0]?.clearAtMs ?? 0)
  expect(results[2]?.clearAtMs ?? Infinity).toBeLessThanOrEqual(results[1]?.clearAtMs ?? 0)
  expect(errors).toHaveLength(0)
})
