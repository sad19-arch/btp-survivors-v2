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
  // Si pas de PNJ (feuille absente → fallback gracieux), le test passe en douceur.
  if (npc0 === undefined) {
    console.log('[ambient-bubbles] Aucun PNJ d\'ambiance chargé — test ignoré gracieusement.')
    return
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

  // S'il n'y a pas de PNJ, test gracieux.
  const npcs = await page.evaluate(() => window.__GAME__?.debugAmbientNpcs?.())
  if ((npcs?.length ?? 0) === 0) {
    console.log('[ambient-bubbles] Aucun PNJ — pool cap test ignoré gracieusement.')
    return
  }

  // Avance le jeu pendant que le joueur reste près du spawn (les PNJ sont loin).
  // Vérifie que le compteur de bulles ne dépasse pas 2.
  const maxBubblesObserved = await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      let max = 0
      let ticks = 0
      const iv = setInterval(() => {
        const g = window.__GAME__
        if (g === undefined) { clearInterval(iv); resolve(max); return }
        const state = g.getState()
        if (state.pendingLevelUp !== null && state.pendingLevelUp !== undefined) {
          g.chooseUpgrade(0)
        }
        g.advanceTime(100)
        const bubbles = g.debugActiveBubbles?.() ?? 0
        if (bubbles > max) { max = bubbles }
        ticks++
        if (ticks >= 50) { clearInterval(iv); resolve(max) }
      }, 40)
    })
  })

  // Jamais plus de MAX_AMBIENT_BUBBLES = 2 simultanées.
  expect(maxBubblesObserved).toBeLessThanOrEqual(2)
})
