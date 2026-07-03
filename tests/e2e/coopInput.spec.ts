import { test, expect } from '@playwright/test'

interface Pos {
  x: number
  y: number
}

/** Accès indexé strict (noUncheckedIndexedAccess) : échoue vite et clairement si absent. */
function at(arr: Pos[], i: number): Pos {
  const p = arr[i]
  if (p === undefined) {
    throw new Error(`position manquante à l'index ${i}`)
  }
  return p
}

/**
 * Tier-2 (seam) : preuve bout-en-bout que le contrat d'input « par joueur »
 * ne s'effondre plus sur un seul joueur en coop. On pilote 4 joueurs avec des
 * directions distinctes via `setInput(playerId, …)` et on vérifie que chacun
 * se déplace de façon indépendante et cohérente avec l'input qu'il a reçu —
 * indépendamment de toute vraie manette physique (non testable en CI, voir
 * checklist manuelle dans le rapport de tâche).
 */

test('coop4: setInput par joueur pilote chaque joueur indépendamment (P1..P4)', async ({ page }) => {
  await page.goto('/?autostart=coop4&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const s0 = await page.evaluate(() => window.__GAME__?.getState())
  expect(s0?.scene).toBe('game')
  expect(s0?.players.length).toBe(4)

  // Formation en ligne au spawn : même y, x croissant (cx + i*40).
  const initial = s0?.players.map((p) => ({ x: p.x, y: p.y })) ?? []
  expect(initial.length).toBe(4)

  // Inputs distincts par joueur : P1 → +x, P2 → -x, P3 → +y, P4 → immobile.
  await page.evaluate(() => {
    const g = window.__GAME__
    g?.setInput(1, { move: { x: 1, y: 0 }, attack: false })
    g?.setInput(2, { move: { x: -1, y: 0 }, attack: false })
    g?.setInput(3, { move: { x: 0, y: 1 }, attack: false })
    g?.setInput(4, { move: { x: 0, y: 0 }, attack: false })
  })
  await page.evaluate(() => {
    window.__GAME__?.advanceTime(800)
  })

  const s1 = await page.evaluate(() => window.__GAME__?.getState())
  const final = s1?.players.map((p) => ({ x: p.x, y: p.y })) ?? []
  expect(final.length).toBe(4)

  // Aucun NaN / valeur aberrante (garde-fou invariant).
  for (const p of final) {
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
  }

  const [i1, i2, i3, i4] = [at(initial, 0), at(initial, 1), at(initial, 2), at(initial, 3)]
  const [f1, f2, f3, f4] = [at(final, 0), at(final, 1), at(final, 2), at(final, 3)]

  // P1 : se déplace vers +x.
  expect(f1.x).toBeGreaterThan(i1.x + 5)
  // P2 : se déplace vers -x (direction opposée à P1 → preuve d'indépendance).
  expect(f2.x).toBeLessThan(i2.x - 5)
  // P3 : se déplace vers +y (axe différent de P1/P2).
  expect(f3.y).toBeGreaterThan(i3.y + 5)
  // P4 : input nul → reste quasi immobile (tolérance large pour friction/inertie).
  expect(Math.abs(f4.x - i4.x)).toBeLessThan(10)
  expect(Math.abs(f4.y - i4.y)).toBeLessThan(10)

  // La preuve clé : les joueurs divergent les uns des autres (pas de collapse
  // sur un seul input partagé). P1 et P2 finissent avec des x très différents.
  expect(f1.x - f2.x).toBeGreaterThan(10)
  // P3 a bougé sur un axe différent de P1/P2 (delta y notable, delta x quasi nul).
  expect(Math.abs(f3.x - i3.x)).toBeLessThan(10)
})
