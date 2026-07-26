import { expect, test } from '@playwright/test'
import { EVOLUTIONS } from '@content/evolutions'
import { WEAPONS } from '@content/weapons'

const AUDIT_SCENARIOS = EVOLUTIONS.flatMap((evolution) => {
  const base = WEAPONS[evolution.base]
  if (base === undefined) {
    throw new Error(`Arme d'audit absente : ${evolution.base}`)
  }
  return [
    { label: `${base.id}:N1`, weaponId: base.id, level: 1 },
    { label: `${base.id}:N8`, weaponId: base.id, level: base.maxLevel },
    { label: `${base.id}:EVO`, weaponId: evolution.evolved, level: 1 }
  ]
})

if (AUDIT_SCENARIOS.length !== 36) {
  throw new Error(`La matrice d'audit doit contenir 36 scénarios, reçu ${AUDIT_SCENARIOS.length}`)
}

for (const scenario of AUDIT_SCENARIOS) {
  test(`matrice audit armes — ${scenario.label}`, async ({ page }) => {
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
      game.debugSpawnEnemies(24, 220)
    }, scenario)

    let travelPx = 0
    let previous = await page.evaluate(() => window.__GAME__?.getState().players[0] ?? null)
    for (let step = 0; step < 40; step++) {
      const current = await page.evaluate(({ currentStep, weaponId, level }) => {
        const game = window.__GAME__
        if (game === undefined) {
          return null
        }
        const directions = [
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
          { x: -1, y: 1 },
          { x: -1, y: 0 },
          { x: -1, y: -1 },
          { x: 0, y: -1 },
          { x: 1, y: -1 }
        ]
        game.setInput(1, {
          move: directions[Math.floor(currentStep / 5) % directions.length] ?? { x: 1, y: 0 },
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

    const state = await page.evaluate(() => window.__GAME__?.getState() ?? null)
    const player = state?.players[0]
    const damageObserved = (player?.kills ?? 0) > 0
      || (state?.enemies.some((enemy) => enemy.hp < enemy.maxHp) ?? false)

    expect(travelPx).toBeGreaterThan(300)
    expect(state?.screen).toBe('game')
    expect(player?.weapons).toContain(scenario.weaponId)
    expect(damageObserved).toBe(true)
  })
}
