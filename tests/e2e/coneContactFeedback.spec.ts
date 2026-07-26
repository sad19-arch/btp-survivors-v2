import { expect, test } from '@playwright/test'

for (const scenario of [
  { weaponId: 'extincteur', expectedMark: 'foam' },
  { weaponId: 'chalumeau', expectedMark: 'thermal' }
] as const) {
  test(`${scenario.weaponId} : contacts spécialisés visibles avec joueur mobile`, async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'validation Chromium uniquement')

    await page.addInitScript(() => {
      localStorage.setItem('btp:fullscreen_settings_v1', JSON.stringify({ preference: 'windowed' }))
    })
    await page.goto('/?autostart=solo&level=1&seed=42&test=1&lite=1')
    await page.waitForFunction(() => window.__GAME__?.ready === true)

    await page.evaluate((weaponId) => {
      const game = window.__GAME__
      if (game === undefined) {
        throw new Error('Seam __GAME__ absent')
      }
      const testWindow = window as Window & { __coneContacts?: string[] }
      testWindow.__coneContacts = []
      game.skipIntro()
      game.debugGrant({ weapons: [{ id: weaponId, level: 8 }], passives: [] })
      game.debugSpawnEnemies(36, 150)
      game.events.addEventListener('auraPulse', (event) => {
        const pulse = event as Event & { kind?: string; weaponId?: string }
        if (pulse.kind === 'cone_hit') {
          testWindow.__coneContacts?.push(pulse.weaponId ?? '')
        }
      })
    }, scenario.weaponId)

    let travelPx = 0
    let previous = await page.evaluate(() => window.__GAME__?.getState().players[0] ?? null)
    for (let step = 0; step < 50; step++) {
      const current = await page.evaluate(({ currentStep, weaponId }) => {
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
        game.advanceTime(100)
        if (game.getState().pendingLevelUp !== null) {
          game.chooseUpgrade(0)
          game.debugGrant({ weapons: [{ id: weaponId, level: 8 }], passives: [] })
        }
        return game.getState().players[0] ?? null
      }, { currentStep: step, weaponId: scenario.weaponId })
      if (current !== null && previous !== null) {
        travelPx += Math.hypot(current.x - previous.x, current.y - previous.y)
      }
      previous = current
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      }))
    }

    const contacts = await page.evaluate(() => {
      const testWindow = window as Window & { __coneContacts?: string[] }
      return testWindow.__coneContacts ?? []
    })
    const renderInfo = await page.evaluate(() => window.__GAME__?.debugConeContactInfo?.() ?? null)

    expect(travelPx).toBeGreaterThan(500)
    expect(contacts.length).toBeGreaterThan(0)
    expect(contacts.every((weaponId) => weaponId === scenario.weaponId)).toBe(true)
    expect(renderInfo).toEqual(expect.objectContaining({
      weaponId: scenario.weaponId,
      mark: scenario.expectedMark
    }))
  })
}
