import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalZoneCenters } from '@content/stageLayoutMetrics'
import { parseLayout } from '@/editor/StageLayoutSchema'

function zoneTargets(stageId: string, spawn: { x: number; y: number }): Array<{ id: 'B' | 'C' | 'D' | 'E'; x: number; y: number }> {
  const raw = readFileSync(join(process.cwd(), 'src', 'content', 'layouts', `${stageId}.json`), 'utf8')
  const parsed = parseLayout(raw, stageId)
  if (parsed.layout === undefined) {throw new Error(`${stageId}: composition invalide: ${parsed.error ?? 'layout absent'}`)}
  const centers = canonicalZoneCenters(parsed.layout)
  return (['B', 'C', 'D', 'E'] as const).map((id) => {
    const dx = centers[id].x - centers.A.x
    const dy = centers[id].y - centers.A.y
    const distance = Math.hypot(dx, dy)
    return {
      id,
      x: spawn.x + dx - (dx / distance) * 220,
      y: spawn.y + dy - (dy / distance) * 220,
    }
  })
}

const STAGES = [
  [2, 'terrassement'],
  [3, 'fondations'],
  [4, 'reseaux_enterres'],
  [5, 'gros_oeuvre'],
  [6, 'echafaudages'],
  [7, 'charpente_toiture'],
  [8, 'second_oeuvre'],
  [9, 'finitions'],
  [10, 'livraison_audit'],
] as const

test.describe('stages composés 02 à 10', () => {
  for (const [level, stageId] of STAGES) {
    test(`${stageId} boote avec la bonne caméra et le joueur peut partir dans quatre directions`, async ({ page }, testInfo) => {
      await page.goto(`/?autostart=solo&level=${level}&seed=42&test=1&lite=1&intro=0`)
      await page.waitForFunction(() => window.__GAME__?.ready === true)

      const initial = await page.evaluate(() => window.__GAME__?.getState())
      expect(initial?.scene).toBe('game')
      expect(initial?.stageId).toBe(stageId)
      expect(initial?.players[0]).toBeDefined()
      await page.evaluate(() => window.__GAME__?.advanceTime(500))
      const camera = await page.evaluate(() => window.__GAME__?.debugCameraInfo?.())
      const player = await page.evaluate(() => window.__GAME__?.getState().players[0])
      // Le zoom 0,8 est l'étalon du viewport Desktop Chrome 1280×720.
      // Le projet mobile garde le contrat de reachability, avec son zoom responsive propre.
      if (testInfo.project.name === 'chromium') {
        expect(camera?.zoom).toBeGreaterThanOrEqual(0.78)
        expect(camera?.zoom).toBeLessThanOrEqual(0.82)
      }
      expect(Math.abs((camera?.cx ?? 0) - (player?.x ?? 0))).toBeLessThan(40)
      expect(Math.abs((camera?.cy ?? 0) - (player?.y ?? 0))).toBeLessThan(40)

      for (const direction of [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ]) {
        const before = await page.evaluate(() => window.__GAME__?.getState().players[0])
        await page.evaluate((move) => {
          window.__GAME__?.setInput(1, { move, attack: false })
          window.__GAME__?.advanceTime(350)
          window.__GAME__?.setInput(1, { move: { x: 0, y: 0 }, attack: false })
        }, direction)
        const after = await page.evaluate(() => window.__GAME__?.getState().players[0])
        expect(before).toBeDefined()
        expect(after).toBeDefined()
        if (direction.x !== 0) {
          expect(((after?.x ?? 0) - (before?.x ?? 0)) * direction.x).toBeGreaterThan(20)
        } else {
          expect(((after?.y ?? 0) - (before?.y ?? 0)) * direction.y).toBeGreaterThan(20)
        }
      }

      const spawnPlayer = initial?.players[0]
      expect(spawnPlayer).toBeDefined()
      const targets = zoneTargets(stageId, { x: spawnPlayer?.x ?? 0, y: spawnPlayer?.y ?? 0 })
      expect(targets).toHaveLength(4)

      for (const target of targets) {
        // Chaque cible repart d'un boot propre : aucun déplacement/loot précédent
        // ne peut rendre un couloir artificiellement plus ou moins praticable.
        await page.goto(`/?autostart=solo&level=${level}&seed=42&test=1&lite=1&intro=0`)
        await page.waitForFunction(() => window.__GAME__?.ready === true)
        const result = await page.evaluate((worldTarget) => {
          const game = window.__GAME__
          if (game === undefined) {return { reached: false, steps: 0 }}
          for (let step = 0; step < 80; step += 1) {
            const state = game.getState()
            if (state.screen === 'upgrade') {
              game.chooseUpgrade(0)
              continue
            }
            const current = state.players[0]
            if (current === undefined || !current.alive) {return { reached: false, steps: step }}
            const dx = worldTarget.x - current.x
            const dy = worldTarget.y - current.y
            const distance = Math.hypot(dx, dy)
            if (distance <= 120) {return { reached: true, steps: step }}
            game.setInput(1, { move: { x: dx / distance, y: dy / distance }, attack: false })
            game.advanceTime(200)
          }
          return { reached: false, steps: 80 }
        }, target)
        expect(result.reached, `${stageId}: trajet vers ${target.id}`).toBe(true)
        expect(result.steps, `${stageId}: étapes vers ${target.id}`).toBeLessThan(80)
      }
    })
  }

  test('les neuf compositions créent leurs sprites et leurs travailleurs explicites', async ({ page }) => {
    test.setTimeout(180_000)
    for (const [level, stageId] of STAGES) {
      await page.goto(`/?autostart=solo&level=${level}&seed=42&test=1&intro=0`)
      await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 60_000 })
      await page.evaluate(() => window.__GAME__?.advanceTime(500))
      const diagnostics = await page.evaluate(() => ({
        state: window.__GAME__?.getState(),
        site: window.__GAME__?.debugSiteInfo?.(),
        workers: window.__GAME__?.debugWorkers?.(),
      }))
      expect(diagnostics.state?.stageId).toBe(stageId)
      expect(diagnostics.site?.spriteCount ?? 0, `${stageId}: aucun sprite de composition`).toBeGreaterThan(86)
      expect(diagnostics.workers?.count ?? 0, `${stageId}: aucun PNJ/chemin explicite`).toBeGreaterThanOrEqual(3)
    }
  })

  test('la caméra coop reste centrée sur les quatre joueurs avec le zoom responsive', async ({ page }, testInfo) => {
    await page.goto('/?autostart=coop4&level=2&seed=42&test=1&lite=1&intro=0')
    await page.waitForFunction(() => window.__GAME__?.ready === true)
    await page.evaluate(() => window.__GAME__?.advanceTime(500))

    await expect.poll(async () => page.evaluate(() => {
      const state = window.__GAME__?.getState()
      const camera = window.__GAME__?.debugCameraInfo?.()
      const alive = state?.players.filter((player) => player.alive) ?? []
      const cx = alive.reduce((sum, player) => sum + player.x, 0) / alive.length
      const cy = alive.reduce((sum, player) => sum + player.y, 0) / alive.length
      return Math.max(Math.abs((camera?.cx ?? 0) - cx), Math.abs((camera?.cy ?? 0) - cy))
    }), { timeout: 5_000 }).toBeLessThan(20)

    const snapshot = await page.evaluate(() => window.__GAME__?.debugCameraInfo?.())
    if (testInfo.project.name === 'chromium') {
      expect(snapshot?.zoom).toBeGreaterThanOrEqual(0.78)
      expect(snapshot?.zoom).toBeLessThanOrEqual(0.82)
    }
  })
})
