import { chromium } from 'playwright'

// Capture in-game d'un stage via le seam JSON (pas de pixels pilotés) :
// boot direct ?autostart&level=<phase>, pilote le bot « kite » (le seul qui
// survit jusqu'au climax) image par image DANS le navigateur, en levant les
// level-ups (sinon le temps gèle). Deux plans : « full » (sol+ennemis+engins,
// ~90s) et « boss » (on laisse le mini-boss, plus rapide, s'approcher). Preuve DA.
//
// Usage: node capture-stage.mjs <level=fondations> <seed=7> [baseUrl]
const [, , level = 'fondations', seedArg = '7', baseArg] = process.argv
const seed = Number(seedArg)
const base = baseArg ?? process.env.CAP_URL ?? 'http://localhost:3000'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.error('PAGEERR', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.error('CONSOLE', m.text())
})

await page.goto(`${base}/?autostart=solo&level=${level}&seed=${seed}&test=1`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 20000 })

// Pilote le kite (même stratégie que tools/sim/bots.ts) jusqu'à `untilMs` de
// temps écoulé, OU jusqu'à ce que `approach` soit vrai (boss proche). Monde
// 1600×1200 → centre (800,600). Recompute à chaque petit pas → survie fiable.
async function play(untilMs, approach) {
  return page.evaluate(
    ({ untilMs, approach }) => {
      const g = window.__GAME__
      const STEP = 120
      function kite(st) {
        const p = st.players[0]
        let nx = 0
        let ny = 0
        let bd = Infinity
        for (const e of st.enemies) {
          const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
          if (d < bd) {
            bd = d
            nx = p.x - e.x
            ny = p.y - e.y
          }
        }
        const cx = 800 - p.x
        const cy = 600 - p.y
        const edge = Math.hypot(cx, cy) > 500 ? 2 : 0
        return { x: nx + cx * edge, y: ny + cy * edge }
      }
      for (;;) {
        let st = g.getState()
        let guard = 0
        while (st.pendingLevelUp && guard++ < 40) {
          g.chooseUpgrade(0)
          st = g.getState()
        }
        const p = st.players[0]
        if (!p || !p.alive) return { stopped: 'dead', elapsed: st.elapsedMs }
        if (st.elapsedMs >= untilMs) {
          if (!approach) return { stopped: 'time', elapsed: st.elapsedMs }
          const boss = st.enemies.find((e) => e.isBoss)
          if (boss) {
            const dist = Math.hypot(boss.x - p.x, boss.y - p.y)
            if (dist < 480 || st.elapsedMs > untilMs + 60000) return { stopped: 'boss-near', elapsed: st.elapsedMs, dist: Math.round(dist) }
          } else if (st.elapsedMs > untilMs + 60000) {
            return { stopped: 'no-boss', elapsed: st.elapsedMs }
          }
        }
        g.setInput(1, { move: kite(st), attack: true })
        g.advanceTime(STEP)
      }
    },
    { untilMs, approach }
  )
}

function summary() {
  return page.evaluate(() => {
    const st = window.__GAME__.getState()
    const p = st.players[0]
    const boss = st.enemies.find((e) => e.isBoss)
    return {
      stageId: st.stageId,
      scene: st.scene,
      elapsed: Math.round(st.elapsedMs / 1000),
      enemies: st.enemies.length,
      alive: p?.alive,
      hp: Math.round(p?.hp ?? 0),
      level: p?.level,
      boss: boss ? { hp: Math.round(boss.hp), dx: Math.round(boss.x - p.x), dy: Math.round(boss.y - p.y) } : null
    }
  })
}

// Plan « full » ~90s : sol, ennemis skinnés, engins.
console.log('full  ', JSON.stringify(await play(90000, false)))
await page.waitForTimeout(400)
console.log('       ', JSON.stringify(await summary()))
await page.screenshot({ path: `ingame-${level}-full.png` })

// Plan « boss » : le mini-boss spawne à 5:00 ; on le laisse s'approcher.
console.log('boss  ', JSON.stringify(await play(302000, true)))
await page.waitForTimeout(400)
console.log('       ', JSON.stringify(await summary()))
await page.screenshot({ path: `ingame-${level}-boss.png` })

await browser.close()
