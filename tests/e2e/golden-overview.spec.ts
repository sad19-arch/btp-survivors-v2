import { test, expect } from '@playwright/test'

/**
 * Capture de VALIDATION (golden batch) — vue d'ensemble de l'arène composée du
 * stage 02 (terrassement). Dézoome la caméra et force le peuplement des chunks
 * pour voir la COMPOSITION (secteurs excavation/déblais/engins + landmarks
 * scriptés) plutôt que le petit cadre de spawn. Pur outil de revue visuelle.
 */
test('golden overview — arène composée stage 02', async ({ page }) => {
  await page.goto('/?autostart=solo&level=2&seed=1&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  // Laisse le monde se poser.
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) {
      window.__GAME__?.advanceTime(100)
    }
  })

  // Dézoome et centre sur l'arène, puis force le streamer à peupler la vue élargie.
  await page.evaluate(() => {
    const g = (window as unknown as {
      __PHASER_GAME__?: {
        scene: { getScene: (k: string) => unknown }
      }
    }).__PHASER_GAME__
    if (g === undefined) { return }
    const scene = g.scene.getScene('game') as {
      cameras: { main: { setZoom: (z: number) => void; centerOn: (x: number, y: number) => void } }
      decorStreamer?: { update: (cam: unknown) => void }
    }
    const cam = scene.cameras.main
    cam.setZoom(0.3)
    cam.centerOn(5120, 3840) // centre du monde 10240×7680
    // Plusieurs passes pour couvrir la marge de chunks au zoom arrière.
    for (let i = 0; i < 6; i++) {
      scene.decorStreamer?.update(cam)
    }
  })
  await page.waitForTimeout(400)

  await page.screenshot({ path: 'test-results/golden-stage02-overview.png' })

  // Vue centrée sur le PRISONNIER pour vérifier le dégagement (pas de décor dessus).
  const pr = await page.evaluate(() => {
    const st = window.__GAME__?.getState()
    const p = st?.prisoners?.[0]
    return p !== undefined ? { x: p.x, y: p.y } : null
  })
  if (pr !== null) {
    await page.evaluate((pos: { x: number; y: number }) => {
      const g = (window as unknown as { __PHASER_GAME__?: { scene: { getScene: (k: string) => unknown } } }).__PHASER_GAME__
      const scene = g?.scene.getScene('game') as {
        cameras: { main: { setZoom: (z: number) => void; centerOn: (x: number, y: number) => void } }
        decorStreamer?: { update: (cam: unknown) => void }
      } | undefined
      if (scene === undefined) { return }
      const cam = scene.cameras.main
      cam.setZoom(0.7)
      cam.centerOn(pos.x, pos.y)
      for (let i = 0; i < 6; i++) { scene.decorStreamer?.update(cam) }
    }, pr)
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'test-results/golden-stage02-prisoner.png' })
  }
  expect(true).toBe(true)
})
