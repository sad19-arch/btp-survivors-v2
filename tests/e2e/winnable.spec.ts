import { test, expect } from '@playwright/test'

/**
 * Tier-2 (seam) : le jeu doit être GAGNABLE (playtest : avant, on mourait au mur
 * de PV avant le boss). Avec un build offensif fort, tuer le boss FINAL doit
 * mener à `scene === 'won'`. La gagnabilité « en moyenne » (kite ~25 %) est
 * couverte par le harness sim (`tools/sim`, cible `KITE_MIN_WIN_PCT`) ; ici on
 * valide le chemin de victoire de bout en bout dans le vrai jeu.
 */
test('build fort + boss final tué → scene "won" (jeu gagnable)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => {
    // Build offensif fort : le boss final a PV ×4 (FINAL_BOSS.hpMult) — deux armes
    // au niveau max (cloueur projectile + marteau AOE qui frappe le boss au contact)
    // + passifs dégâts/cadence poussés pour l'abattre dans la fenêtre.
    window.__GAME__?.debugGrant({
      weapons: [
        { id: 'cloueur', level: 8 },
        { id: 'marteau', level: 8 },
      ],
      passives: [
        { id: 'outillage_renforce', level: 5 },
        { id: 'cadence_chantier', level: 5 },
        { id: 'prime_rendement', level: 5 },
        { id: 'groupe_electrogene', level: 2 },
        { id: 'air_comprime', level: 5 },
      ],
    })
    window.__GAME__?.debugSpawnBoss('final')
  })

  // Laisse le build abattre le boss (avance par pas jusqu'à la victoire). Fenêtre
  // élargie (boss ×4 PV depuis TUN-4) : 120 s de sim suffisent largement au build fort.
  await page.evaluate(() => {
    const g = window.__GAME__
    if (g === undefined) {
      return
    }
    for (let t = 0; t < 120_000 && g.getState().scene !== 'won'; t += 200) {
      g.advanceTime(200)
    }
  })

  expect(await page.evaluate(() => window.__GAME__?.getState().scene)).toBe('won')
})
