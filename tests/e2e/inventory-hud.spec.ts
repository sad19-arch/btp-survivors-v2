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

  // Avancer 2500ms pour dépasser l'intro (durationMs=2000) et laisser l'overlay
  // se mettre à jour (introActive → false, HUD et inventaire deviennent visibles).
  await page.evaluate(() => {
    window.__GAME__?.advanceTime(2500)
  })

  // Vérifier que l'état est bien en jeu et hors intro.
  const gameState = await page.evaluate(() => window.__GAME__?.getState())
  expect(gameState?.screen).toBe('game')
  expect(gameState?.introActive).toBe(false)

  // Attendre que le HUD soit rendu (les barres HP/XP sont visibles hors intro).
  await page.waitForSelector('.hud__bar--hp', { timeout: 5000 })

  // L'inventaire doit être présent et visible.
  await page.waitForSelector('.inv', { timeout: 5000 })
  const inv = page.locator('.inv')
  await expect(inv).toBeVisible()

  // Lire les bounding boxes via JavaScript en un seul appel atomique pour éviter
  // les races avec les rAF qui reconstruisent le HUD chaque frame.
  interface Boxes {
    inv: { x: number; y: number; width: number; height: number } | null
    hp: { x: number; y: number; width: number; height: number } | null
    xp: { x: number; y: number; width: number; height: number } | null
  }
  const boxes = await page.evaluate((): Boxes => {
    const rect = (sel: string) => {
      const el = document.querySelector(sel)
      if (el === null) { return null }
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    return {
      inv: rect('.inv'),
      hp: rect('.hud__bar--hp'),
      xp: rect('.hud__bar--xp')
    }
  })

  // Les barres et le bandeau doivent exister.
  expect(boxes.inv).not.toBeNull()
  expect(boxes.hp).not.toBeNull()
  expect(boxes.xp).not.toBeNull()

  const invBox = boxes.inv
  const hpBox = boxes.hp
  const xpBox = boxes.xp

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
    // Avancer 2500ms pour passer l'intro (2000ms) et rendre l'inventaire visible.
    window.__GAME__?.advanceTime(2500)
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
