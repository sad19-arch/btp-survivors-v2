import { test, expect } from '@playwright/test'

/**
 * Validation jouable des comportements d'armes Phase A :
 *  - Flaques de goudron (goudron) exposées dans `getState().hazards`
 *  - Cône (extincteur) — pas de crash au rendu
 *
 * Non-lite (nécessite le rendu réel) → limité au projet chromium.
 */
test('goudron + extincteur : hazards exposés, aucun crash, screen=game', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'charge des textures : chromium uniquement')

  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/?test=1&autostart=solo&seed=42')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // Équiper goudron et extincteur en une seule passe (debugGrant remplace le loadout entier).
  await page.evaluate(() => {
    window.__GAME__?.debugGrant({
      weapons: [
        { id: 'goudron', level: 1 },
        { id: 'extincteur', level: 1 }
      ]
    })
  })

  // Faire apparaître des ennemis (cibles pour le cône)
  await page.evaluate(() => {
    window.__GAME__?.debugSpawnEnemies(20)
  })

  // Avancer suffisamment pour que goudron tire (cooldown=0 → tire au 1er tick)
  // mais pas assez pour que les flaques expirent (lifeMs=3000).
  await page.evaluate(() => {
    window.__GAME__?.advanceTime(1000)
  })

  const stateWithHazards = await page.evaluate(() => window.__GAME__?.getState())

  // Le jeu est en cours (game ou upgrade si level-up atteint)
  expect(['game', 'upgrade']).toContain(stateWithHazards?.screen)

  // Des flaques de goudron ont été créées et sont exposées dans le view-state
  expect((stateWithHazards?.hazards.length ?? 0) > 0).toBe(true)

  // Continuer (en acceptant l'écran upgrade) pour vérifier qu'aucun crash n'arrive.
  // Si un level-up est en attente, on choisit la 1ère carte.
  await page.evaluate(() => {
    const G = window.__GAME__
    if (G === undefined) {
      return
    }
    if (G.getState().pendingLevelUp !== null) {
      G.chooseUpgrade(0)
    }
    G.advanceTime(4000)
  })

  const stateFinal = await page.evaluate(() => window.__GAME__?.getState())

  // Toujours dans une phase active (game, upgrade ou paused) — pas gameover = pas de crash fatal
  expect(stateFinal?.screen).not.toBe('gameover')

  // Aucune erreur JS en cours de run
  expect(errors).toHaveLength(0)
})
