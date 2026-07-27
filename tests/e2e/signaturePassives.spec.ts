import { expect, test } from '@playwright/test'

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?autostart=solo&level=1&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
}

test('les trois passifs signatures déclenchent leurs mécaniques dans une partie mobile', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'validation gameplay chromium uniquement')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await boot(page)
  const surcharge = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({
      weapons: [{ id: 'bonbonne_chantier', level: 1 }],
      passives: [{ id: 'surcharge_gaz', level: 5 }]
    })
    game.debugSpawnEnemies(40, 70)
    const directions = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 }
    ]
    let travelled = 0
    let previous = game.getState().players[0]
    for (let step = 0; step < 80; step++) {
      const move = directions[Math.floor(step / 10) % directions.length] ?? { x: 1, y: 0 }
      game.setInput(1, { move, attack: true })
      game.advanceTime(50)
      let state = game.getState()
      if (state.pendingLevelUp !== null) {
        game.chooseUpgrade(0)
        game.debugGrant({
          weapons: [{ id: 'bonbonne_chantier', level: 1 }],
          passives: [{ id: 'surcharge_gaz', level: 5 }]
        })
        state = game.getState()
      }
      const current = state.players[0]
      if (previous !== undefined && current !== undefined) {
        travelled += Math.hypot(current.x - previous.x, current.y - previous.y)
      }
      previous = current
    }
    const metrics = game.debugPassiveInfo().filter((metric) => metric.passive_id === 'surcharge_gaz')
    return { travelled, metrics }
  })
  expect(surcharge.travelled).toBeGreaterThan(300)
  expect(surcharge.metrics.some((metric) =>
    metric.modified_radius !== undefined && Math.abs(metric.modified_radius - 67.2) < 0.001
  )).toBe(true)
  expect(surcharge.metrics.some((metric) => (metric.secondary_explosions_created ?? 0) > 0)).toBe(true)

  await boot(page)
  const disque = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({
      weapons: [{ id: 'pied_de_biche', level: 1 }],
      passives: [{ id: 'disque_diamant', level: 5 }]
    })
    game.debugSpawnEnemies(24, 90)
    for (let step = 0; step < 40; step++) {
      const move = step % 20 < 10 ? { x: 1, y: 0 } : { x: 0, y: 1 }
      game.setInput(1, { move, attack: true })
      game.advanceTime(50)
      if (game.getState().pendingLevelUp !== null) {
        game.chooseUpgrade(0)
      }
    }
    return {
      metrics: game.debugPassiveInfo().filter((metric) => metric.passive_id === 'disque_diamant'),
      rendered: game.debugPassiveReimpactInfo?.() ?? null
    }
  })
  expect(disque.metrics.some((metric) =>
    metric.modified_radius !== undefined && Math.abs(metric.modified_radius - 170.4) < 0.001
  )).toBe(true)
  expect(disque.metrics.some((metric) => metric.knockback_applied === 345)).toBe(true)
  expect(disque.rendered?.weaponId).toBe('pied_de_biche')

  await boot(page)
  const compresseur = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({
      weapons: [{ id: 'marteau', level: 1 }],
      passives: [{ id: 'compresseur_pneumatique', level: 5 }]
    })
    game.debugSpawnEnemies(12, 100)
    for (let step = 0; step < 12; step++) {
      const move = step < 6 ? { x: -1, y: 0 } : { x: 0, y: -1 }
      game.setInput(1, { move, attack: true })
      game.advanceTime(50)
    }
    return game.debugPassiveInfo().filter((metric) => metric.passive_id === 'compresseur_pneumatique')
  })
  expect(compresseur.some((metric) =>
    metric.enemies_hit >= 3
    && metric.base_cooldown === 900
    && metric.modified_cooldown === 630
  )).toBe(true)
  expect(errors).toHaveLength(0)
})
