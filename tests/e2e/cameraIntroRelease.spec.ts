import { test, expect, type Page } from '@playwright/test'
import { computeViewport, type RawViewportInputs } from '../../src/ui/viewport'

interface CameraSnapshot {
  zoom: number
  scrollX: number
  scrollY: number
  following: boolean
}

async function cameraSnapshot(page: Page): Promise<CameraSnapshot> {
  return page.evaluate(() => {
    const game = (window as unknown as {
      __PHASER_GAME__: {
        scene: {
          getScene: (key: string) => {
            cameras: {
              main: {
                zoom: number
                scrollX: number
                scrollY: number
                _follow: unknown
              }
            }
          }
        }
      }
    }).__PHASER_GAME__
    const camera = game.scene.getScene('game').cameras.main
    return {
      zoom: camera.zoom,
      scrollX: camera.scrollX,
      scrollY: camera.scrollY,
      following: camera._follow !== null,
    }
  })
}

async function assertPlayerCamera(page: Page): Promise<void> {
  await expect.poll(async () => (await cameraSnapshot(page)).following).toBe(true)
  const raw = await page.evaluate((): RawViewportInputs => ({
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    vvW: window.visualViewport?.width ?? null,
    vvH: window.visualViewport?.height ?? null,
    pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
    dpr: window.devicePixelRatio,
    fullscreen: document.fullscreenElement !== null,
    safe: { t: 0, r: 0, b: 0, l: 0 },
  }))
  const expectedZoom = computeViewport(raw).cameraZoom
  await expect.poll(async () => (await cameraSnapshot(page)).zoom).toBeCloseTo(expectedZoom, 1)
}

test('la caméra rend le suivi joueur après l’intro du stage 2, y compris à la deuxième partie', async ({ page }) => {
  await page.goto('/?autostart=solo&level=2&seed=42&test=1&intro=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => window.__GAME__?.advanceTime(500))
  await page.evaluate(() => window.__GAME__?.advanceTime(7_000))
  await expect.poll(async () => page.evaluate(() => window.__GAME__?.getState().introActive)).toBe(false)
  await assertPlayerCamera(page)

  const firstRunId = await page.evaluate(() => window.__GAME__?.getState().runId ?? -1)
  await page.evaluate(() => window.__GAME__?.restart())
  await page.waitForFunction((runId) => (window.__GAME__?.getState().runId ?? -1) > runId, firstRunId)

  await page.evaluate(() => window.__GAME__?.advanceTime(500))
  await page.evaluate(() => {
    window.__GAME__?.skipIntro()
    window.__GAME__?.advanceTime(20)
  })
  await assertPlayerCamera(page)

  const beforeMove = await cameraSnapshot(page)
  await page.evaluate(() => {
    window.__GAME__?.setInput(1, { move: { x: 1, y: 0 }, attack: false })
    window.__GAME__?.advanceTime(1_000)
  })
  await expect.poll(async () => (await cameraSnapshot(page)).scrollX).toBeGreaterThan(beforeMove.scrollX)
})
