import { expect, test } from '@playwright/test'

test('Cloueur : trajectoire et impact spécialisés avec joueur mobile', async ({ page }) => {
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
    const testWindow = window as Window & { __cloueurImpactWeapons?: string[] }
    testWindow.__cloueurImpactWeapons = []
    game.skipIntro()
    game.debugGrant({ weapons: [{ id: 'cloueur', level: 1 }], passives: [] })
    game.debugSpawnEnemies(30, 260)

    game.events.addEventListener('auraPulse', (event) => {
      const pulse = event as Event & {
        kind?: string
        weaponId?: string
      }
      if (pulse.kind === 'projectile_hit') {
        testWindow.__cloueurImpactWeapons?.push(pulse.weaponId ?? '')
      }
    })
  })

  let travelPx = 0
  let previous = await page.evaluate(() => window.__GAME__?.getState().players[0] ?? null)
  for (let step = 0; step < 50; step++) {
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
        game.debugGrant({ weapons: [{ id: 'cloueur', level: 1 }], passives: [] })
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

  await expect.poll(async () => page.evaluate(() => window.__GAME__?.debugNailInfo?.() ?? null))
    .not.toBeNull()
  const renderInfo = await page.evaluate(() => window.__GAME__?.debugNailInfo?.() ?? null)
  const impactWeapons = await page.evaluate(() => {
    const testWindow = window as Window & { __cloueurImpactWeapons?: string[] }
    return testWindow.__cloueurImpactWeapons ?? []
  })

  expect(travelPx).toBeGreaterThan(500)
  expect(impactWeapons.length).toBeGreaterThan(0)
  expect(impactWeapons.every((weaponId) => weaponId === 'cloueur')).toBe(true)
  expect(renderInfo?.impactWeaponId).toBe('cloueur')
  expect(renderInfo?.maxTrailCount).toBeGreaterThan(0)
})
