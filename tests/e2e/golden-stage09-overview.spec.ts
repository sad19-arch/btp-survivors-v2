import { test, expect } from '@playwright/test'

/**
 * Capture de VALIDATION — vue d'ensemble de l'arène composée du
 * stage 09 (finitions). Dézoome la caméra et force le peuplement des chunks
 * pour voir la COMPOSITION (station peinture NE / pièces finies arc O-SO /
 * landmark coin fini Nord) plutôt que le petit cadre de spawn.
 */
test('golden overview — arène composée stage 09 finitions', async ({ page }) => {
  await page.goto('/?autostart=solo&level=9&seed=1&test=1')
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

  await page.screenshot({ path: 'test-results/golden-stage09-overview.png' })
  expect(true).toBe(true)
})
