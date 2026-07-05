import { Simulation } from '@core/simulation'
import { botMove, type BotName } from './bots'
import type { RunResult, Sample } from './metrics'

export interface RunOptions {
  durationSec: number
  stepMs: number
  sampleEveryMs: number
}

const DEFAULTS: RunOptions = { durationSec: 480, stepMs: 100, sampleEveryMs: 10000 }

export function runOne(seed: number, bot: BotName, opts: Partial<RunOptions> = {}): RunResult {
  const { durationSec, stepMs, sampleEveryMs } = { ...DEFAULTS, ...opts }
  const sim = new Simulation({ seed, mode: 'solo' })
  const targetMs = durationSec * 1000

  const samples: Sample[] = []
  let minHp = Infinity
  let minHpPct = 100
  let maxEnemies = 0
  let nanSeen = false
  let survived = true
  let won = false
  let survivalMs = targetMs

  for (let t = 0; t < targetMs; t += stepMs) {
    const s = sim.getState()
    if (s.scene === 'gameover') {
      survived = false
      survivalMs = s.elapsedMs
      break
    }
    if (s.scene === 'won') {
      // Boss final tué → victoire (le run s'arrête, il a « gagné »).
      won = true
      survivalMs = s.elapsedMs
      break
    }
    if (s.pendingLevelUp !== null) {
      sim.chooseUpgrade(0)
      continue
    }
    const p = s.players[0]
    if (p !== undefined) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp)) {
        nanSeen = true
      }
      minHp = Math.min(minHp, p.hp)
      if (p.maxHp > 0) {
        minHpPct = Math.min(minHpPct, (p.hp / p.maxHp) * 100)
      }
      if (t % sampleEveryMs === 0) {
        samples.push({
          tSec: Math.round(t / 1000),
          hpPct: p.maxHp > 0 ? (p.hp / p.maxHp) * 100 : 0,
          enemies: s.enemies.length,
          level: p.level,
          score: s.score
        })
      }
    }
    maxEnemies = Math.max(maxEnemies, s.enemies.length)
    sim.setInput(1, { move: botMove(bot, s), attack: false })
    sim.advanceTime(stepMs)
  }

  const final = sim.getState()
  const fp = final.players[0]
  const at5min = samples.filter((s) => s.tSec <= 300)
  return {
    seed,
    bot,
    samples,
    survived,
    wonTheGame: won || final.scene === 'won',
    survivalMs,
    finalLevel: fp?.level ?? 0,
    levelAt5min: at5min[at5min.length - 1]?.level ?? fp?.level ?? 0,
    peakEnemies: maxEnemies,
    nanSeen,
    minHp: minHp === Infinity ? 0 : minHp,
    minHpPct,
    maxEnemies
  }
}
