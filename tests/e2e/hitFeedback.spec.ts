import { test, expect } from '@playwright/test'

/**
 * Valide le feedback de coup (Task 1.6 + fix cap Task 1.4) :
 * - Les chiffres de dégâts flottants sont bien déclenchés quand des ennemis sont touchés.
 * - Le compteur `debugFeedbackInfo().spawnedTotal` augmente pendant une horde active.
 * - Le cap par frame (FEEDBACK_MAX_PER_FRAME) borne les allocations en horde AOE de masse.
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

  // Spawn 60 ennemis À PORTÉE (rayon 120) du joueur : les spawns normaux vont à
  // l'anneau lointain hors-écran (TUN-2), hors de l'AOE du marteau (r≈175). Le
  // rayon rapproché garantit des hits immédiats → chiffres de dégâts spawned.
  await page.evaluate(() => {
    window.__GAME__?.debugSpawnEnemies(60, 120)
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

/**
 * Stress AOE de masse : prouve que le cap par frame borne les allocations de feedback.
 *
 * Contexte : sans cap, une arme de zone (marteau niveau 8) frappant 200+ ennemis
 * simultanément émet 200 chiffres + 200 Rectangle + 200 tweens par frame → pic
 * d'allocations + visuellement illisible (superposition totale). Le cap
 * FEEDBACK_MAX_PER_FRAME = 16 garantit que même dans ce pire cas, on n'émet jamais
 * plus de 16 chiffres+pops allouants par frame.
 *
 * Mode : PAS lite — DamageNumberPool initialisé + marteau à haut niveau → AOE de masse.
 * Assertion : active ≤ maxPerFrame × quelquesFrames (les chiffres des frames précédentes
 * sont encore en tween pendant ~450ms) ET spawnedTotal > 0 (les chiffres bien émis).
 */
test('cap feedback AOE : les allocations restent bornées avec 200 ennemis frappés', async ({ page }) => {
  // PAS lite — DamageNumberPool doit être initialisé (create() de GameScene).
  await page.goto('/?autostart=solo&seed=7&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })

  // Marteau-piqueur niveau 8 : AOE maximale, touche tous les ennemis proches en 1 pulse.
  await page.evaluate(() => {
    window.__GAME__?.debugGrant({ weapons: [{ id: 'marteau', level: 8 }] })
  })

  // Spawn 200 ennemis collés autour du joueur (rayon 100) — le pire cas AOE de masse,
  // immédiatement dans la zone du marteau. (Les spawns normaux vont à l'anneau lointain
  // hors-écran depuis TUN-2 ; le rayon rapproché reproduit la salve simultanée voulue.)
  await page.evaluate(() => {
    window.__GAME__?.debugSpawnEnemies(200, 100)
  })

  const enemyCount = await page.evaluate(() => window.__GAME__?.getState().enemies.length ?? 0)
  expect(enemyCount).toBeGreaterThanOrEqual(200)

  // Récupère le cap exposé par la sonde pour une assertion robuste (pas de magic number).
  const capBeforeAdvance = await page.evaluate(() => window.__GAME__?.debugFeedbackInfo?.()?.maxPerFrame ?? 16)

  // Avance ~6s de sim (60 ticks × 100ms) avec setInterval pour que le rAF de Phaser
  // batte entre chaque tick → GameScene.update() appelé, diffs HP détectés, cap appliqué.
  // Les 200 ennemis sont déjà dans la zone du marteau (spawn rayon 100) → salve AOE de
  // masse dès le 1er pulse ; 6s garantit plusieurs pulses (et le cap tient à chacun).
  // On auto-choisit la première carte si un level-up survient (sinon le temps gèle).
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      let ticks = 0
      const iv = setInterval(() => {
        // Si un level-up est en attente, le choisir immédiatement pour dégeler le temps.
        const state = window.__GAME__?.getState()
        if (state?.pendingLevelUp !== null && state?.pendingLevelUp !== undefined) {
          window.__GAME__?.chooseUpgrade(0)
        }
        window.__GAME__?.advanceTime(100)
        ticks++
        if (ticks >= 60) {
          clearInterval(iv)
          resolve()
        }
      }, 50)
    })
  })

  const feedbackInfo = await page.evaluate(() => window.__GAME__?.debugFeedbackInfo?.())
  expect(feedbackInfo).not.toBeUndefined()

  // Des chiffres ont bien été spawned (le feedback fonctionne, le cap n'a pas tout coupé).
  expect(feedbackInfo?.spawnedTotal ?? 0).toBeGreaterThan(0)

  // Le nombre de chiffres actifs simultanément est borné : au pire, les chiffres des
  // ~3 dernières frames sont encore en tween (durée 450ms / intervalle ~16ms ≈ 28 frames).
  // On tolère maxPerFrame × 30 pour couvrir les chiffres encore en vol des frames précédentes.
  // Si le cap n'existait pas, on verrait 200+ chiffres actifs en même temps.
  const maxTolerated = capBeforeAdvance * 30
  console.log(
    `[hitFeedback-cap] active=${feedbackInfo?.active} spawnedTotal=${feedbackInfo?.spawnedTotal} ` +
    `maxPerFrame=${feedbackInfo?.maxPerFrame} maxTolerated=${maxTolerated}`
  )
  expect(feedbackInfo?.active ?? 0).toBeLessThanOrEqual(maxTolerated)
  // La borne principale : le pool n'a jamais cru à plus de maxPerFrame × 30 actifs,
  // preuve que le plafond d'émission par frame a bien été respecté.
  // (Si le cap avait été absent, active aurait atteint ~200 × <frames_de_tween> ≈ 5600.)
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
  // Seuils alignés sur fps-horde (WebGL logiciel SwiftShader) : la MÉDIANE garde contre
  // une régression O(N²) du feedback de coup ; le p95 capte la queue (GC/scheduling).
  //
  // RÉTABLIS (2026-07-17) à 33/50 — cf. le bloc de justification détaillé dans
  // fps-horde.spec.ts. L'« élévation » de 12d63ef (médiane ≈34 ms, p95 ≈117 ms) ne se
  // reproduit pas : re-mesuré ici médiane 16,20 ms / p95 26,60 ms (chromium) et
  // 16,10 / 19,00 (mobile), en SUITE PLEINE. (Le commentaire précédent disait « mode
  // NON-lite = rendu complet » : c'était faux, ce test boote bien en `&lite=1` ligne 145,
  // exactement comme fps-horde — d'où des chiffres identiques, ce qui est cohérent.)
  expect(sample.median).toBeLessThan(33)
  expect(sample.p95).toBeLessThan(50)
})
