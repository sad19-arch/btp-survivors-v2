import { expect, test, type Page } from '@playwright/test'

const BUTTON = {
  A: 0,
  B: 1,
  DOWN: 13,
  RIGHT: 15,
} as const

async function installFourPads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pads = Array.from({ length: 4 }, (_, index) => ({
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
      connected: true,
      id: `Pad Xbox simulé J${index + 1}`,
      index,
      mapping: 'standard',
      timestamp: 0,
    }))
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => pads,
    })
    ;(
      window as Window & {
        __INPUT_PADS__?: typeof pads
      }
    ).__INPUT_PADS__ = pads
  })
}

async function connectPads(page: Page): Promise<void> {
  await page.evaluate(() => {
    const pads = (
      window as Window & {
        __INPUT_PADS__?: Gamepad[]
      }
    ).__INPUT_PADS__
    for (const pad of pads ?? []) {
      const event = new Event('gamepadconnected')
      Object.defineProperty(event, 'gamepad', { value: pad })
      window.dispatchEvent(event)
    }
  })
}

async function pulse(page: Page, padIndex: number, buttonIndex: number): Promise<void> {
  await page.evaluate(
    ({ padIndex, buttonIndex }) => {
      const pads = (
        window as Window & {
          __INPUT_PADS__?: {
            timestamp: number
            buttons: { pressed: boolean; touched: boolean; value: number }[]
          }[]
        }
      ).__INPUT_PADS__
      const pad = pads?.[padIndex]
      const button = pad?.buttons[buttonIndex]
      if (pad === undefined || button === undefined) {
        throw new Error(`pad ${padIndex} / bouton ${buttonIndex} absent`)
      }
      button.pressed = true
      button.touched = true
      button.value = 1
      pad.timestamp = performance.now() + 1
    },
    { padIndex, buttonIndex }
  )
  await page.waitForTimeout(50)
  await page.evaluate(
    ({ padIndex, buttonIndex }) => {
      const pads = (
        window as Window & {
          __INPUT_PADS__?: {
            timestamp: number
            buttons: { pressed: boolean; touched: boolean; value: number }[]
          }[]
        }
      ).__INPUT_PADS__
      const pad = pads?.[padIndex]
      const button = pad?.buttons[buttonIndex]
      if (pad === undefined || button === undefined) {
        throw new Error(`pad ${padIndex} / bouton ${buttonIndex} absent`)
      }
      button.pressed = false
      button.touched = false
      button.value = 0
      pad.timestamp = performance.now() + 1
    },
    { padIndex, buttonIndex }
  )
  await page.waitForTimeout(35)
}

test('clavier réel : navigation et validation traversent Phaser hors mode test', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'un seul contrôle desktop suffit')
  await page.goto('/?seed=31&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  expect(await page.evaluate(() => window.__GAME__?.getState().menu?.index)).toBe(0)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().menu?.index)).toBe(1)
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().menu?.index)).toBe(0)
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().screen)).toBe(
    'characterSelect'
  )
})

test('4 manettes réelles simulées : chacune navigue au titre, sans quadruple déclenchement', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'API Gamepad desktop')
  await installFourPads(page)
  await page.goto('/?seed=32&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await connectPads(page)

  for (let padIndex = 0; padIndex < 4; padIndex++) {
    const before = await page.evaluate(() => window.__GAME__?.getState().menu?.index ?? -1)
    await pulse(page, padIndex, BUTTON.DOWN)
    await expect
      .poll(() => page.evaluate(() => window.__GAME__?.getState().menu?.index ?? -1))
      .toBe((before + 1) % 7)
  }

  const beforeTogether = await page.evaluate(() => window.__GAME__?.getState().menu?.index ?? -1)
  await page.evaluate(() => {
    const pads = (
      window as Window & {
        __INPUT_PADS__?: {
          timestamp: number
          buttons: { pressed: boolean; touched: boolean; value: number }[]
        }[]
      }
    ).__INPUT_PADS__
    for (const pad of pads ?? []) {
      const button = pad.buttons[13]
      if (button !== undefined) {
        button.pressed = true
        button.value = 1
        pad.timestamp = performance.now() + 1
      }
    }
  })
  await page.waitForTimeout(50)
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.getState().menu?.index ?? -1))
    .toBe((beforeTogether + 1) % 7)
})

test('sélection coop4 simultanée : quatre curseurs isolés, verrouillage et retour indépendants', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'API Gamepad desktop')
  await installFourPads(page)
  await page.goto('/?seed=33&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  await connectPads(page)

  await page.evaluate(() => {
    const game = window.__GAME__
    game?.nav('down')
    game?.nav('right')
    game?.nav('right')
    game?.nav('right')
    game?.nav('up')
    game?.confirm()
  })

  await expect(page.locator('.charsel-card')).toHaveCount(4)
  for (let playerId = 1; playerId <= 4; playerId++) {
    const before = await page.evaluate(() =>
      window.__GAME__?.getState().characterSelect?.players.map((player) => player.charId)
    )
    await pulse(page, playerId - 1, BUTTON.RIGHT)
    const after = await page.evaluate(() =>
      window.__GAME__?.getState().characterSelect?.players.map((player) => player.charId)
    )
    expect(after?.[playerId - 1]).not.toBe(before?.[playerId - 1])
    for (let otherId = 1; otherId <= 4; otherId++) {
      if (otherId !== playerId) {
        expect(after?.[otherId - 1]).toBe(before?.[otherId - 1])
      }
    }
  }

  await pulse(page, 1, BUTTON.A)
  await expect(page.locator('.charsel-card[data-player="2"]')).toHaveAttribute(
    'data-ready',
    'true'
  )
  await pulse(page, 1, BUTTON.B)
  await expect(page.locator('.charsel-card[data-player="2"]')).toHaveAttribute(
    'data-ready',
    'false'
  )

  for (const padIndex of [3, 1, 0]) {
    await pulse(page, padIndex, BUTTON.A)
    expect(await page.evaluate(() => window.__GAME__?.getState().screen)).toBe(
      'characterSelect'
    )
  }
  await pulse(page, 2, BUTTON.A)
  await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().players.length)).toBe(4)
})

test('intro coop4 : une entrée de J1, J2, J3 ou J4 peut la passer', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'API Gamepad desktop')
  await installFourPads(page)

  for (let padIndex = 0; padIndex < 4; padIndex++) {
    await page.goto(`/?autostart=coop4&seed=${40 + padIndex}&lite=1`)
    await page.waitForFunction(() => window.__GAME__?.ready === true)
    await connectPads(page)
    expect(await page.evaluate(() => window.__GAME__?.getState().introActive)).toBe(true)
    await pulse(page, padIndex, BUTTON.RIGHT)
    await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().introActive)).toBe(
      false
    )
  }
})
