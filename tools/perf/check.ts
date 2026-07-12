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
 * mesurable en CI : le budget CPU du pas de sim au plafond d'ennemis.
 *
 * Un bot qui kite avec armes auto NETTOIE la horde (la densité naturelle reste
 * basse — « swarm feeds power »). Pour mesurer le PIRE cas, on force la densité
 * au plafond via `debugSpawnEnemies` (top-up chaque frame, HORS chronométrage) et
 * on ne chronomètre que `advanceTime`. Réutilise le vrai code de prod
 * (`Simulation`, `botMove`). `performance.now()` autorisé ici (outil Node).
 */

const SEED = 42
const STEP_MS = 16.6667 // un pas ≈ une frame réelle (60 FPS)
const WARMUP_STEPS = 60 // ~1 s : lance le run, arme un peu le joueur
const MEASURE_STEPS = 240 // ~4 s de pas denses chronométrés
const TARGET_ENEMIES = 200 // densité forcée, proche de SPAWN.maxActive (220)
const BUDGET_MS = 2.0 // baseline ~0,5 ms ; ×4 (mobile) = 8 ms < 16,6 ms @60 FPS

function main(): void {
  const sim = new Simulation({ seed: SEED, mode: 'solo' })

  // Warmup : démarre le run, laisse le joueur s'équiper (hors mesure).
  for (let i = 0; i < WARMUP_STEPS; i += 1) {
    const s = sim.getState()
    if (s.pendingLevelUp !== null) {
      sim.chooseUpgrade(0)
      continue
    }
    sim.setInput(1, { move: botMove('kite', s), attack: false })
    sim.advanceTime(STEP_MS)
  }

  // Mesure : force la densité au plafond et chronomètre UNIQUEMENT advanceTime.
  let sum = 0
  let count = 0
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
    if (n < TARGET_ENEMIES) {
      sim.debugSpawnEnemies(TARGET_ENEMIES - n) // top-up hors chronométrage
    }
    sim.setInput(1, { move: botMove('kite', s), attack: false })
    const t0 = performance.now()
    sim.advanceTime(STEP_MS)
    const dt = performance.now() - t0
    sum += dt
    count += 1
    if (dt > maxStep) {
      maxStep = dt
    }
    const after = sim.getState().enemies.length
    if (after > peakEnemies) {
      peakEnemies = after
    }
  }

  const round = (x: number): number => Math.round(x * 1000) / 1000
  const avg = count > 0 ? sum / count : 0
  const ok = count > 0 && avg < BUDGET_MS

  process.stdout.write(
    `perf:check — pas de sim en horde forcee (plafond vu ${peakEnemies}, cap ${SPAWN.maxActive}) : ` +
      `moy ${round(avg)} ms, max ${round(maxStep)} ms sur ${count} pas ` +
      `(budget ${BUDGET_MS} ms) → ${ok ? 'PASS' : 'FAIL'}\n`
  )
  if (count === 0) {
    process.stderr.write('perf:check — AUCUN pas mesure (run termine trop tot ?).\n')
  }
  process.exit(ok ? 0 : 1)
}

main()
