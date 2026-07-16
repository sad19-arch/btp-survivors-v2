import { test, expect } from '@playwright/test'

/**
 * Régression : en co-op, CHAQUE joueur doit avoir son HUD dédié (PV, XP, armes).
 * Avant le correctif, `syncHud`/`syncInventory` étaient câblés en dur sur
 * `state.players[0]` : J2/J3/J4 n'avaient ni barre de vie ni inventaire.
 */

/**
 * Attend que les blocs HUD soient réellement POSÉS, pas seulement présents.
 *
 * Le splash studio couvre l'écran jusqu'à ~3.4 s en mode test : pendant ce temps
 * les `.phud` existent déjà dans le DOM mais sont masqués, donc leur
 * `getBoundingClientRect()` vaut 0 partout. Un test qui mesure là croit voir les
 * 4 blocs empilés dans le même coin. Attendre une géométrie non nulle plutôt
 * qu'une durée fixe : c'est la condition qui compte, pas le chrono.
 */
async function waitForLaidOutHud(page: import('@playwright/test').Page, count: number) {
  await page.waitForFunction(
    (n) => {
      const els = Array.from(document.querySelectorAll('.phud'))
      return els.length === n && els.every((e) => e.getBoundingClientRect().width > 0)
    },
    count,
    { timeout: 10000 }
  )
}

test('co-op 2 joueurs : chaque joueur a son bloc HUD (PV + XP + armes)', async ({ page }) => {
  await page.goto('/?autostart=coop&seed=7&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await waitForLaidOutHud(page, 2)

  // Un bloc par joueur, et chacun porte SES barres + SES armes.
  await expect(page.locator('.phud')).toHaveCount(2)
  for (const id of [1, 2]) {
    const block = page.locator(`.phud--p${id}`)
    await expect(block).toHaveCount(1)
    await expect(block.locator('.hud__bar--hp')).toHaveCount(1)
    await expect(block.locator('.hud__bar--xp')).toHaveCount(1)
    await expect(block.locator('.phud__id')).toHaveText(`J${id}`)
    // L'arme de départ de CE joueur est affichée dans SON bloc.
    expect(await block.locator('.inv__tile').count()).toBeGreaterThan(0)
  }
})

test('co-op 4 joueurs : 4 blocs, un par coin, sans doublon d\'inventaire', async ({ page }) => {
  await page.goto('/?autostart=coop4&seed=7&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await waitForLaidOutHud(page, 4)

  await expect(page.locator('.phud')).toHaveCount(4)
  // Le panneau d'inventaire solo est inerte en co-op (sinon J1 serait affiché 2 fois).
  await expect(page.locator('.inv')).toHaveCount(0)

  // Les 4 blocs occupent 4 coins distincts.
  //
  // La requête ET la mesure doivent tenir dans UNE SEULE évaluation. `syncHud`
  // reconstruit les blocs à chaque frame (clear + rebuild) : avec un
  // `locator.evaluateAll`, Playwright résout les éléments puis les mesure en deux
  // temps, et une frame peut passer entre les deux — on mesure alors des nœuds
  // DÉTACHÉS, dont le rectangle vaut 0 partout. Les 4 blocs semblaient alors
  // empilés dans le même coin, au hasard de la charge machine.
  // On classe chaque bloc par son CENTRE, pas par son coin haut-gauche : sur un
  // écran étroit (mobile portrait, 412 px), deux blocs de ~218 px ne peuvent pas
  // avoir leur coin dans deux moitiés différentes — le bloc de droite démarre
  // avant le milieu. Le centre, lui, dit sans ambiguïté de quel côté il est.
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.phud')).map((e) => {
      const r = e.getBoundingClientRect()
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
    })
  )
  const midX = (page.viewportSize()?.width ?? 1280) / 2
  const midY = (page.viewportSize()?.height ?? 720) / 2
  const corners = new Set(boxes.map((b) => `${b.cx < midX ? 'L' : 'R'}${b.cy < midY ? 'T' : 'B'}`))
  expect(corners.size).toBe(4)
})

test('solo : HUD historique inchangé (pas de bloc joueur, inventaire dédié présent)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=7&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.waitForSelector('.hud__bar--hp', { timeout: 5000 })

  await expect(page.locator('.phud')).toHaveCount(0)
  await expect(page.locator('.hud__hp')).toHaveCount(1)
  await expect(page.locator('.inv')).toHaveCount(1)
})
