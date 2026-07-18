import { test, expect } from '@playwright/test'

/**
 * Gate de perf (Plan B2 / Task 7) : la horde ne doit pas faire s'effondrer le
 * framerate. La régression que ce test cherche à détecter est le coût O(N²)
 * de la sim (scans collision/armes sur les ennemis, chiffré par l'audit) —
 * un coût JS pur dans `src/core`, identique quel que soit le rendu. Avec la
 * grille spatiale (Plan B2 T1-T3) ce coût est ~linéaire ; une régression
 * serait des centaines/milliers de ms/frame — un écart d'ordre de grandeur,
 * trivialement séparable d'un run correct.
 *
 * MODE : `&lite=1` (mêmes conventions que `seam.spec.ts` / `playwright.config.ts`)
 * — pas de feuilles de sprites 192×192 chargées, donc les ennemis se rendent en
 * cercles Phaser bon marché (`GameScene.ts` : `!this.textures.exists(key)` →
 * `this.add.circle(...)`). Le pooling des VRAIS sprites a déjà été validé
 * séparément (Task 6) ; ici on isole volontairement le coût SIM (la cible
 * réelle de cette passe) du coût de rasterisation GPU.
 *
 * MÉTHODE DE MESURE — pourquoi pas de simples deltas `requestAnimationFrame` :
 * en investiguant ce gate, il s'est avéré que dans CET environnement headless
 * (Windows + Chromium + SwiftShader), les deltas bruts entre callbacks
 * `requestAnimationFrame` subissent un throttling/une dégradation cyclique
 * (~15 bonnes frames à 60fps puis un mur à 600-1800ms) **qui reproduit à
 * l'identique avec ZÉRO ennemi spawné** — un artefact de scheduling rAF de cet
 * environnement, pas un coût de jeu. Un `setInterval` mesurant le même
 * intervalle logique (16ms) pendant que la sim avance réellement via
 * `advanceTime` reste lui rock-solide (~16-17ms) même avec 500 ennemis actifs
 * — preuve que le coût sim/rendu réel est négligeable et que le signal rAF
 * était l'artefact, pas la mesure utile. On mesure donc les deltas d'un
 * `setInterval(16ms)` qui pilote `advanceTime(16)` à chaque tick (fait
 * réellement avancer la sim, contrairement au temps gelé du mode test), et on
 * ignore la première seconde (règlement du spawn de 500 ennemis + JIT
 * warm-up) avant de calculer médiane/p95.
 *
 * SEUIL : médiane < 33 ms (≥ 30 fps) comme indiqué par le brief — budget
 * volontairement indulgent. OBSERVÉ en local (WebGL logiciel SwiftShader, mode
 * lite, 500 ennemis, sim réellement avancée) : médiane ≈ 16 ms, p95 ≈ 18-27 ms —
 * très en dessous du budget, avec une marge d'un ordre de grandeur. Une régression
 * O(N²) sur 500 ennemis ferait exploser ces chiffres de façon flagrante et
 * resterait détectée même avec de rares outliers isolés (filtrés par la
 * médiane/p95, pas le max). Chiffres reconfirmés le 2026-07-17 (cf. bloc de seuils
 * en bas de fichier : l'« élévation » de 12d63ef ne se reproduit pas).
 *
 * CE QUE CE TEST NE MESURE PAS : les deltas d'un `setInterval` capturent le temps
 * MAIN THREAD (sim + synchro + JS de rendu). Le coût GPU/compositeur (overdraw d'un
 * overlay plein écran, fill-rate) n'y apparaît quasiment pas, et SwiftShader ne
 * prédit de toute façon pas un GPU mobile. Ce gate est un garde ALGORITHMIQUE, pas
 * un proxy de perf mobile — cette dernière se mesure sur device via `?perf=1`.
 */

interface FrameSample {
  median: number
  p95: number
  count: number
}

test('stress horde: 500 ennemis ne font pas s\'effondrer le framerate (mode lite)', async ({ page }) => {
  await page.goto('/?autostart=solo&seed=7&test=1&lite=1')
  await page.waitForFunction(() => window.__GAME__?.ready === true)

  // Spawn direct via le seam (déterministe, RNG seedé) — dépasse volontairement
  // le plafond normal (SPAWN.maxActive) pour stresser la sim/le rendu.
  await page.evaluate(() => {
    window.__GAME__?.debugSpawnEnemies(500)
  })

  const state = await page.evaluate(() => window.__GAME__?.getState())
  expect(state?.enemies.length ?? 0).toBeGreaterThanOrEqual(500)

  // Fenêtre de mesure ~2.5s utile (+ 1s de warm-up ignoré = 3.5s total) : le
  // setInterval(16ms) fait réellement avancer la sim (`advanceTime`) — le
  // mode test gèle sinon le temps — et mesure l'intervalle réel entre ticks,
  // fiable dans cet environnement (contrairement aux deltas rAF, cf. commentaire
  // de tête). Pas de sleep pour la disponibilité : `waitForFunction` ci-dessus
  // attend déjà `ready` de façon déterministe.
  const WARMUP_MS = 1000
  const TOTAL_MS = 3500
  const sample = await page.evaluate<FrameSample, { warmupMs: number; totalMs: number }>(
    ({ warmupMs, totalMs }) => {
      return new Promise<FrameSample>((resolve) => {
        const timestamps: number[] = []
        const start = performance.now()
        const iv = setInterval(() => {
          window.__GAME__?.advanceTime(16)
          const now = performance.now()
          timestamps.push(now - start)
          if (now - start > totalMs) {
            clearInterval(iv)
            const deltas = timestamps
              .map((t, i) => (i === 0 ? t : t - (timestamps[i - 1] ?? t)))
              .filter((_, i) => (timestamps[i] ?? 0) > warmupMs)
            const sorted = [...deltas].sort((a, b) => a - b)
            const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0
            const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
            resolve({ median, p95, count: sorted.length })
          }
        }, 16)
      })
    },
    { warmupMs: WARMUP_MS, totalMs: TOTAL_MS }
  )

  console.log(`[fps-horde] échantillons=${sample.count} médiane=${sample.median.toFixed(2)}ms p95=${sample.p95.toFixed(2)}ms`)

  // Budget indulgent (WebGL LOGICIEL SwiftShader) : ce test détecte une régression
  // ALGORITHMIQUE (O(N²)) à 500 ennemis — PAS le matériel réel du joueur (qui vise
  // 60 fps ; l'oracle perf réel = overlay `?perf=1` sur device). La MÉDIANE est le vrai
  // garde-fou : une régression quadratique la ferait exploser en centaines de ms.
  //
  // SEUILS RÉTABLIS (2026-07-17) aux valeurs d'origine 33/50. Le commit 12d63ef les
  // avait relâchés à 50/175 sur la foi d'une « élévation » (médiane ≈27-38 ms,
  // p95 ≈108 ms) attribuée aux scanlines CRT (74e9ed1). Cette élévation NE SE
  // REPRODUIT PAS — re-mesurée le 2026-07-17, spec réelle inchangée :
  //   · en isolation   : médiane 16,30 ms · p95 22,30 ms
  //   · en suite pleine: médiane 16,20 ms · p95 22,70 ms (chromium)
  //                      médiane 16,10 ms · p95 18,30 ms (mobile)
  // A/B dans la même page (scanlines masquées, cadre masqué, overlay ENTIER masqué) :
  // delta ≤ 0,2 ms sur la médiane = bruit. Les scanlines sont INNOCENTES ; les
  // chiffres de 12d63ef étaient un artefact de charge machine, pas du code.
  //
  // Médiane < 33 (≥ 30 fps) : le plancher structurel est 16 ms (période du
  // setInterval) → 2× de marge sur un signal mesuré stable à ±0,3 ms.
  expect(sample.median).toBeLessThan(33)
  // p95 < 50 : max observé 26,6 ms sur 19 mesures (isolation + suite pleine, 2 projets)
  // → ~2× de marge. Ce seuil reste sensible à la charge machine (la queue capte GC/
  // scheduling) ; s'il devient instable, c'est la MÉTHODE de mesure qu'il faut durcir,
  // pas le seuil qu'il faut relâcher — un plafond à 175 ms ne gardait plus rien.
  expect(sample.p95).toBeLessThan(50)
})
