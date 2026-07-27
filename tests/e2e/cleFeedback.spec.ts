import { expect, test } from '@playwright/test'

for (const scenario of [
  { weaponId: 'cle_molette', level: 8 },
  { weaponId: 'cle_choc', level: 1 }
] as const) {
  test(`Clé : aller, inversion et retour visibles pour ${scenario.weaponId}`, async ({ page }) => {
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
      const testWindow = window as Window & {
        __wrenchTurns?: { weaponId: string; x: number; y: number }[]
      }
      testWindow.__wrenchTurns = []
      game.skipIntro()
      game.debugGrant({ weapons: [{ id: weaponId, level }], passives: [] })
      game.debugSpawnEnemies(1, 300)
      game.events.addEventListener('auraPulse', (event) => {
        const pulse = event as Event & {
          kind?: string
          weaponId?: string
          x?: number
          y?: number
        }
        if (
          pulse.kind === 'boomerang_turn'
          && pulse.weaponId !== undefined
          && pulse.x !== undefined
          && pulse.y !== undefined
        ) {
          testWindow.__wrenchTurns?.push({
            weaponId: pulse.weaponId,
            x: pulse.x,
            y: pulse.y
          })
        }
      })
    }, scenario)

    let travelPx = 0
    let previous = await page.evaluate(() => window.__GAME__?.getState().players[0] ?? null)
    for (let step = 0; step < 60; step++) {
      const current = await page.evaluate(({ currentStep, weaponId, level }) => {
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
    }

    const turns = await page.evaluate(() => {
      const testWindow = window as Window & {
        __wrenchTurns?: { weaponId: string; x: number; y: number }[]
      }
      return testWindow.__wrenchTurns ?? []
    })
    const renderInfo = await page.evaluate(() => window.__GAME__?.debugWrenchInfo?.() ?? null)
    const lastTurn = turns.at(-1)

    expect(travelPx).toBeGreaterThan(500)
    expect(turns.length).toBeGreaterThan(0)
    expect(turns.every((turn) => turn.weaponId === scenario.weaponId)).toBe(true)
    expect(renderInfo).not.toBeNull()
    expect(renderInfo?.turnWeaponId).toBe(scenario.weaponId)
    expect(renderInfo?.turnX).toBeCloseTo(lastTurn?.x ?? Number.NaN, 5)
    expect(renderInfo?.turnY).toBeCloseTo(lastTurn?.y ?? Number.NaN, 5)
    expect(renderInfo?.maxOutboundTrailCount).toBeGreaterThan(0)
    expect(renderInfo?.maxReturnTrailCount).toBeGreaterThan(0)
  })
}
