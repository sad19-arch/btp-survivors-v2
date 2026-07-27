import { expect, test } from '@playwright/test'

test('Marteau : l’anneau immédiat utilise exactement le rayon de dégâts', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'validation Chromium uniquement')

  await page.addInitScript(() => {
    localStorage.setItem('btp:fullscreen_settings_v1', JSON.stringify({ preference: 'windowed' }))
  })
  await page.goto('/?autostart=solo&level=1&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const result = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.skipIntro()
    game.debugGrant({ weapons: [{ id: 'marteau', level: 1 }], passives: [] })
    game.debugSpawnEnemies(18, 170)

    const pulseRadii: number[] = []
    game.events.addEventListener('auraPulse', (event) => {
      const pulse = event as Event & { kind?: string; radius?: number }
      if (pulse.kind === 'aura' && pulse.radius !== undefined) {
        pulseRadii.push(pulse.radius)
      }
    })

    let travelPx = 0
    let previous = game.getState().players[0]
    for (let step = 0; step < 30; step++) {
      game.setInput(1, {
        move: { x: step % 20 < 10 ? 1 : -1, y: step % 12 < 6 ? 1 : -1 },
        attack: true
      })
      game.advanceTime(100)
      const current = game.getState().players[0]
      if (current !== undefined && previous !== undefined) {
        travelPx += Math.hypot(current.x - previous.x, current.y - previous.y)
      }
      previous = current
      if (game.getState().pendingLevelUp !== null) {
        game.chooseUpgrade(0)
        game.debugGrant({ weapons: [{ id: 'marteau', level: 1 }], passives: [] })
      }
    }

    return {
      travelPx,
      pulseRadii,
      ring: game.debugHammerInfo?.() ?? null
    }
  })

  expect(result.travelPx).toBeGreaterThan(300)
  expect(result.pulseRadii.length).toBeGreaterThan(0)
  expect(result.ring).not.toBeNull()
  expect(result.ring?.renderedRadius).toBe(result.ring?.simulationRadius)
  expect(result.ring?.renderedRadius).toBe(result.pulseRadii.at(-1))
})
