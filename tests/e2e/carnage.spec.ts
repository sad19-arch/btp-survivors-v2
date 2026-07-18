import { test, expect } from '@playwright/test'

/**
 * MODE CARNAGE — le secret Konami.
 *
 * Deux promesses à tenir, et une seule des deux est « spectaculaire » :
 *  1. ON  : chaque mort laisse une flaque, et leur nombre reste BORNÉ.
 *  2. OFF : le jeu est strictement celui d'avant (brief §18). C'est la promesse
 *     la plus importante — un mode secret qui fuit en jeu normal est un bug.
 */

async function bootTitle(page: import('@playwright/test').Page) {
  await page.goto('/?seed=11&test=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
}

/** Joue la séquence Konami via le seam (même chemin que clavier/manette). */
async function playKonami(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const g = window.__GAME__
    for (const d of ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'] as const) {
      g?.nav(d)
    }
    g?.back()
    g?.confirm()
  })
}

test('le Konami au titre BASCULE le Mode Carnage (et ne lance pas la partie)', async ({ page }) => {
  await bootTitle(page)
  expect(await page.evaluate(() => window.__GAME__?.getState().carnage)).toBe(false)

  await playKonami(page)
  const on = await page.evaluate(() => ({
    carnage: window.__GAME__?.getState().carnage,
    screen: window.__GAME__?.getState().screen
  }))
  expect(on.carnage).toBe(true)
  // Le « A » final est consommé par le code : on reste au titre.
  expect(on.screen).toBe('title')

  // Rejouer le code DÉSACTIVE (brief §3.3).
  await playKonami(page)
  expect(await page.evaluate(() => window.__GAME__?.getState().carnage)).toBe(false)
})

test('le casque doré n’est PLUS donné par le Konami', async ({ page }) => {
  await bootTitle(page)
  await playKonami(page)
  const s = await page.evaluate(() => window.__GAME__?.getState())
  expect(s?.carnage).toBe(true)
  // Régression : l'ancien effet ne doit plus se déclencher (brief §18).
  expect(s?.goldSkin).toBe(false)
})

/**
 * Massacre CADENCÉ PAR LES FRAMES.
 *
 * Trois contraintes de la vraie boucle, qu'une version synchrone de ce test
 * ignorait — et c'est ce qui la rendait à la fois INTERMITTENTE et VIDE :
 *
 *  1. `debugCarnage(on)` n'écrit que l'état de l'App ; le `CarnageRenderer`
 *     ne l'apprend qu'au prochain `update()` (rAF). D'où l'attente explicite
 *     sur `debugCarnageInfo().active` AVANT de tuer quoi que ce soit.
 *  2. Un `page.evaluate` synchrone ne laisse JAMAIS passer une frame : tout le
 *     massacre tombait dans une seule frame, où `maxPoolsPerFrame` (6) plafonne.
 *     On rend donc la main au rAF à chaque itération.
 *  3. Un joueur immobile et désarmé MEURT en une seconde (mesuré : 3 kills sur
 *     2400 ennemis, puis `gameover` fige la sim). On l'arme pour qu'il survive et
 *     tue assez pour ATTEINDRE le plafond — sinon « BORNÉ » ne teste rien.
 */
/** Sonde du renderer, ou échec net : `null` = scène non montée / mode allégé, et
 *  tout ce qui suivrait ne testerait plus rien. */
async function carnageInfo(
  page: import('@playwright/test').Page
): Promise<{ active: boolean; alive: number; cap: number }> {
  const info = await page.evaluate(() => window.__GAME__?.debugCarnageInfo?.() ?? null)
  if (info === null) {
    throw new Error('debugCarnageInfo absente : scène non montée ou mode allégé (aucun asset de sang).')
  }
  return info
}

async function massacre(
  page: import('@playwright/test').Page,
  /** ON : on continue jusqu'à SATURER le plafond (c'est là que le FIFO travaille).
   *  OFF : rien ne sature jamais — on s'arrête dès qu'assez d'ennemis sont morts. */
  requireSaturation: boolean
): Promise<{ frames: number; kills: number; saturatedAt: number }> {
  return page.evaluate(async (saturate) => {
    window.__GAME__?.debugGrant({
      weapons: [
        { id: 'marteau', level: 8 },
        { id: 'scie', level: 8 },
        { id: 'cloueur', level: 8 }
      ],
      passives: [
        { id: 'casque_homologue', level: 5 },
        { id: 'outillage_renforce', level: 5 },
        { id: 'cadence_chantier', level: 5 }
      ]
    })
    window.__GAME__?.setInput(1, { move: { x: 0, y: 0 }, attack: true })
    // Le plafond dépend de la plateforme (140 tactile / 320 desktop) : on tue jusqu'à
    // en avoir assez pour le SATURER, au lieu d'un nombre de frames codé en dur qui
    // suffirait sur l'une et pas sur l'autre.
    const cap = window.__GAME__?.debugCarnageInfo?.()?.cap ?? 320
    const kills = () => window.__GAME__?.getState().score ?? 0
    /** Frame où le plafond a été atteint pour la première fois (−1 = jamais). */
    let saturatedAt = -1
    let frames = 0
    // Budget dur : borne le test si le joueur meurt (la sim se fige → boucle sans fin).
    for (; frames < 600; frames++) {
      window.__GAME__?.debugSpawnEnemies(12, 220)
      window.__GAME__?.advanceTime(120)
      while (window.__GAME__?.getState().pendingLevelUp !== null) {
        window.__GAME__?.chooseUpgrade(0)
      }
      // Rendre la main au rAF : sans ça, une seule frame pour tout le massacre.
      await new Promise((res) => requestAnimationFrame(() => res(null)))

      const alive = window.__GAME__?.debugCarnageInfo?.()?.alive ?? 0
      if (saturatedAt < 0 && alive >= cap) {
        saturatedAt = frames
      }
      if (saturate) {
        // 40 frames de rab APRÈS saturation : c'est là, et seulement là, que
        // l'éviction FIFO travaille (le compte doit rester collé au plafond).
        if (saturatedAt >= 0 && frames - saturatedAt >= 40) {
          break
        }
      } else if (kills() > cap * 4 && frames > 40) {
        break
      }
    }
    return { frames, kills: kills(), saturatedAt }
  }, requireSaturation)
}

test('ON : les morts laissent des flaques, et leur nombre reste BORNÉ', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=11&test=1&perf=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  await page.evaluate(() => {
    window.__GAME__?.debugCarnage(true)
  })
  // Le renderer a-t-il VU le flag ? Attente observable, pas un pari sur le tick rAF.
  await page.waitForFunction(() => window.__GAME__?.debugCarnageInfo?.()?.active === true)

  const run = await massacre(page, true)
  const info = await carnageInfo(page)

  // Garde-fou : si le joueur meurt tôt, la sim se fige et le test ne prouve plus
  // rien. On exige assez de morts pour DÉPASSER le plafond (sinon il n'est pas testé).
  expect(run.kills).toBeGreaterThan(info.cap)

  expect(info.alive).toBeGreaterThan(0) // le sang coule…
  // …et il est borné : c'est le ring buffer FIFO. Sans lui, une longue run
  // accumulerait les décalques sans fin (les caps existants du projet ne
  // bornaient que le DÉBIT par frame, jamais le nombre d'objets vivants).
  // Le plafond est lu sur la PLATEFORME (140 tactile / 320 desktop), pas codé en dur.
  expect(info.alive).toBeLessThanOrEqual(info.cap)
  // Le plafond est réellement ATTEINT, puis TENU 40 frames de plus : sans ça,
  // `<= cap` passerait avec 3 flaques et le test mentirait sur ce qu'il vérifie
  // (c'était exactement le cas : 3 flaques vivantes face à un plafond de 320).
  expect(run.saturatedAt).toBeGreaterThanOrEqual(0)
  expect(info.alive).toBe(info.cap)
})

test('OFF : pas une seule flaque, quel que soit le nombre de morts', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=11&test=1&perf=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)
  // Mode explicitement OFF (défaut) — on ne touche pas au Konami.
  await page.waitForFunction(() => window.__GAME__?.debugCarnageInfo?.()?.active === false)

  // MÊME massacre que la version ON : la comparaison n'a de sens qu'à charge égale.
  const run = await massacre(page, false)
  const info = await carnageInfo(page)

  expect(await page.evaluate(() => window.__GAME__?.getState().carnage)).toBe(false)
  // Des centaines d'ennemis meurent VRAIMENT (et non 3, le joueur mourant aussitôt) :
  // sans ce plancher, « zéro flaque » serait vrai pour la mauvaise raison.
  expect(run.kills).toBeGreaterThan(info.cap)
  expect(info.active).toBe(false)
  expect(info.alive).toBe(0) // …et pourtant zéro flaque.
})
