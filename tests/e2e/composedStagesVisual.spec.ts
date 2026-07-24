import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const STAGES = [
  [2, 'terrassement'],
  [3, 'fondations'],
  [4, 'reseaux_enterres'],
  [5, 'gros_oeuvre'],
  [6, 'echafaudages'],
  [7, 'charpente_toiture'],
  [8, 'second_oeuvre'],
  [9, 'finitions'],
  [10, 'livraison_audit'],
] as const

const stageMask = (page: Page) => [
  page.locator('.hud__stagenum'),
  page.locator('.hud__stagename'),
]

test('revue visuelle des compositions 02 à 10 : premier écran et vue des cinq zones', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  // Les deux projets ont des viewports différents : isoler leurs artefacts évite
  // qu'une capture portrait mobile n'écrase la revue paysage Chromium.
  const output = join('test-results', 'stage-layout-review', testInfo.project.name)
  mkdirSync(output, { recursive: true })

  for (const [level, stageId] of STAGES) {
    await page.goto(`/?autostart=solo&level=${level}&seed=42&test=1&intro=0`)
    await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 60_000 })
    // Le splash studio est hors contrat de cette revue ; le retirer conserve le
    // viewport et le HUD réels du jeu pour les captures à l'aveugle.
    await page.evaluate(() => {
      document.querySelector('.splash')?.remove()
      window.__GAME__?.advanceTime(500)
    })
    // Le bandeau transitoire de démarrage occulte le tableau causal ; la revue
    // capture le premier écran jouable, une fois cette notification expirée.
    await page.waitForTimeout(1_900)
    await page.screenshot({
      path: join(output, `${String(level).padStart(2, '0')}-${stageId}-spawn-responsive.png`),
      mask: stageMask(page),
    })

    await page.evaluate(() => {
      window.__GAME__?.debugCameraOverview?.(0.2, 5120, 3840)
      window.__GAME__?.advanceTime(200)
    })
    await page.screenshot({
      path: join(output, `${String(level).padStart(2, '0')}-${stageId}-zones-overview-0.2.png`),
      mask: stageMask(page),
    })

    if (level === 2 || level === 10) {
      await page.evaluate(() => {
        window.__GAME__?.debugCameraOverview?.(0.1, 5120, 3840)
        window.__GAME__?.advanceTime(200)
      })
      await page.screenshot({
        path: join(output, `${String(level).padStart(2, '0')}-${stageId}-perimeter-0.1.png`),
        mask: stageMask(page),
      })
    }

    const state = await page.evaluate(() => window.__GAME__?.getState())
    expect(state?.stageId).toBe(stageId)
  }
})
