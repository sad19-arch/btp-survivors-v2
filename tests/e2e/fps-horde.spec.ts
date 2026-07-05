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
 * volontairement indulgent. OBSERVÉ en local (3 runs, CI headless, WebGL
 * logiciel SwiftShader, mode lite, 500 ennemis, sim réellement avancée) :
 * médiane ≈ 16 ms, p95 ≈ 18.7-18.8 ms — très en dessous du budget, avec une
 * marge d'un ordre de grandeur. Une régression O(N²) sur 500 ennemis ferait
 * exploser ces chiffres de façon flagrante et resterait détectée même avec de
 * rares outliers isolés (filtrés par la médiane/p95, pas le max).
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

  // Budget indulgent (WebGL logiciel CI) : détecte une régression O(N²), pas
  // le matériel réel de l'utilisateur (qui vise 60 fps). Observé ≈16ms
  // médiane / ≈18.8ms p95 sur cette machine — large marge avant 33ms.
  expect(sample.median).toBeLessThan(33)
  // p95 aussi sous contrôle: une régression O(N²) dégraderait les deux, pas
  // seulement les outliers isolés du scheduling.
  expect(sample.p95).toBeLessThan(50)
})
