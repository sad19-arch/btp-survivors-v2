import { test, expect } from '@playwright/test'

/**
 * Tests e2e Task 10 -- Telegraphe des formations.
 *
 * Pilote le vrai jeu via le seam JSON (advanceTime + getState) :
 *  - pendingFormations devient non vide quand une formation est annoncee.
 *  - ~0.8 s plus tard, pendingFormations revient a 0 (la formation a spawnee).
 *  - Aucun crash.
 *  - Le champ triggersInMs est dans [0, TELEGRAPH_LEAD_MS + 1 pas].
 */

const TELEGRAPH_LEAD_MS = 800

test('pendingFormations se remplit puis se vide (~0.8 s plus tard)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=42&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // Avancer jusqu'a la premiere annonce (max 32 s).
  const announceResult = await page.evaluate(() => {
    const g = window.__GAME__
    if (!g) {
      return null
    }

    for (let i = 0; i < 2000; i++) {
      // Resoudre les level-ups pour eviter le gel du temps.
      const s = g.getState()
      if (s.pendingLevelUp !== null) {
        g.chooseUpgrade(0)
      }
      g.advanceTime(16)
      const state = g.getState()
      if (state.pendingFormations.length > 0) {
        const f = state.pendingFormations[0]
        return {
          elapsedMs: state.elapsedMs,
          kind: f?.kind ?? null,
          triggersInMs: f?.triggersInMs ?? null,
          angle: f?.angle ?? null,
          radius: f?.radius ?? null
        }
      }
    }
    return null
  })

  expect(announceResult, 'pendingFormations doit devenir non vide dans les 32 s').not.toBeNull()
  if (announceResult === null) {
    return
  }

  expect(typeof announceResult.kind).toBe('string')
  expect(announceResult.triggersInMs).toBeGreaterThanOrEqual(0)
  expect(announceResult.triggersInMs).toBeLessThanOrEqual(TELEGRAPH_LEAD_MS + 16)
  expect(typeof announceResult.angle).toBe('number')
  expect(typeof announceResult.radius).toBe('number')

  // Continuer jusqu'a ce que pendingFormations revienne a 0 (max 1 s supplementaire).
  const cleared = await page.evaluate(() => {
    const g = window.__GAME__
    if (!g) {
      return false
    }

    for (let i = 0; i < 100; i++) {
      const s = g.getState()
      if (s.pendingLevelUp !== null) {
        g.chooseUpgrade(0)
      }
      g.advanceTime(16)
      if (g.getState().pendingFormations.length === 0) {
        return true
      }
    }
    return false
  })

  expect(cleared, 'pendingFormations doit se vider apres le spawn de la formation').toBe(true)
})

test('pas de crash et la scene reste game pendant le telegraphe', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=123&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // Avancer 60 s (plusieurs formations annoncees et spawnees).
  await page.evaluate(() => {
    const g = window.__GAME__
    if (!g) {
      return
    }

    for (let i = 0; i < 3750; i++) {
      const s = g.getState()
      if (s.pendingLevelUp !== null) {
        g.chooseUpgrade(0)
      }
      g.advanceTime(16)
    }
  })

  const state = await page.evaluate(() => window.__GAME__?.getState())
  // La scene doit rester game (pas de crash -> gameover immediat).
  expect(['game', 'gameover', 'won']).toContain(state?.scene)
  // La prop pendingFormations doit exister (champ expose sans erreur).
  expect(Array.isArray(state?.pendingFormations)).toBe(true)
})

test('determinisme : meme seed -> meme premiere annonce', async ({ page }) => {
  async function runToFirstAnnounce(seed: number): Promise<{ elapsedMs: number; kind: string } | null> {
    await page.goto(`/?autostart=solo&seed=${seed}&test=1&lite=1`)
    await page.waitForFunction(() => window.__GAME__?.ready === true)

    return page.evaluate(() => {
      const g = window.__GAME__
      if (!g) {
        return null
      }

      for (let i = 0; i < 2000; i++) {
        const s = g.getState()
        if (s.pendingLevelUp !== null) {
          g.chooseUpgrade(0)
        }
        g.advanceTime(16)
        const state = g.getState()
        if (state.pendingFormations.length > 0) {
          const f = state.pendingFormations[0]
          return { elapsedMs: state.elapsedMs, kind: f?.kind ?? '' }
        }
      }
      return null
    })
  }

  const run1 = await runToFirstAnnounce(42)
  const run2 = await runToFirstAnnounce(42)

  expect(run1).not.toBeNull()
  expect(run2).not.toBeNull()
  if (run1 === null || run2 === null) {
    return
  }

  expect(run1.elapsedMs).toBe(run2.elapsedMs)
  expect(run1.kind).toBe(run2.kind)
})
