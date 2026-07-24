import { Simulation } from '@core/simulation'
import { botMove, type BotName } from './bots'
import type { RunResult, Sample } from './metrics'
import { ConstructionPhaseId } from '@content/phases'

export interface RunOptions {
  durationSec: number
  stepMs: number
  sampleEveryMs: number
  phaseId: ConstructionPhaseId
}

const DEFAULTS: RunOptions = {
  durationSec: 480,
  stepMs: 100,
  sampleEveryMs: 10000,
  phaseId: ConstructionPhaseId.TERRAIN_VIERGE
}
const EARLY_GAME_MS = 90000

export function runOne(seed: number, bot: BotName, opts: Partial<RunOptions> = {}): RunResult {
  const { durationSec, stepMs, sampleEveryMs, phaseId } = { ...DEFAULTS, ...opts }
  const sim = new Simulation({ seed, mode: 'solo', phaseId })
  const targetMs = durationSec * 1000

  const samples: Sample[] = []
  let minHp = Infinity
  let minHpPct = 100
  let maxEnemies = 0
  let nanSeen = false
  let survived = true
  let won = false
  let survivalMs = targetMs
  const observationMs = Math.min(targetMs, EARLY_GAME_MS)
  let firstEnemyMs: number | null = null
  let firstKillMs: number | null = null
  let firstLevelUpMs: number | null = null
  let enemyFreeMs = 0
  let previousKills = 0
  let lastKillMs = 0
  let longestKillGapMs = 0
  let earlyHpPct = 100
  const killsPer15Sec = Array.from({ length: Math.ceil(observationMs / 15000) }, () => 0)

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
      if (t < observationMs) {
        earlyHpPct = p.maxHp > 0 ? (p.hp / p.maxHp) * 100 : 0
        if (s.enemies.length === 0) {
          enemyFreeMs += Math.min(stepMs, observationMs - t)
        } else if (firstEnemyMs === null) {
          firstEnemyMs = s.elapsedMs
        }
        if (p.level > 1 && firstLevelUpMs === null) {
          firstLevelUpMs = s.elapsedMs
        }
        if (p.kills > previousKills) {
          const gained = p.kills - previousKills
          firstKillMs ??= s.elapsedMs
          longestKillGapMs = Math.max(longestKillGapMs, s.elapsedMs - lastKillMs)
          lastKillMs = s.elapsedMs
          const bucket = Math.min(Math.floor(s.elapsedMs / 15000), killsPer15Sec.length - 1)
          if (bucket >= 0) {
            killsPer15Sec[bucket] = (killsPer15Sec[bucket] ?? 0) + gained
          }
        }
        previousKills = p.kills
      }
    }
    maxEnemies = Math.max(maxEnemies, s.enemies.length)
    sim.setInput(1, { move: botMove(bot, s), attack: false })
    sim.advanceTime(stepMs)
  }

  const final = sim.getState()
  const fp = final.players[0]
  const observedUntilMs = Math.min(observationMs, final.elapsedMs)
  longestKillGapMs = Math.max(longestKillGapMs, observedUntilMs - lastKillMs)
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
    maxEnemies,
    earlyGame: {
      observationMs: observedUntilMs,
      firstEnemyMs,
      firstKillMs,
      firstLevelUpMs,
      longestKillGapMs,
      enemyFreeMs,
      killsPer15Sec,
      hpLostPct: 100 - earlyHpPct
    }
  }
}
