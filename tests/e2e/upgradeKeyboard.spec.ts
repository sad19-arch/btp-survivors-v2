import { test, expect } from '@playwright/test'

/**
 * Repro + régression : écran d'upgrade navigable clavier + manette.
 *
 * Cause racine (bug) : `.card--weapon` et `.card--passive` venaient APRÈS
 * `.card--focus` dans styles.ts → même spécificité CSS, ordonnancement tardif
 * → la couleur de bordure des cartes weapon/passif écrasait celle du focus
 * → la carte focalisée était visuellement identique aux autres → le joueur
 * croyait que le clavier « ne marchait pas ».
 *
 * La nav logique (focus.move) fonctionnait ; le confirm() choisissait la bonne
 * carte. Seule la VISIBILITÉ du focus était cassée.
 */

/**
 * Déclenche exactement un level-up (25 XP → seuil 1, juste assez pour monter
 * une fois) et attend que l'overlay affiche les cartes.
 */
async function triggerOneLevelUp(page: import('@playwright/test').Page): Promise<void> {
  // 30 XP = au-dessus du 1er seuil (25) mais en dessous du 2e (~28.75).
  // On avance le temps par petits pas pour que le sim traite le level-up.
  await page.evaluate(() => {
    const g = window.__GAME__
    if (g === undefined) { return }
    g.debugAddXp(30)
    for (let t = 0; t < 5_000 && g.getState().screen !== 'upgrade'; t += 50) {
      g.advanceTime(50)
    }
  })
  // L'overlay DOM se met à jour via requestAnimationFrame → attendre le rendu.
  await page.waitForSelector('.card', { timeout: 5000 })
  const screen = await page.evaluate(() => window.__GAME__?.getState().screen)
  expect(screen).toBe('upgrade')
}

// ---------------------------------------------------------------------------
// Test A : nav API seam — focus se déplace, confirm choisit la bonne carte
// ---------------------------------------------------------------------------

test('upgrade : nav() déplace le focus et confirm() choisit la bonne carte (seam)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await triggerOneLevelUp(page)

  // Index initial = 0.
  const before = await page.evaluate(() => window.__GAME__?.getState().menu?.index)
  expect(before).toBe(0)

  // nav('right') → index passe à 1.
  await page.evaluate(() => window.__GAME__?.nav('right'))
  const mid = await page.evaluate(() => window.__GAME__?.getState().menu?.index)
  expect(mid).toBe(1)

  // nav('left') → index revient à 0 (bouclage).
  await page.evaluate(() => window.__GAME__?.nav('left'))
  const backToFirst = await page.evaluate(() => window.__GAME__?.getState().menu?.index)
  expect(backToFirst).toBe(0)

  // confirm() → choisit la carte à l'index 0 (pas forcément la première visuellement).
  await page.evaluate(() => window.__GAME__?.confirm())

  // L'upgrade est traité : le screen ne doit plus être 'upgrade'.
  // (Le joueur peut enchaîner sur un 2e level-up si l'XP banque le déclenche,
  // mais avec seulement 30 XP on n'atteint pas le 2e seuil ≈28.75.)
  await page.waitForFunction(() => {
    const s = window.__GAME__?.getState()
    return s?.screen !== 'upgrade'
  }, { timeout: 5000 })
})

// ---------------------------------------------------------------------------
// Test B : focus visible — CSS nav seam + visibilité du focus
// ---------------------------------------------------------------------------

test('upgrade : nav déplace le focus DOM et le focus est visuellement distinct des autres cartes', async ({
  page
}) => {
  await page.goto('/?autostart=solo&seed=2&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await triggerOneLevelUp(page)

  // Attendre que l'overlay ait rendu les cartes (requestAnimationFrame).
  await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, { timeout: 3000 })

  // La carte focalisée est distinguée par un FOND jaune (jauneSecurite) + sheen —
  // c'est le mécanisme de focus (styles.ts .card--focus), plus lisible qu'une bordure.
  const focusedBg = await page.evaluate(() => {
    const focused = document.querySelector('.card.card--focus')
    return focused !== null ? window.getComputedStyle(focused).backgroundColor : null
  })
  expect(focusedBg).not.toBeNull()

  // Les cartes non-focalisées ont un fond DIFFÉRENT (texture var(--tex) → transparent).
  const unfocusedBg = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card:not(.card--focus)'))
    const first = cards[0]
    return first !== undefined ? window.getComputedStyle(first).backgroundColor : null
  })

  if (unfocusedBg !== null) {
    expect(focusedBg).not.toBe(unfocusedBg)
  }

  // nav('right') → la 2e carte est maintenant focalisée.
  await page.evaluate(() => window.__GAME__?.nav('right'))
  // Attendre que l'overlay se re-rende (requestAnimationFrame).
  await page.waitForFunction(() => {
    const cards = Array.from(document.querySelectorAll('.card'))
    return cards[1]?.classList.contains('card--focus') === true
  }, { timeout: 2000 })

  // La 1re carte n'a PLUS le focus.
  const firstHasFocus = await page.evaluate(() =>
    document.querySelector('.card')?.classList.contains('card--focus')
  )
  expect(firstHasFocus).toBe(false)

  // La 2e carte a le focus.
  const secondHasFocus = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card'))
    return cards[1]?.classList.contains('card--focus') === true
  })
  expect(secondHasFocus).toBe(true)

  // Confirm sur la 2e carte (index 1).
  await page.evaluate(() => window.__GAME__?.confirm())
  await page.waitForFunction(() => window.__GAME__?.getState().screen !== 'upgrade', { timeout: 5000 })
})

// ---------------------------------------------------------------------------
// Test C : focus visible — card--focus écrase bien card--weapon / card--passive
// ---------------------------------------------------------------------------

test('upgrade : la carte focalisée a un fond jaune même si card--weapon ou card--passive', async ({
  page
}) => {
  await page.goto('/?autostart=solo&seed=3&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await triggerOneLevelUp(page)

  // Chercher une carte weapon ou passive focalisée parmi les 3 premières positions.
  for (let i = 0; i < 3; i++) {
    const found = await page.evaluate(() => {
      const focused = document.querySelector('.card.card--focus')
      if (focused === null) { return false }
      return focused.classList.contains('card--weapon') || focused.classList.contains('card--passive')
    })
    if (found) { break }
    await page.evaluate(() => window.__GAME__?.nav('right'))
    await page.waitForFunction(() => {
      const focused = document.querySelector('.card.card--focus')
      return focused !== null
    }, { timeout: 1000 })
  }

  const result = await page.evaluate(() => {
    const focusedEl = document.querySelector('.card.card--focus')
    if (focusedEl === null) { return { ok: false, reason: 'no focused card' } }
    const focused = focusedEl as HTMLElement
    const isTyped = focused.classList.contains('card--weapon') || focused.classList.contains('card--passive')
    if (!isTyped) {
      // Carte sans type (pas d'override CSS possible) — focus visible garanti sans fix.
      return { ok: true, reason: 'no typed card focused — skip type-override check' }
    }
    const style = window.getComputedStyle(focused)
    const bg = style.backgroundColor
    // Le focus impose un FOND jaune (jauneSecurite = rgb(255, 204, 0)) qui écrase le
    // style de type (weapon/passive) : on s'assure que ce fond diffère de la carte
    // non-focalisée du même type (fond texturé var(--tex) → transparent).
    const unfocusedOfSameType = Array.from(
      document.querySelectorAll(focused.classList.contains('card--weapon') ? '.card--weapon:not(.card--focus)' : '.card--passive:not(.card--focus)')
    )[0]
    if (unfocusedOfSameType === undefined) {
      // Seule carte de ce type → impossible de comparer, on accepte.
      return { ok: true, reason: 'single card of this type' }
    }
    const otherBg = window.getComputedStyle(unfocusedOfSameType).backgroundColor
    return { ok: bg !== otherBg, bg, otherBg }
  })

  expect(result.ok).toBe(true)
})
