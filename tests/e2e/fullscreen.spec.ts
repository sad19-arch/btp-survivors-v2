import { expect, test } from '@playwright/test'

async function openFirstLaunch(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?test=1')
  await page.evaluate(() => localStorage.removeItem('btp:fullscreen_settings_v1'))
  await page.reload()
  await page.waitForFunction(() => window.__GAME__?.ready === true)
}

test.describe('plein écran consenti', () => {

  test('propose une fois le choix puis conserve le plein écran et permet de quitter depuis Options', async ({ page }) => {
    test.setTimeout(30000)
    await openFirstLaunch(page)
    await expect(page.locator('.fullscreen-consent')).toBeVisible({ timeout: 8000 })

    await page.locator('.fullscreen-consent .menu__item').first().click()
    await page.waitForFunction(() => document.fullscreenElement?.id === 'game-root')
    expect(await page.evaluate(() => document.querySelector('#game-root > #ui-root') !== null)).toBe(true)
    await expect(page.locator('.title-composition')).toBeVisible()
    expect(await page.locator('.title-composition').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight
    })).toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('btp:fullscreen_settings_v1'))).toBe('{"preference":"fullscreen"}')

    await page.evaluate(() => {
      const game = window.__GAME__
      game?.nav('down')
      game?.nav('down')
      game?.nav('down')
      game?.nav('down')
      game?.nav('down')
      game?.confirm() // Options
      for (let i = 0; i < 5; i++) {
        game?.nav('down')
      }
      game?.confirm() // quitter le plein écran
    })
    await page.waitForFunction(() => document.fullscreenElement === null)

    await page.reload()
    await page.waitForFunction(() => window.__GAME__?.ready === true)
    await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().fullscreen.authorizationRequired)).toBe(true)
    await expect(page.locator('.splash__hint')).toHaveText('Appuie pour démarrer en plein écran')
    await page.locator('.splash').click({ force: true })
    await page.waitForFunction(() => document.fullscreenElement?.id === 'game-root')
    expect(await page.evaluate(() => document.querySelector('#game-root > #ui-root') !== null)).toBe(true)
  })

  test('Options reste entièrement visible à 667×375 avec les commandes affichage', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 })
    await openFirstLaunch(page)
    await expect(page.locator('.fullscreen-consent')).toBeVisible({ timeout: 8000 })
    await page.locator('.fullscreen-consent .menu__item').nth(1).click()
    await page.waitForFunction(() => window.__GAME__?.getState().screen === 'title')
    await page.evaluate(() => {
      const game = window.__GAME__
      for (let i = 0; i < 5; i++) {
        game?.nav('down')
      }
      game?.confirm()
    })
    await expect(page.locator('.panel')).toContainText('Plein écran au démarrage')
    const bounds = await page.locator('.panel').evaluate((panel) => {
      const rect = panel.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, height: window.innerHeight }
    })
    expect(bounds.top).toBeGreaterThanOrEqual(0)
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height)
  })

  test('Entrée active le plein écran depuis Options dans le geste fiable courant', async ({ page }) => {
    await openFirstLaunch(page)
    await expect(page.locator('.fullscreen-consent')).toBeVisible({ timeout: 8000 })
    await page.locator('.fullscreen-consent .menu__item').nth(1).click()
    await page.waitForFunction(() => window.__GAME__?.getState().screen === 'title')
    await page.evaluate(() => {
      const game = window.__GAME__
      for (let i = 0; i < 5; i++) {
        game?.nav('down')
      }
      game?.confirm()
      for (let i = 0; i < 5; i++) {
        game?.nav('down')
      }
    })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.fullscreenElement?.id === 'game-root')
  })

  test('un choix manette arme honnêtement l’autorisation puis Entrée le réalise', async ({ page }) => {
    await openFirstLaunch(page)
    await expect(page.locator('.fullscreen-consent')).toBeVisible({ timeout: 8000 })
    await page.evaluate(() => window.__GAME__?.confirm())
    await page.waitForFunction(() => window.__GAME__?.getState().fullscreen.authorizationRequired === true)
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.fullscreenElement?.id === 'game-root')
  })

  test('la sortie via l’API native resynchronise le seam', async ({ page }) => {
    await openFirstLaunch(page)
    await expect(page.locator('.fullscreen-consent')).toBeVisible({ timeout: 8000 })
    await page.locator('.fullscreen-consent .menu__item').first().click()
    await page.waitForFunction(() => document.fullscreenElement?.id === 'game-root')
    await page.evaluate(() => document.exitFullscreen())
    await page.waitForFunction(() => window.__GAME__?.getState().fullscreen.active === false)
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  })

  test('le réglage de démarrage n’entre pas immédiatement en plein écran', async ({ page }) => {
    await openFirstLaunch(page)
    await expect(page.locator('.fullscreen-consent')).toBeVisible({ timeout: 8000 })
    await page.locator('.fullscreen-consent .menu__item').nth(1).click()
    await page.waitForFunction(() => window.__GAME__?.getState().screen === 'title')
    await page.evaluate(() => {
      const game = window.__GAME__
      for (let i = 0; i < 5; i++) {
        game?.nav('down')
      }
      game?.confirm()
    })
    await page.getByText('Plein écran au démarrage : NON', { exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().fullscreen)).toMatchObject({
      preference: 'fullscreen',
      authorizationRequired: false,
      active: false
    })
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  })

  test('un refus navigateur reste fenêtré, persiste le choix et affiche un retour français', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
        configurable: true,
        value: () => Promise.reject(new DOMException('refus test'))
      })
    })
    await openFirstLaunch(page)
    await expect(page.locator('.fullscreen-consent')).toBeVisible({ timeout: 8000 })
    await page.locator('.fullscreen-consent .menu__item').first().click()
    await expect(page.locator('.fullscreen-feedback')).toHaveText('Plein écran : REFUSÉ')
    await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().fullscreen)).toMatchObject({
      preference: 'fullscreen',
      feedback: 'REFUSÉ',
      authorizationRequired: false,
      active: false
    })
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  })

  test('une API indisponible ne bloque pas le titre et reste explicite dans Options', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: undefined })
      Object.defineProperty(Document.prototype, 'exitFullscreen', { configurable: true, value: undefined })
    })
    await openFirstLaunch(page)
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 8000 })
    await expect(page.locator('.fullscreen-consent')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().fullscreen.supported)).toBe(false)
    await page.evaluate(() => {
      const game = window.__GAME__
      for (let i = 0; i < 5; i++) {
        game?.nav('down')
      }
      game?.confirm()
    })
    await expect(page.getByText('Plein écran : INDISPONIBLE', { exact: true })).toBeVisible()
  })

  test('un choix fenêtré persiste après rechargement sans redemander le plein écran', async ({ page }) => {
    await openFirstLaunch(page)
    await expect(page.locator('.fullscreen-consent')).toBeVisible({ timeout: 8000 })
    await page.locator('.fullscreen-consent .menu__item').nth(1).click()
    await page.waitForFunction(() => window.__GAME__?.getState().screen === 'title')
    await page.reload()
    await page.waitForFunction(() => window.__GAME__?.ready === true)
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 8000 })
    await expect(page.locator('.fullscreen-consent')).toHaveCount(0)
    expect(await page.evaluate(() => window.__GAME__?.getState().fullscreen.preference)).toBe('windowed')
  })
})
