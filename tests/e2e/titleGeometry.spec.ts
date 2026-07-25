import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { width: 1024, height: 640 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 1200, height: 500 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 851, height: 393 },
  { width: 915, height: 412 }
]

type Box = { x: number; y: number; width: number; height: number }

function isInside(box: Box, viewport: { width: number; height: number }): boolean {
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

async function waitForStableTitle(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__GAME__?.ready === true, undefined, { timeout: 60000 })
  await page.waitForFunction(() => document.fonts.status === 'loaded')
  await expect(page.locator('.splash')).toHaveCount(0)
  await expect(page.locator('#ui-root')).not.toHaveClass(/arc-slam/)
  await expect(page.locator('.title-composition')).toBeVisible()
}

test('titre : géométrie complète et jouable sur tous les viewports paysage', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  await page.addInitScript(() => localStorage.setItem('btp:fullscreen_settings_v1', JSON.stringify({ preference: 'windowed' })))
  await page.goto('/?test=1&lite=1')
  await waitForStableTitle(page)

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.waitForFunction(() => document.fonts.status === 'loaded')

    const title = page.locator('.title-composition')
    const safe = page.locator('.title-safe')
    await expect(title).toBeVisible()
    await expect(safe).toBeVisible()
    await expect(page.locator('.logo__btp')).toHaveText('BTP')
    await expect(page.locator('.logo__carnage')).toHaveText('CARNAGE')
    await expect(page.locator('.panel--title .panel__subtitle')).toBeVisible()
    await expect(page.locator('.panel--title .hint-line')).toBeVisible()
    await expect(page.locator('.panel--title .menu__item')).toHaveCount(7)
    await expect(page.locator('.panel--title .stage-progress__stars')).toBeVisible()

    const geometry = await page.evaluate(() => {
      const box = (selector: string): Box | null => {
        const element = document.querySelector<HTMLElement>(selector)
        if (element === null || getComputedStyle(element).display === 'none') {
          return null
        }
        const rect = element.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }
      const menuItems = Array.from(document.querySelectorAll<HTMLElement>('.panel--title .menu__item')).map((element) => {
        const rect = element.getBoundingClientRect()
        const size = Number.parseFloat(getComputedStyle(element).fontSize)
        const scale = Number.parseFloat(getComputedStyle(document.getElementById('ui-root') as HTMLElement).getPropertyValue('--title-scale'))
        return { box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, renderedFontSize: size * scale }
      })
      return {
        title: box('.title-composition'),
        safe: box('.title-safe'),
        logoBtp: box('.logo__btp'),
        logoCarnage: box('.logo__carnage'),
        subtitle: box('.panel--title .panel__subtitle'),
        hint: box('.panel--title .hint-line'),
        panel: box('.panel--title'),
        arcbar: box('.arcbar'),
        chrome: box('.title-chrome'),
        menuItems,
        scrollable: document.documentElement.scrollHeight > window.innerHeight || document.documentElement.scrollWidth > window.innerWidth
      }
    })

    expect(geometry.safe).not.toBeNull()
    expect(geometry.title).not.toBeNull()
    expect(isInside(geometry.safe as Box, viewport)).toBe(true)
    expect(isInside(geometry.title as Box, viewport), `title ${JSON.stringify(geometry.title)} safe ${JSON.stringify(geometry.safe)} exceeds ${JSON.stringify(viewport)}`).toBe(true)
    for (const required of [geometry.logoBtp, geometry.logoCarnage, geometry.subtitle, geometry.hint]) {
      expect(required).not.toBeNull()
      expect(isInside(required as Box, viewport)).toBe(true)
    }
    for (const item of geometry.menuItems) {
      expect(isInside(item.box, viewport)).toBe(true)
      expect(item.renderedFontSize).toBeGreaterThanOrEqual(12)
    }
    expect(geometry.scrollable).toBe(false)
    expect(geometry.panel).not.toBeNull()
    if (geometry.arcbar !== null) {
      expect(overlaps(geometry.panel as Box, geometry.arcbar)).toBe(false)
    }
    if (geometry.chrome !== null) {
      expect(overlaps(geometry.panel as Box, geometry.chrome)).toBe(false)
    }

    const menuState = await page.evaluate(() => window.__GAME__?.getState().menu)
    for (let index = 0; index < (menuState?.items.length ?? 0) - (menuState?.index ?? 0); index++) {
      await page.evaluate(() => window.__GAME__?.nav('down'))
    }
    for (let index = 0; index < 6; index++) {
      await page.evaluate(() => window.__GAME__?.nav('down'))
    }
    const focused = page.locator('.panel--title .menu__item--focus')
    await expect(focused).toHaveText(/Éditeur de niveaux/)
    const focusBox = await focused.boundingBox()
    expect(focusBox).not.toBeNull()
    expect(isInside(focusBox as Box, viewport)).toBe(true)

    await page.screenshot({ path: `test-results/title-geometry-${testInfo.project.name}-${viewport.width}x${viewport.height}.png` })
  }
})

test('titre compact : le stage verrouillé reste lisible sans chevauchement', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 })
  await page.addInitScript(() => {
    localStorage.removeItem('btp:stage_progress_v1')
    localStorage.setItem('btp:fullscreen_settings_v1', JSON.stringify({ preference: 'windowed' }))
  })
  await page.goto('/?lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, undefined, { timeout: 60000 })
  await page.locator('.splash').click({ force: true })
  await expect(page.locator('.splash')).toHaveCount(0, { timeout: 15000 })
  await page.waitForFunction(() => document.fonts.status === 'loaded')
  await expect(page.locator('#ui-root')).not.toHaveClass(/arc-slam/)

  await page.evaluate(() => {
    const game = window.__GAME__
    if (game === undefined) {
      return
    }
    for (let step = 0; step < 10; step++) {
      const state = game.getState()
      if (state.menu?.items[state.menu.index]?.id === 'stage') {
        break
      }
      game.nav('down')
    }
    game.nav('right')
  })

  const stageItem = page.locator('.panel--title .menu__item--stage')
  await expect(stageItem).toContainText('VERROUILLÉ')
  await expect(stageItem).toContainText('3 étoiles sur Terrain vierge')
  const boxes = await page.evaluate(() => {
    const rect = (selector: string): Box => {
      const value = (document.querySelector(selector) as HTMLElement).getBoundingClientRect()
      return { x: value.x, y: value.y, width: value.width, height: value.height }
    }
    return {
      item: rect('.panel--title .menu__item--stage'),
      label: rect('.panel--title .menu__stage-label'),
      progress: rect('.panel--title .stage-progress')
    }
  })
  expect(isInside(boxes.item, { width: 667, height: 375 })).toBe(true)
  expect(overlaps(boxes.label, boxes.progress)).toBe(false)
})
