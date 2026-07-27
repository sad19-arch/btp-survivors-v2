import { expect, test } from '@playwright/test'

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?autostart=solo&level=1&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'validation gameplay chromium uniquement')
  await boot(page)
})

test('Air comprimé : vitesse et portée réelles avec joueur mobile', async ({ page }) => {
  const result = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({
      weapons: [{ id: 'bonbonne_chantier', level: 1 }],
      passives: [{ id: 'air_comprime', level: 5 }]
    })
    const before = game.getState().players[0]
    game.setInput(1, { move: { x: 1, y: 0 }, attack: true })
    game.advanceTime(20)
    const after = game.getState().players[0]
    return {
      moved: before !== undefined && after !== undefined ? after.x - before.x : 0,
      debug: game.debugUtilityPassiveInfo()[0]
    }
  })
  expect(result.moved).toBeGreaterThan(0)
  expect(result.debug?.max_projectile_speed).toBeCloseTo(570)
  expect(result.debug?.max_projectile_life_ms).toBeGreaterThan(1600)
})

test('Casque homologué : recul borné et onde réellement rendue', async ({ page }) => {
  const result = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({
      weapons: [{ id: 'cloueur', level: 1 }],
      passives: [{ id: 'casque_homologue', level: 5 }]
    })
    game.debugSpawnEnemies(8, 20)
    const before = game.getState().players[0]
    game.setInput(1, { move: { x: 0, y: 1 }, attack: true })
    game.advanceTime(20)
    const after = game.getState().players[0]
    return {
      moved: before !== undefined && after !== undefined ? after.y - before.y : 0,
      debug: game.debugUtilityPassiveInfo()[0],
      rendered: game.debugHelmetRepulseCount?.() ?? 0
    }
  })
  expect(result.moved).toBeGreaterThan(0)
  expect(result.debug?.casque_repulse_cooldown_ms).toBe(600)
  expect(result.debug?.max_enemy_knockback_speed).toBeGreaterThan(0)
  expect(result.rendered).toBeGreaterThan(0)
})

test('Chaussures de sécurité : balayage mobile renforcé', async ({ page }) => {
  const result = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({
      weapons: [{ id: 'pied_de_biche', level: 1 }],
      passives: [{ id: 'chaussures_securite', level: 5 }]
    })
    game.debugSpawnEnemies(12, 80)
    const before = game.getState().players[0]
    game.setInput(1, { move: { x: 1, y: 0 }, attack: true })
    game.advanceTime(20)
    const after = game.getState().players[0]
    return {
      moved: before !== undefined && after !== undefined ? after.x - before.x : 0,
      debug: game.debugUtilityPassiveInfo()[0]
    }
  })
  expect(result.moved).toBeGreaterThan(0)
  expect(result.debug?.max_enemy_knockback_speed).toBeGreaterThan(300)
})

test('Aimant de chantier : multiplicateur dérivé hors boucle chaude', async ({ page }) => {
  const result = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({
      weapons: [{ id: 'cloueur', level: 1 }],
      passives: [{ id: 'aimant_chantier', level: 5 }]
    })
    const before = game.getState().players[0]
    game.setInput(1, { move: { x: -1, y: 0 }, attack: true })
    game.advanceTime(20)
    const after = game.getState().players[0]
    return {
      moved: before !== undefined && after !== undefined ? before.x - after.x : 0,
      debug: game.debugUtilityPassiveInfo()[0]
    }
  })
  expect(result.moved).toBeGreaterThan(0)
  expect(result.debug?.magnet_pull_scale).toBe(1.25)
})

test('Batterie 18V : zones et ralentissements prolongés', async ({ page }) => {
  const result = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({
      weapons: [{ id: 'extincteur', level: 1 }, { id: 'goudron', level: 1 }],
      passives: [{ id: 'batterie_18v', level: 5 }]
    })
    game.debugSpawnEnemies(12, 100)
    const before = game.getState().players[0]
    game.setInput(1, { move: { x: 0, y: -1 }, attack: true })
    game.advanceTime(20)
    const after = game.getState().players[0]
    return {
      moved: before !== undefined && after !== undefined ? before.y - after.y : 0,
      debug: game.debugUtilityPassiveInfo()[0]
    }
  })
  expect(result.moved).toBeGreaterThan(0)
  expect(result.debug?.max_slow_remaining_ms).toBeGreaterThan(700)
  expect(result.debug?.max_hazard_life_ms).toBeGreaterThan(3000)
})

test('Prime de rendement : vraie chaîne puis bonus temporaire', async ({ page }) => {
  const result = await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      throw new Error('Seam __GAME__ absent')
    }
    game.debugGrant({
      weapons: [{ id: 'brise_roche', level: 1 }],
      passives: [{ id: 'prime_rendement', level: 5 }]
    })
    game.debugSpawnEnemies(12, 100)
    const before = game.getState().players[0]
    game.setInput(1, { move: { x: 1, y: 0 }, attack: true })
    game.advanceTime(20)
    const after = game.getState().players[0]
    return {
      moved: before !== undefined && after !== undefined ? after.x - before.x : 0,
      kills: after?.kills ?? 0,
      debug: game.debugUtilityPassiveInfo()[0]
    }
  })
  expect(result.moved).toBeGreaterThan(0)
  expect(result.kills).toBeGreaterThanOrEqual(10)
  expect(result.debug?.rendement_boost_ms).toBe(5000)
})
