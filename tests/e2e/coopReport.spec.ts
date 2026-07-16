import { test, expect } from '@playwright/test'

/**
 * Rapport de fin en co-op : il doit TENIR dans l'écran.
 *
 * Le panneau est en `overflow: hidden` (nécessaire aux rayons de victoire) : tout
 * ce qui dépasse est **clippé, pas scrollable**. Et le jeu doit rester jouable
 * 100 % manette — donc on ne peut pas compter sur un scroll pour atteindre le
 * menu. À 4 joueurs, le récap par joueur + les étoiles poussaient « Recommencer »
 * 265 px sous la ligne de flottaison : la partie devenait un cul-de-sac.
 *
 * Aucun test ne voyait ça : les assertions DOM passent sur un élément hors-écran,
 * et le screenshot n'est comparé à aucune golden. D'où ce test, qui MESURE.
 */

/** Joue jusqu'au game-over, en consommant les cartes (le temps est gelé tant qu'une carte attend). */
async function reachGameOver(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    window.__GAME__?.setInput(1, { move: { x: 0, y: 0 }, attack: true })
    for (let i = 0; i < 90; i++) {
      window.__GAME__?.advanceTime(1000)
      while (window.__GAME__?.getState().pendingLevelUp !== null) {
        window.__GAME__?.chooseUpgrade(0)
      }
    }
    window.__GAME__?.debugKillPlayer()
    window.__GAME__?.advanceTime(200)
  })
  await page.waitForFunction(() => window.__GAME__?.getState().screen === 'gameover', null, { timeout: 8000 })
}

test('co-op 4 joueurs : le menu du rapport reste DANS l’écran (pas de clip)', async ({ page }) => {
  await page.goto('/?autostart=coop4&seed=11&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await reachGameOver(page)

  const box = await page.evaluate(() => {
    const menu = document.querySelector('.menu')?.getBoundingClientRect()
    const panel = document.querySelector('.report')?.getBoundingClientRect()
    return {
      viewportH: window.innerHeight,
      menuBottom: menu?.bottom ?? Infinity,
      panelBottom: panel?.bottom ?? Infinity
    }
  })

  // C'est l'assertion qui compte : le dernier élément du panneau doit être visible.
  expect(box.menuBottom).toBeLessThanOrEqual(box.viewportH)
  expect(box.panelBottom).toBeLessThanOrEqual(box.viewportH)

  // Et il doit être réellement actionnable (pas juste présent dans le DOM).
  await expect(page.locator('.menu__item').first()).toBeVisible()
})

test('co-op : le rapport montre 3 étoiles, la jauge, et le podium', async ({ page }) => {
  await page.goto('/?autostart=coop&seed=11&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await reachGameOver(page)

  // 3 emplacements d'étoiles, 0 gagnée (défaite).
  await expect(page.locator('.report__star')).toHaveCount(3)
  await expect(page.locator('.report__star--on')).toHaveCount(0)

  // La jauge est remplie à la hauteur exacte de la progression rapportée.
  const gauge = await page.evaluate(() => {
    const fill = document.querySelector<HTMLElement>('.report__fill')
    return { width: fill?.style.width, percent: window.__GAME__?.getState().runReport?.progressPercent }
  })
  expect(gauge.width).toBe(`${gauge.percent}%`)

  // Podium : J1 attaque, J2 non → les scores diffèrent, donc trophée + croix.
  await expect(page.locator('.report__trophy')).toHaveCount(1)
  await expect(page.locator('.report__cross')).toHaveCount(1)
})
