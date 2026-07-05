import { test, expect } from '@playwright/test'
import path from 'node:path'

/**
 * Régression DA : bandeau d'inventaire (armes+passifs) haut-gauche, ~3× plus gros.
 *
 * Valide :
 * - `.inv` est visible en jeu (screen=game).
 * - `.inv` est positionné SOUS les barres HP/XP (pas de recouvrement vertical).
 * - Screenshot `inventory-hud.png` pour revue DA manuelle.
 *
 * Mode : PAS lite (vrais icônes, rendu complet).
 */

test('inventaire HUD : visible et positionné sous les barres HP/XP', async ({ page }) => {
  // Mode non-lite pour avoir les vrais sprites/icônes d'inventaire.
  await page.goto('/?autostart=solo&seed=1&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })

  // Injecter 3 armes + 2 passifs pour peupler les deux rangées.
  await page.evaluate(() => {
    window.__GAME__?.debugGrant({
      weapons: [
        { id: 'scie', level: 3 },
        { id: 'marteau', level: 2 },
        { id: 'cloueur', level: 1 }
      ],
      passives: [
        { id: 'air_comprime', level: 2 },
        { id: 'caisse_outils', level: 1 }
      ]
    })
  })

  // Avancer un peu le temps pour que le rendu Phaser + l'overlay s'actualisent.
  await page.evaluate(() => {
    window.__GAME__?.advanceTime(500)
  })

  // Vérifier que l'état est bien en jeu.
  const screen = await page.evaluate(() => window.__GAME__?.getState().screen)
  expect(screen).toBe('game')

  // L'inventaire doit être présent et visible.
  await page.waitForSelector('.inv', { timeout: 5000 })
  const inv = page.locator('.inv')
  await expect(inv).toBeVisible()

  // Récupérer les bounding boxes de .inv et des barres HP/XP.
  const invBox = await inv.boundingBox()
  expect(invBox).not.toBeNull()

  // La barre HP est dans .hud__bar--hp, la barre XP dans .hud__bar--xp.
  const hpBar = page.locator('.hud__bar--hp')
  const xpBar = page.locator('.hud__bar--xp')
  const hpBox = await hpBar.boundingBox()
  const xpBox = await xpBar.boundingBox()

  // Les barres doivent exister.
  expect(hpBox).not.toBeNull()
  expect(xpBox).not.toBeNull()

  if (invBox !== null && hpBox !== null && xpBox !== null) {
    // Le bord supérieur de .inv doit être SOUS le bord inférieur des barres HP et XP.
    // (Pas de recouvrement vertical : inv.top >= max(hp.bottom, xp.bottom))
    const barsBottom = Math.max(hpBox.y + hpBox.height, xpBox.y + xpBox.height)
    expect(invBox.y).toBeGreaterThanOrEqual(barsBottom - 2) // tolérance 2px pour sub-pixel

    // Le bandeau est à gauche (bord gauche < 200px).
    expect(invBox.x).toBeLessThan(200)

    // Le bandeau est significativement plus grand que 32px (l'ancien) → au moins 60px.
    expect(invBox.height).toBeGreaterThan(60)
  }

  // Screenshot pour revue DA — chemin relatif résolu par Playwright dans test-results/.
  const screenshotPath = path.join('test-results', 'inventory-hud.png')
  await page.screenshot({ path: screenshotPath, fullPage: false })
})

test('inventaire HUD : tuiles armes et passifs présentes avec niveaux', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })

  await page.evaluate(() => {
    window.__GAME__?.debugGrant({
      weapons: [{ id: 'marteau', level: 4 }],
      passives: [{ id: 'air_comprime', level: 1 }]
    })
    window.__GAME__?.advanceTime(300)
  })

  await page.waitForSelector('.inv', { timeout: 5000 })

  // Rangée armes (sans --passives).
  const weaponRow = page.locator('.inv__row:not(.inv__row--passives)')
  await expect(weaponRow).toBeVisible()
  const weaponTiles = weaponRow.locator('.inv__tile')
  // Au moins 1 tuile arme (arme de départ + marteau injectée).
  expect(await weaponTiles.count()).toBeGreaterThanOrEqual(1)

  // Rangée passifs (.inv__row--passives).
  const passiveRow = page.locator('.inv__row--passives')
  await expect(passiveRow).toBeVisible()
  const passiveTiles = passiveRow.locator('.inv__tile--sm')
  expect(await passiveTiles.count()).toBeGreaterThanOrEqual(1)

  // Les pastilles de niveau existent et ont le format digit/digit.
  const lvlBadges = page.locator('.inv__lvl')
  const badgeCount = await lvlBadges.count()
  expect(badgeCount).toBeGreaterThan(0)
  const firstBadge = await lvlBadges.first().textContent()
  expect(firstBadge).toMatch(/\d+\/\d+/)
})
