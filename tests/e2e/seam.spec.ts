import { test, expect } from '@playwright/test'

/**
 * Tier-2 : on pilote le VRAI jeu (Phaser dans le navigateur) via le seam JSON,
 * pas par les pixels. Headless. Déterministe (seed + advanceTime).
 */

test('le seam pilote le joueur et avance le temps de façon déterministe', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const s0 = await page.evaluate(() => window.__GAME__?.getState())
  expect(s0?.scene).toBe('game')
  expect(s0?.players.length).toBe(1)
  const x0 = s0?.players[0]?.x ?? 0

  await page.evaluate(() => {
    window.__GAME__?.setInput(1, { move: { x: 1, y: 0 }, attack: false })
  })
  await page.evaluate(() => {
    window.__GAME__?.advanceTime(1000)
  })

  const s1 = await page.evaluate(() => window.__GAME__?.getState())
  expect(s1?.players[0]?.x ?? 0).toBeGreaterThan(x0)
  expect(s1?.elapsedMs ?? 0).toBeGreaterThan(0)
})

test('des ennemis apparaissent au fil du temps (via le seam)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=3&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.evaluate(() => {
    // Assez pour couvrir la 1re vague quelle que soit la rampe de spawn (intervalle de départ data-driven).
    window.__GAME__?.advanceTime(5000)
  })
  const s = await page.evaluate(() => window.__GAME__?.getState())
  expect(s?.enemies.length ?? 0).toBeGreaterThan(0)
})

test('le joueur tue des ennemis via le seam (le score monte)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  // Les ennemis spawnent à l'anneau lointain hors-écran (TUN-2) : il leur faut le
  // temps de converger sur le joueur immobile pour se faire tuer par l'arme auto.
  // 25 s de sim (mode lite = rapide) garantit des kills → le score monte.
  await page.evaluate(() => {
    window.__GAME__?.advanceTime(25000)
  })
  const s = await page.evaluate(() => window.__GAME__?.getState())
  expect(s?.score ?? 0).toBeGreaterThan(0)
})

test('déterminisme: même seed + mêmes inputs ⇒ même état final', async ({ page }) => {
  const run = async (): Promise<unknown> => {
    await page.goto('/?autostart=solo&seed=7&test=1&lite=1')
    await page.waitForFunction(() => window.__GAME__?.ready === true)
    await page.evaluate(() => {
      window.__GAME__?.setInput(1, { move: { x: 1, y: 0.5 }, attack: false })
    })
    await page.evaluate(() => {
      window.__GAME__?.advanceTime(2000)
    })
    return page.evaluate(() => window.__GAME__?.getState())
  }
  const a = await run()
  const b = await run()
  expect(a).toEqual(b)
})

test('le titre se navigue à la manette/clavier (via le seam) et lance la partie', async ({ page }) => {
  // Sans autostart → on arrive sur l'écran titre.
  await page.goto('/?seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const title = await page.evaluate(() => window.__GAME__?.getState())
  expect(title?.screen).toBe('title')
  expect(title?.menu?.items.length).toBeGreaterThanOrEqual(1)

  // Navigue puis valide « Jouer » → ouvre la sélection de personnage (solo, 1 joueur).
  await page.evaluate(() => {
    window.__GAME__?.nav('down')
    window.__GAME__?.nav('up')
    window.__GAME__?.confirm()
  })
  const picking = await page.evaluate(() => window.__GAME__?.getState())
  expect(picking?.screen).toBe('characterSelect')
  expect(picking?.characterSelect).toEqual({ player: 1, total: 1 })

  // Valide le personnage (par défaut du carrousel) → lance la partie.
  await page.evaluate(() => window.__GAME__?.confirm())
  const game = await page.evaluate(() => window.__GAME__?.getState())
  expect(game?.screen).toBe('game')
  expect(game?.players.length).toBe(1)
})

test('pause / reprise via le seam', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await page.evaluate(() => window.__GAME__?.pause())
  expect((await page.evaluate(() => window.__GAME__?.getState()))?.screen).toBe('paused')
  await page.evaluate(() => window.__GAME__?.resume())
  expect((await page.evaluate(() => window.__GAME__?.getState()))?.screen).toBe('game')
})

test('montée de niveau → écran upgrade, le choix relance la partie', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=123&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // Aspire les gemmes jusqu'à un level-up (le temps est gelé sur le choix).
  await page.evaluate(() => {
    const g = window.__GAME__
    if (g === undefined) {
      return
    }
    for (let t = 0; t < 120_000 && g.getState().screen !== 'upgrade'; t += 100) {
      const s = g.getState()
      const p = s.players[0]
      if (p !== undefined) {
        const targets = s.pickups.length > 0 ? s.pickups : s.enemies
        let tx = p.x
        let ty = p.y
        let bd = Infinity
        for (const it of targets) {
          const d = (it.x - p.x) ** 2 + (it.y - p.y) ** 2
          if (d < bd) {
            bd = d
            tx = it.x
            ty = it.y
          }
        }
        g.setInput(1, { move: { x: tx - p.x, y: ty - p.y }, attack: false })
      }
      g.advanceTime(100)
    }
  })

  const up = await page.evaluate(() => window.__GAME__?.getState())
  expect(up?.screen).toBe('upgrade')
  expect(up?.menu?.items.length).toBe(4)

  await page.evaluate(() => window.__GAME__?.confirm())
  expect((await page.evaluate(() => window.__GAME__?.getState()))?.screen).toBe('game')
})
