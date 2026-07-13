import { test, expect } from '@playwright/test'

/**
 * Tier-2 (seam) : le jeu doit rester GAGNABLE. Avec un build de fin de run complet
 * ET en KITANT le boss (fuir à l'opposé pendant qu'on tape — vrai chemin de
 * victoire), tuer le boss FINAL doit mener à `scene === 'won'`.
 *
 * Boss final HARDCORE (demande user 2026-07-13 : `FINAL_BOSS.hpMult` ×10 = ~72k PV).
 * Un build IMMOBILE meurt au contact du boss avant de l'user ; un joueur qui KITE
 * survit (il distance le boss) et le grinde en ~5 min de sim. On modélise donc le
 * kite ici. La gagnabilité « en moyenne » du bot est couverte par le harness sim
 * (`tools/sim`, cible `KITE_MIN_WIN_PCT`, plancher bas assumé pour le mode hardcore).
 */
test('build complet + KITE + boss final tué → scene "won" (jeu gagnable)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => {
    // Build offensif de FIN DE RUN : 4 armes niv max (cloueur + marteau AoE + chalumeau
    // cône + court-circuit) + passifs dégâts/cadence poussés → ~230 DPS sur le boss.
    window.__GAME__?.debugGrant({
      weapons: [
        { id: 'cloueur', level: 8 },
        { id: 'marteau', level: 8 },
        { id: 'chalumeau', level: 8 },
        { id: 'court_circuit', level: 8 },
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

  // Avance en KITANT jusqu'à la victoire (ou game-over). Fenêtre large (boss ×10 PV) :
  // le build complet le tue en ~5 min de sim, bien avant les 1300 s.
  await page.evaluate(() => {
    const g = window.__GAME__
    if (g === undefined) {
      return
    }
    for (let t = 0; t < 1_300_000 && g.getState().scene === 'game'; t += 500) {
      const s = g.getState()
      // Les kills en kitant font monter de niveau → le temps GÈLE tant que le choix
      // de carte n'est pas fait. On choisit toujours la 1re carte pour dégeler.
      if (s.pendingLevelUp !== null) {
        g.chooseUpgrade(0)
        continue
      }
      const p = s.players[0]
      const boss = s.enemies.find((e) => e.isBoss)
      if (p !== undefined && boss !== undefined) {
        // KITE : fuir à l'opposé du boss (il suit → reste dans l'AoE marteau/cône).
        const dx = p.x - boss.x
        const dy = p.y - boss.y
        const d = Math.hypot(dx, dy) || 1
        g.setInput(1, { move: { x: dx / d, y: dy / d }, attack: true })
      } else {
        g.setInput(1, { move: { x: 1, y: 0 }, attack: true })
      }
      g.advanceTime(500)
    }
  })

  expect(await page.evaluate(() => window.__GAME__?.getState().scene)).toBe('won')
})
