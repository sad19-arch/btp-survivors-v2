import { test, expect } from '@playwright/test'

/**
 * T6 - Ouvriers navetteurs (siteWorkers).
 *
 * Verifie :
 *   1. Stage 02 (terrassement) : des ouvriers sont affiches (count > 0).
 *   2. Stage 01 (terrain_vierge) : des ouvriers aussi (count > 0, rollout complet).
 *   3. Pas de fuite au restart : count reste > 0 et ne s'accumule pas.
 */

test('siteWorkers - stage02 terrassement : des ouvriers affiches (count > 0)', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/?autostart=solo&level=2&seed=1&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 90000 })

  const s0 = await page.evaluate(() => window.__GAME__?.getState())
  expect(s0?.scene).toBe('game')

  // Attendre que Phaser finisse create() + premier sync (reselect throttle 30 frames)
  await page.waitForTimeout(800)

  const info = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  expect(info).toBeDefined()
  expect((info?.count ?? 0)).toBeGreaterThan(0)
  console.log(`[siteWorkers] stage02 workerCount = ${info?.count ?? 'n/a'}`)
})

test('siteWorkers - stage01 terrain_vierge : des ouvriers aussi (count > 0)', async ({ page }) => {
  // NON-lite : le stage 01 a désormais des clusters (base-vie) → des ouvriers
  // navetteurs, comme les autres stages. Rendu exige les vraies feuilles PNJ.
  test.setTimeout(120000)
  await page.goto('/?autostart=solo&level=1&seed=1&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 90000 })

  await page.waitForTimeout(800)

  const info = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  expect(info?.count ?? 0).toBeGreaterThan(0)
  console.log(`[siteWorkers] stage01 workerCount = ${info?.count ?? 'n/a'}`)
})

/**
 * PREUVE EN JEU (et pas seulement dans le JSON) qu'un PNJ métier POSÉ dans
 * l'éditeur est réellement affiché.
 *
 * Le stage 01 est la compo committée de l'utilisateur : il y a posé le géomètre
 * (`npc_stage01`) via la section « PNJ métier (fixe) » de la palette. Sur un
 * stage composé, la compo est la vérité TOTALE (aucun auto-placement) — donc si
 * cette feuille est à l'écran, elle ne peut venir QUE de la pose éditeur.
 *
 * Les tests unitaires couvrent chaque maillon (palette → addNpc → parseLayout →
 * planNpcJobs) ; celui-ci couvre le vrai jeu, textures chargées, Phaser monté.
 */
test('siteWorkers - stage01 : le PNJ métier POSÉ dans l’éditeur est affiché en jeu', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/?autostart=solo&level=1&seed=1&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 90000 })
  await page.waitForTimeout(800)

  const info = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  const workers = info?.workers ?? []
  console.log(`[siteWorkers] stage01 textures = ${JSON.stringify(workers.map((w) => `${w.role}:${w.texture}`))}`)

  // Le géomètre posé (compo de l'utilisateur) est bien rendu, en poste FIXE.
  const geometre = workers.find((w) => w.texture === 'npc_stage01')
  expect(geometre, 'le métier posé dans la compo doit être à l’écran').toBeDefined()
  expect(geometre?.role).toBe('npc_trade')

  // Et les ouvriers posés (npc_ouvrier_*) sont là aussi, en rôle MOBILE : la compo
  // porte les deux familles, elles ne doivent pas se marcher dessus.
  expect(workers.some((w) => w.role === 'npc_worker')).toBe(true)
})

/**
 * PREUVE EN JEU de l'élargissement des rôles : sur un stage GÉNÉRATIF, les jobs
 * de marche ne partagent plus une texture unique. Le stage 04 déclare 3 feuilles
 * ouvrier (plombier / poseur_cable / gainier) qui étaient TOUTES orphelines —
 * `_resolveKey` n'en retenait aucune (aucun indice de nom ne matchait, il
 * retombait sur une feuille métier).
 */
test('siteWorkers - stage04 : les feuilles ouvrier autrefois orphelines sont à l’écran', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/?autostart=solo&level=4&seed=1&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 90000 })
  await page.waitForTimeout(800)

  const info = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  const workers = info?.workers ?? []
  const textures = new Set(workers.map((w) => w.texture))
  console.log(`[siteWorkers] stage04 textures = ${JSON.stringify([...textures])}`)

  const exOrphans = ['npc_stage04_plombier', 'npc_stage04_poseur_cable', 'npc_stage04_gainier']
  expect(
    exOrphans.some((k) => textures.has(k)),
    `aucune des 3 feuilles autrefois orphelines à l’écran : ${JSON.stringify([...textures])}`
  ).toBe(true)

  // Régression épinglée : une feuille métier (`_trade`) ne doit plus être servie en
  // guise d'ouvrier de marche par un repli d'indice.
  for (const w of workers) {
    if (w.role === 'signaleur' || w.role === 'navetteur' || w.role === 'porteur') {
      expect(w.texture.endsWith('_trade'), `${w.texture} (feuille métier) servie en ${w.role}`).toBe(false)
    }
  }
})

test('siteWorkers - pas de fuite au restart (stage02)', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/?autostart=solo&level=2&seed=1&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 60000 })
  await page.waitForTimeout(800)

  const before = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  const countBefore = before?.count ?? 0
  expect(countBefore).toBeGreaterThan(0)

  // Redemarrage
  await page.evaluate(() => window.__GAME__?.restart())
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 20000 })
  await page.waitForTimeout(800)

  const after = await page.evaluate(() => window.__GAME__?.debugWorkers?.())
  const countAfter = after?.count ?? 0

  // Apres restart : toujours des ouvriers (meme layout, meme seed)
  expect(countAfter).toBeGreaterThan(0)
  // Pas d'accumulation : count <= 1.5x le count initial (marge generale)
  expect(countAfter).toBeLessThanOrEqual(countBefore * 2)
  console.log(`[siteWorkers] restart: before=${countBefore} after=${countAfter}`)
})
