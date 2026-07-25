import { performance } from 'node:perf_hooks'
import { Simulation } from '@core/simulation'
import { SPAWN } from '@content/config'
import { botMove } from '../sim/bots'

/**
 * `perf:check` — gate anti-régression du COÛT CPU du pas de simulation en horde
 * dense (pire cas). Headless : ne mesure QUE `src/core` (pas de DOM, pas de rendu).
 *
 * Le rendu et le fill-rate mobile ne sont PAS couverts ici (ils dépendent du GPU
 * device → overlay `?perf=1` sur vrai téléphone). Ce gate garde le seul terme
 * mesurable en CI : le budget CPU du pas de sim à densité forcée.
 *
 * DEUX densités mesurées :
 *  - régime normal (≈`SPAWN.maxActive`) — le pire cas 0→20 min ;
 *  - FINALE (≈`spawnCapAt(20:00)` = 700) — la saturation spectacle 20:00→22:00.
 *    Prouve que 700 ennemis tiennent le budget CPU (l'IA lit un flow field
 *    O(1)/ennemi, pas de séparation O(n²) → coût ~linéaire).
 *
 * Un bot qui kite avec armes auto NETTOIE la horde → pour mesurer le PIRE cas, on
 * force la densité via `debugSpawnEnemies` (top-up chaque frame, HORS chronométrage)
 * et on ne chronomètre que `advanceTime`. Réutilise le vrai code de prod.
 */

const SEED = 42
const STEP_MS = 16.6667 // un pas ≈ une frame réelle (60 FPS)
const WARMUP_STEPS = 60 // ~1 s : lance le run, arme un peu le joueur
const MEASURE_STEPS = 240 // ~4 s de pas denses chronométrés

interface PassResult {
  median: number
  maxStep: number
  count: number
  peakEnemies: number
}

/**
 * Mesure le coût par frame d'`advanceTime` à densité forcée. On garde la MÉDIANE
 * (p50) : c'est le coût de frame TYPIQUE, robuste aux pics GC/JIT isolés (la
 * moyenne, elle, explose sur un seul pic de warm-up et rend le gate instable sous
 * charge machine). Le `maxStep` reste affiché pour information.
 */
function measure(targetEnemies: number): PassResult {
  const sim = new Simulation({ seed: SEED, mode: 'solo' })
  for (let i = 0; i < WARMUP_STEPS; i += 1) {
    const s = sim.getState()
    if (s.pendingLevelUp !== null) {
      sim.chooseUpgrade(0)
      continue
    }
    sim.setInput(1, { move: botMove('kite', s), attack: false })
    sim.advanceTime(STEP_MS)
  }

  const samples: number[] = []
  let maxStep = 0
  let peakEnemies = 0
  for (let step = 0; step < MEASURE_STEPS; step += 1) {
    const s = sim.getState()
    if (s.scene === 'gameover' || s.scene === 'won') {
      break
    }
    if (s.pendingLevelUp !== null) {
      sim.chooseUpgrade(0)
      continue
    }
    const n = s.enemies.length
    if (n < targetEnemies) {
      sim.debugSpawnEnemies(targetEnemies - n) // top-up hors chronométrage
    }
    sim.setInput(1, { move: botMove('kite', s), attack: false })
    const t0 = performance.now()
    sim.advanceTime(STEP_MS)
    const dt = performance.now() - t0
    samples.push(dt)
    if (dt > maxStep) {
      maxStep = dt
    }
    const after = sim.getState().enemies.length
    if (after > peakEnemies) {
      peakEnemies = after
    }
  }
  samples.sort((a, b) => a - b)
  const median = samples.length > 0 ? (samples[Math.floor(samples.length / 2)] ?? 0) : 0
  return { median, maxStep, count: samples.length, peakEnemies }
}

const NORMAL_TARGET = 200
const FINALE_TARGET = 700 // = spawnCapAt(FINALE.fullMs) ; borné statiquement pour le log

/**
 * Le budget ABSOLU dépend de la machine (baseline quiet ~0,5 ms, mais un poste
 * chargé/CI lent médiane facilement 2–3 ms) → un seuil absolu strict est fragile.
 * On garde donc DEUX garde-fous :
 *  - un plafond absolu LARGE (attrape une vraie explosion, tolère la charge poste) ;
 *  - le RATIO finale/normal (INVARIANT à la vitesse machine) : c'est LUI qui prouve
 *    « 700 ne flingue pas les perf » — le coût par frame doit croître AU PLUS
 *    linéairement avec le nombre d'ennemis (≤ 700/200 = 3,5×). Observé : ~2,7×
 *    (sous-linéaire, grâce au flow field O(1)/ennemi et aux coûts fixes amortis).
 */
const ABS_CEILING_MS = 8.0 // plafond absolu large (médiane normale), anti-explosion
const RATIO_MAX = 3.6 // ≤ ~linéaire (marge fine au-dessus de 3,5)

function main(): void {
  const round = (x: number): number => Math.round(x * 1000) / 1000
  // On mesure (le budget interne n'est plus décisif : le verdict est calculé ici).
  const normal = measure(NORMAL_TARGET)
  const finale = measure(FINALE_TARGET)

  const ratio = normal.median > 0 ? finale.median / normal.median : Infinity
  const measured = normal.count > 0 && finale.count > 0
  const absOk = normal.median < ABS_CEILING_MS && finale.median < ABS_CEILING_MS * (FINALE_TARGET / NORMAL_TARGET)
  const ratioOk = ratio <= RATIO_MAX
  const ok = measured && absOk && ratioOk

  process.stdout.write(
    `perf:check — NORMAL (plafond ${SPAWN.maxActive}, vu ${normal.peakEnemies}) : ` +
      `médiane ${round(normal.median)} ms, max ${round(normal.maxStep)} ms / ${normal.count} pas\n` +
    `perf:check — FINALE (cible ${FINALE_TARGET}, vu ${finale.peakEnemies}) : ` +
      `médiane ${round(finale.median)} ms, max ${round(finale.maxStep)} ms / ${finale.count} pas\n` +
    `perf:check — ratio finale/normal = ${round(ratio)}× (max ${RATIO_MAX}×, ennemis ×${round(FINALE_TARGET / NORMAL_TARGET)}) ` +
      `→ ${ok ? 'PASS' : 'FAIL'}\n`
  )
  if (!measured) {
    process.stderr.write('perf:check — AUCUN pas mesure (run termine trop tot ?).\n')
  }
  process.exit(ok ? 0 : 1)
}

main()
