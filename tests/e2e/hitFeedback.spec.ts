import { test, expect } from '@playwright/test'

/**
 * Valide le feedback de coup (Task 1.6) :
 * - Les chiffres de dégâts flottants sont bien déclenchés quand des ennemis sont touchés.
 * - Le compteur `debugFeedbackInfo().spawnedTotal` augmente pendant une horde active.
 *
 * Mode : PAS lite (vrais sprites chargés, DamageNumberPool initialisé dans create()).
 * Arme : marteau-piqueur niveau 6 (zone AOE, touche tout ce qui est proche).
 * Ennemis : 60 spawned via debugSpawnEnemies (dense, autour du joueur).
 * Avance ~5s de jeu → ennemis marchent vers le joueur et entrent dans la zone de frappe.
 */

test('feedback de coup : des chiffres de dégâts sont spawned sur la horde', async ({ page }) => {
  // PAS lite — on veut le vrai rendu avec DamageNumberPool initialisé.
  await page.goto('/?autostart=solo&seed=7&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })

  // Marteau-piqueur niveau 6 : arme de zone qui frappe en AOE autour du joueur.
  // Les ennemis approchant → garantit des hits dès qu'ils entrent dans la zone.
  await page.evaluate(() => {
    window.__GAME__?.debugGrant({ weapons: [{ id: 'marteau', level: 6 }] })
  })

  // Spawn 60 ennemis autour du joueur.
  await page.evaluate(() => {
    window.__GAME__?.debugSpawnEnemies(60)
  })

  // Vérifie que les ennemis sont bien présents.
  const enemyCount = await page.evaluate(() => window.__GAME__?.getState().enemies.length ?? 0)
  expect(enemyCount).toBeGreaterThanOrEqual(60)

  // Avance ~5s de sim via setInterval pour que le rAF de Phaser batte entre chaque
  // advanceTime → GameScene.update() / syncSprites() appelé, diffs HP détectés et
  // chiffres de dégâts spawned. 50 ticks × 100ms = 5s de sim, ~2.5s réelles.
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      let ticks = 0
      const iv = setInterval(() => {
        window.__GAME__?.advanceTime(100)
        ticks++
        if (ticks >= 50) {
          clearInterval(iv)
          resolve()
        }
      }, 50)
    })
  })

  // La sonde doit exister (scène montée, pas mode lite).
  const feedbackInfo = await page.evaluate(() => window.__GAME__?.debugFeedbackInfo?.())
  expect(feedbackInfo).not.toBeUndefined()

  // Au moins un chiffre de dégâts a dû être spawned.
  expect(feedbackInfo?.spawnedTotal ?? 0).toBeGreaterThan(0)
})

test('perf horde : fps-horde reste stable après l\'ajout du feedback de coup', async ({ page }) => {
  // Mode lite — même conditions que fps-horde.spec.ts pour la comparaison.
  await page.goto('/?autostart=solo&seed=7&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })

  await page.evaluate(() => {
    window.__GAME__?.debugSpawnEnemies(500)
  })

  const enemyCount = await page.evaluate(() => window.__GAME__?.getState().enemies.length ?? 0)
  expect(enemyCount).toBeGreaterThanOrEqual(500)

  // Même méthode de mesure que fps-horde.spec.ts (setInterval 16ms, 3.5s total, 1s warmup).
  interface FrameSample { median: number; p95: number; count: number }
  const sample = await page.evaluate<FrameSample, { warmupMs: number; totalMs: number }>(
    ({ warmupMs, totalMs }) => {
      return new Promise<FrameSample>((resolve) => {
        const timestamps: number[] = []
        const start = performance.now()
        const iv = setInterval(() => {
          window.__GAME__?.advanceTime(16)
          const now = performance.now()
          timestamps.push(now - start)
          if (now - start > totalMs) {
            clearInterval(iv)
            const deltas = timestamps
              .map((t, i) => (i === 0 ? t : t - (timestamps[i - 1] ?? t)))
              .filter((_, i) => (timestamps[i] ?? 0) > warmupMs)
            const sorted = [...deltas].sort((a, b) => a - b)
            const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0
            const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
            resolve({ median, p95, count: sorted.length })
          }
        }, 16)
      })
    },
    { warmupMs: 1000, totalMs: 3500 }
  )

  console.log(`[hitFeedback-perf] samples=${sample.count} median=${sample.median.toFixed(2)}ms p95=${sample.p95.toFixed(2)}ms`)
  expect(sample.median).toBeLessThan(33)
  expect(sample.p95).toBeLessThan(50)
})
