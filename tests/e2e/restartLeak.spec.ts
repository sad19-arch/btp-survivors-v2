import { test, expect } from '@playwright/test'

/**
 * Régression perf (T6) : les objets de scène (sprites/VFX) ne doivent PAS
 * s'accumuler d'une partie à l'autre. Symptôme d'origine (playtest) : « soucis
 * de performance dès la 2e partie ». Cause : un restart MÊME STAGE ne déclenchait
 * pas `scene.restart` (seul un changement de `stageId` le faisait) → `resetRunState`
 * et le pool n'étaient jamais remis à zéro → les objets des parties précédentes
 * restaient. Fix : `runId` bumpé à chaque `start()`, GameScene relance la scène
 * quand il change. Ici on enchaîne 3 parties (spawn horde → restart) et on
 * vérifie que le nombre d'objets de scène reste BORNÉ (avec la fuite il triplait).
 *
 * Mesure via `window.__PHASER_GAME__` (exposé en test uniquement, cf. main.ts).
 */
test('restart : les objets de scène restent bornés (pas de fuite)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=5&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.waitForFunction(
    () => (window as unknown as { __PHASER_GAME__?: unknown }).__PHASER_GAME__ !== undefined
  )

  const populateAndCount = async (): Promise<number> => {
    await page.evaluate(() => {
      const g = window.__GAME__
      g?.debugSpawnEnemies(120)
      for (let i = 0; i < 15; i++) {
        g?.advanceTime(100)
      }
    })
    // Laisse la boucle de rendu (rAF) créer les sprites avant de compter.
    await page.waitForTimeout(500)
    return page.evaluate(() => {
      const game = (
        window as unknown as {
          __PHASER_GAME__: { scene: { getScene: (k: string) => { children: { list: unknown[] } } } }
        }
      ).__PHASER_GAME__
      return game.scene.getScene('game').children.list.length
    })
  }

  const g1 = await populateAndCount()
  await page.evaluate(() => window.__GAME__?.restart())
  const g2 = await populateAndCount()
  await page.evaluate(() => window.__GAME__?.restart())
  const g3 = await populateAndCount()

  console.log(`[restart-leak] children g1=${g1} g2=${g2} g3=${g3}`)

  // Sanity : des sprites ont bien été créés (sinon la mesure ne prouve rien).
  expect(g1).toBeGreaterThan(50)
  // Borné : la 3e partie ne doit pas dépasser ~1.6× la première (avec la fuite,
  // les objets accumulés faisaient ~3× à la 3e partie).
  expect(g3).toBeLessThanOrEqual(Math.round(g1 * 1.6))
})
