import { expect, test } from '@playwright/test'

async function boot(page: import('@playwright/test').Page, autostart = true): Promise<void> {
  const query = autostart ? 'autostart=solo&seed=42&test=1&lite=1' : 'seed=42&test=1&lite=1'
  await page.goto(`/?${query}`)
  await page.waitForFunction(() => window.__GAME__?.ready === true)
}

async function movePlayer(page: import('@playwright/test').Page): Promise<void> {
  const before = await page.evaluate(() => window.__GAME__?.getState().players[0]?.x ?? 0)
  await page.evaluate(() => {
    window.__GAME__?.setInput(1, { move: { x: 1, y: 0 }, attack: true })
    window.__GAME__?.advanceTime(320)
  })
  const after = await page.evaluate(() => window.__GAME__?.getState().players[0]?.x ?? 0)
  expect(after).toBeGreaterThan(before)
}

async function selectCharacter(
  page: import('@playwright/test').Page,
  characterId: string
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const current = await page.evaluate(
      () => window.__GAME__?.getState().characterSelect?.players[0]?.charId
    )
    if (current === characterId) {
      return
    }
    await page.evaluate(() => window.__GAME__?.nav('right'))
  }
  throw new Error(`Personnage ${characterId} introuvable après un tour du roster.`)
}

test('sauvegarde neuve : Charpentier visible, verrouillé et impossible à valider', async ({ page }) => {
  await boot(page, false)
  await page.evaluate(() => window.__GAME__?.confirm())
  await selectCharacter(page, 'charpentier')
  const selected = await page.evaluate(() => window.__GAME__?.getState().characterSelect?.players[0])
  expect(selected).toMatchObject({ charId: 'charpentier', unlocked: false, ready: false })
  await expect(page.locator('.charsel-card__name')).toContainText('CHARPENTIER')
  await expect(page.locator('.charsel-card--locked')).toBeVisible()
  expect(selected?.lockHint).toContain('évoluer le Cloueur')
  await page.evaluate(() => window.__GAME__?.confirm())
  expect(await page.evaluate(() => window.__GAME__?.getState().screen)).toBe('characterSelect')
})

test('évolution réelle : célébration, persistance et badge Nouveau jusqu’au premier usage', async ({ page }) => {
  await boot(page)
  await movePlayer(page)
  await page.evaluate(() => {
    const game = window.__GAME__
    game?.debugGrant({
      weapons: [{ id: 'cloueur', level: 8 }],
      passives: [{ id: 'air_comprime', level: 1 }]
    })
    game?.debugSpawnChestOnPlayer()
    game?.advanceTime(200)
  })
  expect(
    await page.evaluate(() => window.__GAME__?.getState().unlockProgress.unlockedContentIds)
  ).toContain('charpentier')

  await page.evaluate(() => {
    const game = window.__GAME__
    game?.confirm()
    game?.advanceTime(120)
    game?.debugKillPlayer()
    game?.advanceTime(32)
  })
  await expect(page.locator('.report-unlock--complete')).toBeVisible()
  await expect(page.locator('.report-unlock__title')).toContainText('NOUVEAU DÉBLOCAGE')
  await expect(page.locator('.report-unlock__reward')).toContainText('Charpentier')

  await boot(page, false)
  await page.evaluate(() => window.__GAME__?.confirm())
  await selectCharacter(page, 'charpentier')
  await expect(page.locator('.charsel-card .content-new-badge')).toContainText('NOUVEAU')
  await page.evaluate(() => window.__GAME__?.confirm())
  expect(await page.evaluate(() => window.__GAME__?.getState().screen)).toBe('game')
  expect(
    await page.evaluate(() => window.__GAME__?.getState().unlockProgress.newContentIds)
  ).not.toContain('charpentier')
  await movePlayer(page)
})

test('Bonbonne débloquée : offre unique dans les premières cartes et badge retiré à l’usage', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('btp:unlocks_v1', JSON.stringify({
      version: 1,
      unlockedContentIds: ['bonbonne_chantier'],
      seenUnlockIds: ['unlock_bonbonne'],
      triedContentIds: [],
      cumulativeProgress: { combo_reached: 500 },
      trialWeaponId: 'bonbonne_chantier'
    }))
  })
  await boot(page)
  await movePlayer(page)
  await page.evaluate(() => {
    window.__GAME__?.debugAddXp(10_000)
    window.__GAME__?.advanceTime(32)
  })
  const choices = await page.evaluate(() => window.__GAME__?.getState().pendingLevelUp?.choices ?? [])
  const bonbonneIndex = choices.findIndex((choice) => choice.id === 'bonbonne_chantier')
  expect(bonbonneIndex).toBeGreaterThanOrEqual(0)
  await expect(page.locator('.card__new')).toContainText('NOUVEAU')
  await page.evaluate((index) => window.__GAME__?.chooseUpgrade(index), bonbonneIndex)
  const state = await page.evaluate(() => window.__GAME__?.getState())
  expect(state?.players[0]?.weapons).toContain('bonbonne_chantier')
  expect(state?.unlockProgress.newContentIds).not.toContain('bonbonne_chantier')
})

test('prisonniers : 2 avant défaite puis 3 à la run suivante débloquent l’Ouvrière', async ({ page }) => {
  await boot(page)
  await movePlayer(page)
  await page.evaluate(() => {
    window.__GAME__?.debugEnragePrisoner()
    window.__GAME__?.debugEnragePrisoner()
    window.__GAME__?.debugKillPlayer()
    window.__GAME__?.advanceTime(32)
  })
  await expect(page.locator('.report-unlock__progress')).toContainText('2/5')

  await boot(page)
  await movePlayer(page)
  await page.evaluate(() => {
    window.__GAME__?.debugEnragePrisoner()
    window.__GAME__?.debugEnragePrisoner()
    window.__GAME__?.debugEnragePrisoner()
  })
  const progress = await page.evaluate(() => window.__GAME__?.getState().unlockProgress)
  expect(progress?.unlockedContentIds).toContain('ouvriere')
  expect(progress?.newContentIds).toContain('ouvriere')
})
