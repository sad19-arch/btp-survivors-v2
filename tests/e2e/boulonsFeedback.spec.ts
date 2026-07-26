import { expect, test } from '@playwright/test'

test('Boulons : trajectoires et rebonds visibles avec joueur mobile', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'validation Chromium uniquement')

  await page.addInitScript(() => {
    localStorage.setItem('btp:fullscreen_settings_v1', JSON.stringify({ preference: 'windowed' }))
  })
  await page.goto('/?autostart=solo&level=1&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    const testWindow = window as Window & { __boltRicochets?: string[] }
    testWindow.__boltRicochets = []
    game.skipIntro()
    game.debugGrant({ weapons: [{ id: 'boulons', level: 8 }], passives: [] })
    game.debugSpawnEnemies(36, 190)
    game.events.addEventListener('auraPulse', (event) => {
      const pulse = event as Event & { kind?: string; weaponId?: string }
      if (pulse.kind === 'ricochet_hit') {
        testWindow.__boltRicochets?.push(pulse.weaponId ?? '')
      }
    })
  })

  let travelPx = 0
  let previous = await page.evaluate(() => window.__GAME__?.getState().players[0] ?? null)
  for (let step = 0; step < 60; step++) {
    const current = await page.evaluate((currentStep) => {
      const game = window.__GAME__
      if (game === undefined) {
        return null
      }
      game.setInput(1, {
        move: {
          x: currentStep % 20 < 10 ? 1 : -1,
          y: currentStep % 16 < 8 ? 1 : -1
        },
        attack: true
      })
      game.advanceTime(100)
      if (game.getState().pendingLevelUp !== null) {
        game.chooseUpgrade(0)
        game.debugGrant({ weapons: [{ id: 'boulons', level: 8 }], passives: [] })
      }
      return game.getState().players[0] ?? null
    }, step)
    if (current !== null && previous !== null) {
      travelPx += Math.hypot(current.x - previous.x, current.y - previous.y)
    }
    previous = current
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    }))
  }

  const ricochets = await page.evaluate(() => {
    const testWindow = window as Window & { __boltRicochets?: string[] }
    return testWindow.__boltRicochets ?? []
  })
  const renderInfo = await page.evaluate(() => window.__GAME__?.debugBoltInfo?.() ?? null)

  expect(travelPx).toBeGreaterThan(700)
  expect(ricochets.length).toBeGreaterThan(0)
  expect(ricochets.every((weaponId) => weaponId === 'boulons')).toBe(true)
  expect(renderInfo?.impactWeaponId).toBe('boulons')
  expect(renderInfo?.maxTrailCount).toBeGreaterThan(0)
})
