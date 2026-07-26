import { expect, test } from '@playwright/test'

test('Scie : le feedback spécialisé naît sur les contacts réels avec joueur mobile', async ({ page }) => {
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
    game.debugGrant({ weapons: [{ id: 'scie', level: 1 }], passives: [] })
    game.debugSpawnEnemies(30, 104)

    const contacts: { x: number; y: number; ownerId?: number }[] = []
    game.events.addEventListener('auraPulse', (event) => {
      const pulse = event as Event & {
        kind?: string
        x?: number
        y?: number
        ownerId?: number
      }
      if (pulse.kind === 'orbital_hit' && pulse.x !== undefined && pulse.y !== undefined) {
        contacts.push({
          x: pulse.x,
          y: pulse.y,
          ...(pulse.ownerId === undefined ? {} : { ownerId: pulse.ownerId })
        })
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
        game.debugGrant({ weapons: [{ id: 'scie', level: 1 }], passives: [] })
      }
    }

    return {
      travelPx,
      contacts,
      saw: game.debugSawInfo?.() ?? null
    }
  })

  expect(result.travelPx).toBeGreaterThan(300)
  expect(result.contacts.length).toBeGreaterThan(0)
  expect(result.contacts.every((contact) => contact.ownerId === 1)).toBe(true)
  expect(result.saw).not.toBeNull()
  expect(result.saw?.weaponId).toBe('scie')
  const matchingContact = result.contacts.some((contact) =>
    contact.x === result.saw?.x && contact.y === result.saw?.y
  )
  expect(matchingContact).toBe(true)
})
