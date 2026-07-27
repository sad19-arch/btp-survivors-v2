import { expect, test } from '@playwright/test'

async function runBonbonneScenario(
  page: import('@playwright/test').Page,
  weaponId: 'bonbonne_chantier' | 'detonation_chaine',
  level: number
) {
  await page.goto('/?autostart=solo&level=1&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  return page.evaluate(({ id, weaponLevel }) => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({ weapons: [{ id, level: weaponLevel }], passives: [] })
    game.debugSpawnEnemies(36, 220)

    const directions = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 }
    ]
    let previous = game.getState().players[0]
    let travelPx = 0
    for (let step = 0; step < 120; step++) {
      const move = directions[Math.floor(step / 12) % directions.length] ?? { x: 1, y: 0 }
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
    }
    const final = game.getState()
    return {
      travelPx,
      kills: final.players[0]?.kills ?? 0,
      remainingEnemies: final.enemies.length,
      screen: final.screen
    }
  }, { id: weaponId, weaponLevel: level })
}

test('Bonbonne : explosions N1/N8 et cascade avec joueur mobile', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'validation gameplay chromium uniquement')

  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const level1 = await runBonbonneScenario(page, 'bonbonne_chantier', 1)
  const level8 = await runBonbonneScenario(page, 'bonbonne_chantier', 8)
  const evolved = await runBonbonneScenario(page, 'detonation_chaine', 1)
  console.log(`BONBONNE_MOBILE=${JSON.stringify({ level1, level8, evolved })}`)

  for (const result of [level1, level8, evolved]) {
    expect(result.travelPx).toBeGreaterThan(1_000)
    expect(result.kills).toBeGreaterThan(0)
    expect(result.screen).not.toBe('gameover')
  }
  expect(level8.kills).toBeGreaterThanOrEqual(level1.kills)
  expect(evolved.kills).toBeGreaterThanOrEqual(level8.kills)
  expect(errors).toHaveLength(0)
})
