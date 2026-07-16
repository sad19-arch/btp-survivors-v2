import { test, expect } from '@playwright/test'

/**
 * MODE CARNAGE — le secret Konami.
 *
 * Deux promesses à tenir, et une seule des deux est « spectaculaire » :
 *  1. ON  : chaque mort laisse une flaque, et leur nombre reste BORNÉ.
 *  2. OFF : le jeu est strictement celui d'avant (brief §18). C'est la promesse
 *     la plus importante — un mode secret qui fuit en jeu normal est un bug.
 */

async function bootTitle(page: import('@playwright/test').Page) {
  await page.goto('/?seed=11&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
}

/** Joue la séquence Konami via le seam (même chemin que clavier/manette). */
async function playKonami(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const g = window.__GAME__
    for (const d of ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'] as const) {
      g?.nav(d)
    }
    g?.back()
    g?.confirm()
  })
}

test('le Konami au titre BASCULE le Mode Carnage (et ne lance pas la partie)', async ({ page }) => {
  await bootTitle(page)
  expect(await page.evaluate(() => window.__GAME__?.getState().carnage)).toBe(false)

  await playKonami(page)
  const on = await page.evaluate(() => ({
    carnage: window.__GAME__?.getState().carnage,
    screen: window.__GAME__?.getState().screen
  }))
  expect(on.carnage).toBe(true)
  // Le « A » final est consommé par le code : on reste au titre.
  expect(on.screen).toBe('title')

  // Rejouer le code DÉSACTIVE (brief §3.3).
  await playKonami(page)
  expect(await page.evaluate(() => window.__GAME__?.getState().carnage)).toBe(false)
})

test('le casque doré n’est PLUS donné par le Konami', async ({ page }) => {
  await bootTitle(page)
  await playKonami(page)
  const s = await page.evaluate(() => window.__GAME__?.getState())
  expect(s?.carnage).toBe(true)
  // Régression : l'ancien effet ne doit plus se déclencher (brief §18).
  expect(s?.goldSkin).toBe(false)
})

test('ON : les morts laissent des flaques, et leur nombre reste BORNÉ', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=11&test=1&perf=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const pools = async () =>
    page.evaluate(() => window.__GAME__?.debugPerfProfile?.()?.counts.bloodPools ?? -1)

  await page.evaluate(() => {
    window.__GAME__?.debugCarnage(true)
  })

  // Massacre : on fait apparaître des ennemis à portée et on tape, en boucle.
  await page.evaluate(() => {
    window.__GAME__?.setInput(1, { move: { x: 0, y: 0 }, attack: true })
    for (let i = 0; i < 120; i++) {
      window.__GAME__?.debugSpawnEnemies(20, 90)
      window.__GAME__?.advanceTime(500)
      while (window.__GAME__?.getState().pendingLevelUp !== null) {
        window.__GAME__?.chooseUpgrade(0)
      }
    }
  })

  const alive = await pools()
  expect(alive).toBeGreaterThan(0) // le sang coule
  // …mais il est borné : c'est le ring buffer FIFO. Sans lui, une longue run
  // accumulerait les décalques sans fin (les caps existants du projet ne
  // bornaient que le DÉBIT par frame, jamais le nombre d'objets vivants).
  const cap = await page.evaluate(() => 320) // CARNAGE.maxPoolsDesktop
  expect(alive).toBeLessThanOrEqual(cap)
})

test('OFF : pas une seule flaque, quel que soit le nombre de morts', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=11&test=1&perf=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => {
    // Mode explicitement OFF (défaut) — on ne touche pas au Konami.
    window.__GAME__?.setInput(1, { move: { x: 0, y: 0 }, attack: true })
    for (let i = 0; i < 40; i++) {
      window.__GAME__?.debugSpawnEnemies(20, 90)
      window.__GAME__?.advanceTime(500)
      while (window.__GAME__?.getState().pendingLevelUp !== null) {
        window.__GAME__?.chooseUpgrade(0)
      }
    }
  })

  const s = await page.evaluate(() => ({
    carnage: window.__GAME__?.getState().carnage,
    pools: window.__GAME__?.debugPerfProfile?.()?.counts.bloodPools ?? -1,
    kills: window.__GAME__?.getState().score
  }))
  expect(s.carnage).toBe(false)
  expect(s.kills).toBeGreaterThan(0) // des ennemis sont bien morts…
  expect(s.pools).toBe(0) // …et pourtant zéro flaque.
})
