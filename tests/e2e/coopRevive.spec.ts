import { test, expect } from '@playwright/test'

/**
 * Relève co-op de bout en bout, dans le VRAI jeu (pas un appel direct au système) :
 * J2 à terre + J1 vivant à portée qui MAINTIENT l'action → J2 se relève.
 * Couvre toute la chaîne : seam → App.setInput → Simulation → reviveSystem.
 * Les tests unitaires appellent `reviveSystem` directement et ne prouvent donc PAS
 * que l'input `action` arrive jusqu'au système.
 */

const HOLD = { move: { x: 0, y: 0 }, attack: false, action: true }
const IDLE = { move: { x: 0, y: 0 }, attack: false, action: false }

async function bootCoop(page: import('@playwright/test').Page) {
  await page.goto('/?autostart=coop&seed=11&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
}

test('J1 maintient l’action près de J2 à terre → J2 est relevé à 50 % PV', async ({ page }) => {
  await bootCoop(page)

  const downed = await page.evaluate(() => {
    window.__GAME__?.debugKillPlayer(2)
    window.__GAME__?.advanceTime(100)
    const s = window.__GAME__?.getState()
    return { hp: s?.players[1]?.hp, alive: s?.players[1]?.alive, screen: s?.screen }
  })
  // Un seul joueur à terre ne doit PAS finir la partie (sinon aucune fenêtre de relève).
  expect(downed.hp).toBe(0)
  expect(downed.screen).toBe('game')

  // J1 maintient l'action (ils spawnent à 40 px : dans le rayon de 80 px).
  const revived = await page.evaluate(
    ({ hold }) => {
      for (let i = 0; i < 40; i++) {
        window.__GAME__?.setInput(1, hold)
        window.__GAME__?.advanceTime(100) // 40 × 100 ms = 4 s > fillSeconds (3 s)
      }
      const s = window.__GAME__?.getState()
      return { hp: s?.players[1]?.hp, maxHp: s?.players[1]?.maxHp, alive: s?.players[1]?.alive }
    },
    { hold: HOLD }
  )

  expect(revived.hp).toBeGreaterThan(0)
  expect(revived.hp).toBeCloseTo((revived.maxHp ?? 0) * 0.5, 0) // REVIVE.hpFraction
  expect(revived.alive).toBe(true)
})

test('sans maintien de l’action, J2 reste à terre (le progrès retombe)', async ({ page }) => {
  await bootCoop(page)

  const still = await page.evaluate(
    ({ idle }) => {
      window.__GAME__?.debugKillPlayer(2)
      for (let i = 0; i < 40; i++) {
        window.__GAME__?.setInput(1, idle)
        window.__GAME__?.advanceTime(100)
      }
      const s = window.__GAME__?.getState()
      return { hp: s?.players[1]?.hp, screen: s?.screen }
    },
    { idle: IDLE }
  )

  expect(still.hp).toBe(0)
  expect(still.screen).toBe('game')
})

test('hors de portée, le maintien ne relève pas', async ({ page }) => {
  await bootCoop(page)

  const far = await page.evaluate(
    ({ hold, idle }) => {
      window.__GAME__?.debugKillPlayer(2)
      // J1 s'éloigne bien au-delà du rayon de relève (REVIVE.radius = 130 px).
      for (let i = 0; i < 40; i++) {
        window.__GAME__?.setInput(1, { ...idle, move: { x: 1, y: 0 } })
        window.__GAME__?.advanceTime(100)
      }
      const mid = window.__GAME__?.getState()
      const dx = Math.abs((mid?.players[0]?.x ?? 0) - (mid?.players[1]?.x ?? 0))
      // Puis il maintient l'action, mais trop loin.
      for (let i = 0; i < 40; i++) {
        window.__GAME__?.setInput(1, hold)
        window.__GAME__?.advanceTime(100)
      }
      const s = window.__GAME__?.getState()
      return { dx, hp: s?.players[1]?.hp }
    },
    { hold: HOLD, idle: IDLE }
  )

  expect(far.dx).toBeGreaterThan(130) // vraiment hors rayon (REVIVE.radius)
  expect(far.hp).toBe(0)
})
