import { test, expect } from '@playwright/test'

/**
 * Écran des succès, de bout en bout via le seam JSON (aucun pixel interprété).
 *
 * L'écran est atteint UNIQUEMENT par nav()/confirm() et quitté par back() :
 * c'est la preuve exécutable qu'aucune fonction n'exige la souris (règle 8 —
 * 100 % manette). Rien n'a été ajouté à `src/input` pour cela : un écran qui
 * passe par `menuItems()` est pilotable dès qu'il existe.
 */

test('« Succès » au titre : consultable 100 % manette, aller-retour vers le titre', async ({ page }) => {
  // Contexte Playwright neuf → localStorage vierge : c'est le cas NOMINAL à
  // couvrir (un joueur qui n'a rien débloqué doit voir ce qu'il lui reste à faire).
  await page.goto('/?seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // Descend jusqu'à « Succès » : Jouer → Joueurs → Niveau → Scores → Succès.
  await page.evaluate(() => {
    window.__GAME__?.nav('down')
    window.__GAME__?.nav('down')
    window.__GAME__?.nav('down')
    window.__GAME__?.nav('down')
  })
  await expect(page.locator('.menu__item--focus')).toHaveText('Succès')

  await page.evaluate(() => window.__GAME__?.confirm())
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen), { timeout: 5000 })
    .toBe('achievements')

  // Profil neuf : le catalogue est ENTIÈREMENT affiché, verrouillé. Un écran vide
  // serait le bug (cf. la doctrine `starRow` : voir ce qu'on a raté).
  const total = await page.evaluate(() => window.__GAME__?.getState().achievements?.entries.length ?? 0)
  expect(total).toBeGreaterThan(0)
  await expect(page.locator('.ach-row')).toHaveCount(total)
  await expect(page.locator('.ach-row--on')).toHaveCount(0)
  await expect(page.locator('.panel__title')).toHaveText('SUCCÈS')

  // Le panneau tient dans l'écran : aucun scroll (le jeu est 100 % manette — un
  // menu poussé sous l'écran serait inatteignable, cf. le récap co-op).
  const fits = await page.evaluate(() => {
    const panel = document.querySelector('.panel--achievements')
    if (panel === null) { return false }
    const r = panel.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= window.innerHeight
  })
  expect(fits).toBe(true)

  // « B » revient au titre : l'écran est une surcouche, pas un cul-de-sac.
  await page.evaluate(() => window.__GAME__?.back())
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().screen), { timeout: 5000 })
    .toBe('title')
})
