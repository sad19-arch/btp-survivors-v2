import { test, expect } from '@playwright/test'

/**
 * Cartes de level-up en co-op : l'écran doit dire À QUI appartient le choix, et
 * seul ce joueur doit pouvoir valider.
 *
 * Le core connaissait déjà le propriétaire (`pendingLevelUp.playerId`) et
 * appliquait bien la carte au bon joueur — mais l'UI ne l'affichait nulle part et
 * `routeInput` agrégeait les manettes : n'importe qui pouvait choisir à la place
 * d'un autre. Ces tests verrouillent les deux comportements.
 */

async function bootCoop(page: import('@playwright/test').Page) {
  await page.goto('/?autostart=coop&seed=11&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
}

/** Force un level-up sur J2 et attend l'écran d'upgrade. */
async function levelUpPlayer2(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    window.__GAME__?.debugAddXp(1000, 2)
    window.__GAME__?.advanceTime(100)
    const s = window.__GAME__?.getState()
    return { screen: s?.screen, owner: s?.pendingLevelUp?.playerId, menuOwner: s?.menu?.playerId }
  })
}

test('l’écran de cartes affiche le joueur à qui appartient le choix', async ({ page }) => {
  await bootCoop(page)
  const st = await levelUpPlayer2(page)

  expect(st.screen).toBe('upgrade')
  expect(st.owner).toBe(2)
  // L'identité traverse bien jusqu'à la couche menu (c'est ce que lit l'overlay).
  expect(st.menuOwner).toBe(2)

  // Et elle est VISIBLE à l'écran, pas seulement dans l'état.
  const who = page.locator('.upgrade__who')
  await expect(who).toBeVisible()
  await expect(who).toHaveText('J2 CHOISIT')
})

test('le verrou : un joueur NON concerné ne peut pas choisir la carte d’un autre', async ({ page }) => {
  await bootCoop(page)
  await levelUpPlayer2(page)

  // Oracle = somme des niveaux de l'inventaire de J2 (ARMES **et** PASSIFS : une
  // carte tirée peut être l'un ou l'autre). L'écran ne suffit pas — debugAddXp
  // accorde plusieurs paliers, donc la FILE enchaîne et l'écran reste 'upgrade'.
  const inventorySize = () =>
    page.evaluate(() => {
      const inv = window.__GAME__?.getState().players.find((x) => x.id === 2)?.inventory
      const sum = (es: { level: number }[] | undefined) => (es ?? []).reduce((a, e) => a + e.level, 0)
      return sum(inv?.weapons) + sum(inv?.passives)
    })
  const before = await inventorySize()

  // J1 tente de valider alors que la carte est à J2 → doit être ignoré.
  const afterIntruder = await page.evaluate(() => {
    window.__GAME__?.debugConfirmAs(1)
    window.__GAME__?.advanceTime(100)
    const s = window.__GAME__?.getState()
    return { screen: s?.screen, owner: s?.pendingLevelUp?.playerId }
  })
  expect(afterIntruder.screen).toBe('upgrade')
  expect(afterIntruder.owner).toBe(2)
  expect(await inventorySize()).toBe(before) // rien n'a été consommé

  // J2, lui, valide : la carte part bien dans SON inventaire.
  await page.evaluate(() => {
    window.__GAME__?.debugConfirmAs(2)
    window.__GAME__?.advanceTime(100)
  })
  expect(await inventorySize()).toBeGreaterThan(before)
})

test('solo : aucun tag de propriétaire (pas d’ambiguïté à lever)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=11&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const screen = await page.evaluate(() => {
    window.__GAME__?.debugAddXp(1000)
    window.__GAME__?.advanceTime(100)
    return window.__GAME__?.getState().screen
  })
  expect(screen).toBe('upgrade')
  await expect(page.locator('.cards .card').first()).toBeVisible()
  await expect(page.locator('.upgrade__who')).toHaveCount(0)
})
