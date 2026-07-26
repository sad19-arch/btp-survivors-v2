import { expect, test } from '@playwright/test'

test('Court-circuit part visuellement de son propriétaire réel en coop', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'validation coop Chromium uniquement')

  await page.addInitScript(() => {
    localStorage.setItem('btp:fullscreen_settings_v1', JSON.stringify({ preference: 'windowed' }))
  })
  await page.goto('/?autostart=coop&level=1&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const result = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.skipIntro()
    game.debugGrant({ weapons: [], passives: [] }, 1)
    game.debugGrant({ weapons: [{ id: 'court_circuit', level: 1 }], passives: [] }, 2)
    game.debugSpawnEnemies(18, 180)

    const owners: Array<number | undefined> = []
    const sourceDeltas: number[] = []
    const eventSources: { x: number; y: number }[] = []
    let lastSequence = 0
    game.events.addEventListener('auraPulse', (event) => {
      const pulse = event as Event & {
        kind?: string
        ownerId?: number
        sourceX?: number
        sourceY?: number
      }
      if (pulse.kind === 'strike') {
        owners.push(pulse.ownerId)
        if (pulse.sourceX !== undefined && pulse.sourceY !== undefined) {
          eventSources.push({ x: pulse.sourceX, y: pulse.sourceY })
        }
      }
    })

    for (let step = 0; step < 40; step++) {
      game.setInput(1, { move: { x: step % 20 < 10 ? 1 : -1, y: 0 }, attack: true })
      game.setInput(2, { move: { x: 0, y: step % 20 < 10 ? 1 : -1 }, attack: true })
      game.advanceTime(100)
      const strike = game.debugStrikeInfo?.()
      if (strike !== undefined && strike !== null && strike.sequence !== lastSequence) {
        const lastEventSource = eventSources[eventSources.length - 1]
        if (lastEventSource !== undefined) {
          sourceDeltas.push(Math.hypot(
            strike.fromX - lastEventSource.x,
            strike.fromY - lastEventSource.y
          ))
        }
        lastSequence = strike.sequence
      }
      if (game.getState().pendingLevelUp !== null) {
        game.chooseUpgrade(0)
        game.debugGrant({ weapons: [], passives: [] }, 1)
        game.debugGrant({ weapons: [{ id: 'court_circuit', level: 1 }], passives: [] }, 2)
      }
    }

    return {
      owners,
      sourceDeltas,
      strike: game.debugStrikeInfo?.() ?? null,
    }
  })

  console.log(`COURT_CIRCUIT_OWNER=${JSON.stringify(result)}`)
  expect(result.owners.length).toBeGreaterThan(0)
  expect(result.owners.every((owner) => owner === 2)).toBe(true)
  expect(result.strike?.ownerId).toBe(2)
  expect(result.sourceDeltas.length).toBeGreaterThan(0)
  expect(Math.max(...result.sourceDeltas)).toBeLessThan(0.001)
})
