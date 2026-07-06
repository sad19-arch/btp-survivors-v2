import { test, expect } from '@playwright/test'

/**
 * Phase B3+B4 — PNJ d'ambiance mobiles + bulles râleuses à l'approche.
 *
 * Valide via les sondes seam JSON (pas de pixels) :
 *   - `debugAmbientNpcs()` : tableau des positions PNJ actuelles (errance B3).
 *   - `debugActiveBubbles()` : nombre de bulles DA actives (B4).
 *
 * Stratégie : boot stage 01 en mode PLEIN (pas lite — NPC sprites chargés),
 * récupère la position d'un PNJ, déplace le joueur dessus via setInput +
 * advanceTime en intervalles réels (pour que le rAF Phaser batte et que
 * `this.time.now` avance), puis attend que la bulle soit déclenchée.
 *
 * Le cooldown initial du PNJ est 0 (jamais déclenché) → la première
 * approche suffit à déclencher une bulle dès que shouldBubble() renvoie true.
 */
test('PNJ d\'ambiance : positions exposées via debugAmbientNpcs', async ({ page }) => {
  // Mode plein (pas lite) — les feuilles NPC sont chargées dans create().
  await page.goto('/?autostart=solo&level=1&seed=3&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })

  // La sonde doit exister (scène montée, pas mode lite).
  const npcs = await page.evaluate(() => window.__GAME__?.debugAmbientNpcs?.())
  expect(npcs).not.toBeUndefined()
  // Stage 01 a un PNJ d'ambiance configuré (géomètre).
  expect(npcs?.length ?? 0).toBeGreaterThanOrEqual(1)

  // Les positions doivent être des coordonnées monde valides (pas NaN, dans le monde).
  const npc0 = npcs?.[0]
  if (npc0 !== undefined) {
    expect(isNaN(npc0.x)).toBe(false)
    expect(isNaN(npc0.y)).toBe(false)
    // Le PNJ est placé hors centre (>300px du centre) — vérification de placement.
    const cx = 1600 / 2
    const cy = 1200 / 2
    const distFromCenter = Math.hypot(npc0.x - cx, npc0.y - cy)
    expect(distFromCenter).toBeGreaterThan(200)
  }
})

test('PNJ d\'ambiance : bulle déclenchée quand le joueur approche à moins de 150px', async ({ page }) => {
  // Mode plein — NPC sprites chargés, sondes de bulle disponibles.
  await page.goto('/?autostart=solo&level=1&seed=3&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })

  // Laisser quelques frames réelles pour que la scène se stabilise.
  await page.waitForTimeout(300)

  // Récupère la position du PNJ d'ambiance.
  const npcs = await page.evaluate(() => window.__GAME__?.debugAmbientNpcs?.())
  const npc0 = npcs?.[0]
  // Le PNJ doit exister — son absence est un bug d'asset à corriger.
  if (npc0 === undefined) {
    throw new Error('Aucun PNJ d\'ambiance chargé pour stage 01 — vérifier que la feuille NPC est bien préchargée')
  }

  // Compteur de bulles avant l'approche : doit être 0.
  const bubblesBefore = await page.evaluate(() => window.__GAME__?.debugActiveBubbles?.() ?? 0)
  expect(bubblesBefore).toBe(0)

  // Positionne le joueur Juste à côté du PNJ (<150px) via setInput directionnel
  // sur ~6s de sim + intervals réels (pour que Phaser.time.now avance).
  // On avance par petits incréments pour que le rAF batte entre chaque tick.
  const npcX = npc0.x
  const npcY = npc0.y

  const bubblesAfter = await page.evaluate(
    ({ tx, ty }: { tx: number; ty: number }) => {
      return new Promise<number>((resolve) => {
        let ticks = 0
        // 80 ticks × 100ms = 8s de sim + 40ms réels entre chaque → temps Phaser avance.
        const iv = setInterval(() => {
          const g = window.__GAME__
          if (g === undefined) { clearInterval(iv); resolve(0); return }

          const state = g.getState()
          // Dégeler un level-up si nécessaire.
          if (state.pendingLevelUp !== null && state.pendingLevelUp !== undefined) {
            g.chooseUpgrade(0)
          }

          const p = state.players[0]
          if (p !== undefined) {
            // Direction vers le PNJ.
            const dx = tx - p.x
            const dy = ty - p.y
            const dist = Math.hypot(dx, dy)
            if (dist > 5) {
              g.setInput(1, { move: { x: dx / dist, y: dy / dist }, attack: false })
            } else {
              g.setInput(1, { move: { x: 0, y: 0 }, attack: false })
            }
          }
          g.advanceTime(100)
          ticks++

          // Vérifie si une bulle est apparue.
          const bubbles = g.debugActiveBubbles?.() ?? 0
          if (bubbles > 0 || ticks >= 80) {
            clearInterval(iv)
            resolve(bubbles)
          }
        }, 40)
      })
    },
    { tx: npcX, ty: npcY }
  )

  // Au moins une bulle doit avoir été déclenchée.
  expect(bubblesAfter).toBeGreaterThan(0)
})

test('PNJ d\'ambiance : max 2 bulles simultanées (pool borné)', async ({ page }) => {
  // Mode plein — test du cap MAX_AMBIENT_BUBBLES = 2.
  await page.goto('/?autostart=solo&level=1&seed=3&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })

  await page.waitForTimeout(300)

  // Le PNJ doit exister pour que le test soit probant — son absence est un bug d'asset.
  const npcs = await page.evaluate(() => window.__GAME__?.debugAmbientNpcs?.())
  const npc0 = npcs?.[0]
  if (npc0 === undefined) {
    throw new Error('Aucun PNJ d\'ambiance chargé pour stage 01 — test de cap de bulles non probant')
  }

  // Rapproche le joueur du PNJ (même stratégie que le test 2 : setInput + advanceTime),
  // puis observe le compteur de bulles sur ~8s supplémentaires.
  // Le test doit réellement observer au moins 1 bulle (sinon il ne prouve rien),
  // ET jamais plus de 2 simultanément.
  const { maxBubbles, everHadBubble } = await page.evaluate(
    ({ tx, ty }: { tx: number; ty: number }) => {
      return new Promise<{ maxBubbles: number; everHadBubble: boolean }>((resolve) => {
        let max = 0
        let ticks = 0
        // Phase 1 (ticks 0..79) : marche vers le PNJ. Phase 2 (80..129) : reste sur place.
        const iv = setInterval(() => {
          const g = window.__GAME__
          if (g === undefined) { clearInterval(iv); resolve({ maxBubbles: max, everHadBubble: max > 0 }); return }

          const state = g.getState()
          if (state.pendingLevelUp !== null && state.pendingLevelUp !== undefined) {
            g.chooseUpgrade(0)
          }

          if (ticks < 80) {
            // Phase 1 : marche vers le PNJ.
            const p = state.players[0]
            if (p !== undefined) {
              const dx = tx - p.x
              const dy = ty - p.y
              const dist = Math.hypot(dx, dy)
              if (dist > 5) {
                g.setInput(1, { move: { x: dx / dist, y: dy / dist }, attack: false })
              } else {
                g.setInput(1, { move: { x: 0, y: 0 }, attack: false })
              }
            }
          }

          g.advanceTime(100)
          const bubbles = g.debugActiveBubbles?.() ?? 0
          if (bubbles > max) { max = bubbles }
          ticks++
          if (ticks >= 130) { clearInterval(iv); resolve({ maxBubbles: max, everHadBubble: max > 0 }) }
        }, 40)
      })
    },
    { tx: npc0.x, ty: npc0.y }
  )

  // Le test doit avoir observé au moins 1 bulle (sinon il ne prouve rien du tout).
  expect(everHadBubble, 'Aucune bulle déclenchée — le test ne prouve pas le cap').toBe(true)
  // Et jamais plus de MAX_AMBIENT_BUBBLES = 2 simultanées.
  expect(maxBubbles).toBeLessThanOrEqual(2)
})
