import { test, expect, type Page } from '@playwright/test'

async function kiteFinalBoss(page: Page): Promise<void> {
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
}

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
 *
 * Inventaire SATURÉ à dessein (6/6 armes, 6/6 passifs — `INVENTORY` de
 * `content/config`), tous au niveau max : au-delà de « build complet », ça évite
 * qu'un level-up en cours de kite (les kills en font gagner) tire une carte
 * `rollCards` — avec un inventaire plein/maxé, `eligibleCards` est vide et le
 * tirage ne consomme AUCUN nombre du RNG seedé (`fisherYates([])` = no-op).
 * Sans ça, le moindre ajout de contenu (arme/passif) ailleurs dans le jeu décale
 * la composition du pool de cartes → décale la séquence de tirages RNG → décale
 * TOUT le reste de la run (spawns d'ennemis compris) → peut faire basculer ce
 * seed précis de victoire en défaite, sans aucun rapport avec la gagnabilité
 * réelle du build. Un inventaire saturé rend ce test insensible à ce bruit.
 */
test('un autostart normal refuse un stage verrouillé, ?test=1 le bypass pour les E2E', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/?autostart=solo&level=2&seed=1&lite=1&intro=0')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  const locked = await page.evaluate(() => window.__GAME__?.getState())
  expect(locked?.screen).toBe('title')
  expect(locked?.stageProgress.selectedStageId).toBe('terrassement')
  expect(locked?.stageProgress.notification).toContain('Niveau verrouillé')

  await page.goto('/?autostart=solo&level=2&seed=1&test=1&lite=1&intro=0')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  const bypassed = await page.evaluate(() => window.__GAME__?.getState())
  expect(bypassed?.screen).toBe('game')
  expect(bypassed?.stageId).toBe('terrassement')
})


test('une victoire trois étoiles débloque, lance et persiste le stage suivant', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('three-star-progression-seeded') !== null) {
      return
    }
    sessionStorage.setItem('three-star-progression-seeded', '1')
    localStorage.clear()
  })
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1&intro=0')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => {
    const g = window.__GAME__
    if (g === undefined) {
      return
    }
    g.debugGrant({
      weapons: [
        { id: 'cloueur', level: 8 },
        { id: 'marteau', level: 8 },
        { id: 'chalumeau', level: 8 },
        { id: 'court_circuit', level: 8 },
        { id: 'boulons', level: 8 },
        { id: 'cle_molette', level: 8 }
      ],
      passives: [
        { id: 'outillage_renforce', level: 5 },
        { id: 'cadence_chantier', level: 5 },
        { id: 'prime_rendement', level: 5 },
        { id: 'groupe_electrogene', level: 2 },
        { id: 'air_comprime', level: 5 },
        { id: 'casque_homologue', level: 5 }
      ]
    })
    g.debugSpawnChestOnPlayer()
    g.advanceTime(200)
    // Le stage 01 n'a volontairement aucun prisonnier : 0/0 satisfait donc
    // `rescuedAll`, sans altérer sa composition pour les besoins du test.
    g.debugSpawnBoss('final')
  })

  await expect.poll(async () => page.evaluate(() => window.__GAME__?.getState().players[0]?.weapons.includes('mitrailleuse_clous'))).toBe(true)
  expect(await page.evaluate(() => window.__GAME__?.getState().rescue)).toMatchObject({ rescued: 0, total: 0 })
  await kiteFinalBoss(page)

  const terminal = await page.evaluate(() => {
    const g = window.__GAME__
    const first = g?.getState()
    const second = g?.getState()
    return {
      scene: first?.scene,
      screen: first?.screen,
      stars: first?.runReport?.stars,
      evolvedAny: first?.runReport?.evolvedAny,
      terrassementUnlocked: first?.stageProgress.stages.find((stage) => String(stage.id) === 'terrassement')?.unlocked,
      menuIds: first?.menu?.items.map((item) => item.id),
      menuIndex: first?.menu?.index,
      stable: JSON.stringify(first) === JSON.stringify(second)
    }
  })
  expect(terminal.menuIds).toEqual(['stage_suivant', 'titre'])
  expect(terminal.menuIndex).toBe(0)
  expect(terminal).toMatchObject({
    scene: 'won', screen: 'victory', stars: 3, evolvedAny: true, terrassementUnlocked: true, stable: true
  })

  // Un profil neuf qualifie au tableau : le flux arcade existant reste intact
  // avant d'exécuter « Stage suivant ».
  await page.evaluate(() => window.__GAME__?.confirm())
  await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().screen)).toBe('nameEntry')
  await page.evaluate(() => window.__GAME__?.confirm()) // nom vide accepté → ANONYME
  await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().screen)).toBe('hiscores')
  await page.evaluate(() => window.__GAME__?.confirm()) // Retour au rapport
  await expect.poll(() => page.evaluate(() => window.__GAME__?.getState().screen)).toBe('victory')
  expect(await page.evaluate(() => window.__GAME__?.getState().menu?.items[0]?.id)).toBe('stage_suivant')
  await page.evaluate(() => window.__GAME__?.confirm())

  const nextStage = await page.evaluate(() => {
    const state = window.__GAME__?.getState()
    return {
      screen: state?.screen,
      stageId: state?.stageId,
      selectedStageId: state?.stageProgress.selectedStageId,
      unlocked: state?.stageProgress.stages.find((stage) => String(stage.id) === 'terrassement')?.unlocked,
      notification: state?.stageProgress.notification,
      menuIds: state?.menu?.items.map((item) => item.id),
      menuIndex: state?.menu?.index
    }
  })
  expect(nextStage).toMatchObject({ screen: 'game', stageId: 'terrassement' })

  await page.reload()
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  const reloaded = await page.evaluate(() => window.__GAME__?.getState())
  expect(reloaded?.stageProgress.stages.find((stage) => String(stage.id) === 'terrain_vierge')?.bestStars).toBe(3)
  expect(reloaded?.stageProgress.stages.find((stage) => String(stage.id) === 'terrassement')?.unlocked).toBe(true)
})

test('build complet + KITE + boss final tué → scene "won" (jeu gagnable)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=1&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => {
    // Build offensif de FIN DE RUN, inventaire SATURÉ (6 armes + 6 passifs, tous
    // au niveau max) — cf. commentaire d'en-tête sur l'insensibilité au RNG.
    window.__GAME__?.debugGrant({
      weapons: [
        { id: 'cloueur', level: 8 },
        { id: 'marteau', level: 8 },
        { id: 'chalumeau', level: 8 },
        { id: 'court_circuit', level: 8 },
        { id: 'boulons', level: 8 },
        { id: 'cle_molette', level: 8 },
      ],
      passives: [
        { id: 'outillage_renforce', level: 5 },
        { id: 'cadence_chantier', level: 5 },
        { id: 'prime_rendement', level: 5 },
        { id: 'groupe_electrogene', level: 2 },
        { id: 'air_comprime', level: 5 },
        { id: 'casque_homologue', level: 5 },
      ],
    })
    window.__GAME__?.debugSpawnBoss('final')
  })

  await kiteFinalBoss(page)

  expect(await page.evaluate(() => window.__GAME__?.getState().scene)).toBe('won')
})
