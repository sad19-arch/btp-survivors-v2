import { test, expect } from '@playwright/test'

/**
 * Écran « Évolutions d'armes », de bout en bout via le seam JSON (aucun pixel
 * interprété). Calqué sur `achievements.spec.ts`, avec la différence structurelle
 * clé : cet écran s'atteint depuis la PAUSE (en run), pas depuis le titre.
 *
 * Atteint UNIQUEMENT par nav()/confirm() et quitté par back() : preuve exécutable
 * qu'aucune fonction n'exige la souris (règle 8 — 100 % manette).
 */

test('« Évolutions » en pause : consultable 100 % manette, aller-retour vers la pause', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => window.__GAME__?.pause())
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen), { timeout: 5000 })
    .toBe('paused')

  // Descend jusqu'à « Évolutions » : Reprendre → Évolutions.
  await page.evaluate(() => window.__GAME__?.nav('down'))
  await expect(page.locator('.menu__item--focus')).toHaveText('Évolutions')

  await page.evaluate(() => window.__GAME__?.confirm())
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen), { timeout: 5000 })
    .toBe('evolutions')

  // Une run fraîche n'a que l'arme de départ (cloueur) : au moins 1 ligne, jamais vide.
  const total = await page.evaluate(() => window.__GAME__?.getState().evolutions?.entries.length ?? 0)
  expect(total).toBeGreaterThan(0)
  await expect(page.locator('.ach-row')).toHaveCount(total)
  await expect(page.locator('.evo__pair')).toHaveCount(total)
  await expect(page.locator('.panel__title')).toHaveText('ÉVOLUTIONS D\'ARMES')

  // Le panneau tient dans l'écran : aucun scroll (jeu 100 % manette).
  const fits = await page.evaluate(() => {
    const panel = document.querySelector('.panel--evolutions')
    if (panel === null) { return false }
    const r = panel.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= window.innerHeight
  })
  expect(fits).toBe(true)

  // « B » revient à la PAUSE (surcouche de la pause, pas du titre — contrairement aux succès).
  await page.evaluate(() => window.__GAME__?.back())
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen), { timeout: 5000 })
    .toBe('paused')
})
