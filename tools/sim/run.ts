/**
 * Harness « Claude joue pour valider » — instrument de mesure d'équilibrage.
 *
 * Balaye plusieurs seeds × bots, échantillonne des séries temporelles, imprime
 * un tableau récap + sparklines + PASS/FAIL vs cibles, et gère une baseline
 * (avant/après). Déterministe : seeds énumérées.
 *
 * Usage:
 *   npm run sim                                  # défauts (10 seeds, 3 bots, 480s)
 *   npm run sim -- --seeds 10 --bots kite,greedy,idle --duration 480
 *   npm run sim -- --seed 42 --bot kite --duration 120   # compat run unique
 *   npm run sim -- --baseline save               # écrit tools/sim/baseline.json
 *   npm run sim -- --enforce                      # cibles bloquantes (exit 1)
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runOne } from './runOne'
import { aggregate, aggregateEarlyGame, type BotAggregate, type RunResult } from './metrics'
import { renderSummaryTable, renderCurves, renderDiff, renderEarlyGame } from './render'
import { evaluateTargets } from './targets'
import { saveBaseline, loadBaseline } from './baseline'
import { BOT_NAMES, isBotName, type BotName } from './bots'
import { SPAWN } from '@content/config'
import { phaseIdFromLevel, type ConstructionPhaseId } from '@content/phases'

/**
 * Marge de sécurité au-dessus de `SPAWN.maxActive` : les boss (mid/final) sont
 * des ennemis qui apparaissent HORS du plafond de vague (condition de victoire,
 * jamais clampés). Le pic légitime = maxActive + quelques boss simultanés.
 */
const ENEMY_SANITY_MARGIN = 8

const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'baseline.json')

interface Args {
  seeds: number[]
  bots: BotName[]
  durationSec: number
  saveBaseline: boolean
  enforce: boolean
  phaseId: ConstructionPhaseId
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined
}

function parseArgs(argv: string[]): Args {
  const single = flag(argv, '--seed')
  const list = flag(argv, '--seeds')
  let seeds: number[]
  if (single !== undefined) {
    seeds = [Number.parseInt(single, 10)]
  } else if (list !== undefined && list.includes(',')) {
    seeds = list
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n))
  } else {
    const n = list !== undefined ? Number.parseInt(list, 10) : 10
    seeds = Array.from({ length: n }, (_, i) => i + 1)
  }

  const botArg = flag(argv, '--bot') ?? flag(argv, '--bots')
  const bots: BotName[] =
    botArg !== undefined
      ? botArg.split(',').map((b) => b.trim()).filter(isBotName)
      : [...BOT_NAMES]

  return {
    seeds,
    bots: bots.length > 0 ? bots : [...BOT_NAMES],
    durationSec: Number.parseInt(flag(argv, '--duration') ?? '480', 10),
    saveBaseline: flag(argv, '--baseline') === 'save',
    enforce: argv.includes('--enforce'),
    phaseId: phaseIdFromLevel(flag(argv, '--level') ?? null)
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  console.log(
    '[sim] stage=%s seeds=%s bots=%s duration=%ds',
    args.phaseId,
    args.seeds.join(','),
    args.bots.join(','),
    args.durationSec
  )

  const aggregates: BotAggregate[] = []
  const earlyReports: string[] = []
  let nanSeen = false
  let minHp = Infinity
  let maxEnemies = 0

  for (const bot of args.bots) {
    const results: RunResult[] = []
    for (const seed of args.seeds) {
      const r = runOne(seed, bot, { durationSec: args.durationSec, phaseId: args.phaseId })
      results.push(r)
      nanSeen = nanSeen || r.nanSeen
      minHp = Math.min(minHp, r.minHp)
      maxEnemies = Math.max(maxEnemies, r.maxEnemies)
    }
    aggregates.push(aggregate(results))
    earlyReports.push(renderEarlyGame(bot, aggregateEarlyGame(results)))
  }

  console.log('\n' + renderSummaryTable(aggregates))
  console.log('\n' + renderCurves(aggregates))
  console.log('\n--- diagnostic early-game (active = référence joueur ; autres = limites) ---\n' + earlyReports.join('\n'))

  if (args.saveBaseline) {
    saveBaseline(BASELINE_PATH, aggregates)
    console.log('\n[sim] baseline écrite → %s', BASELINE_PATH)
  } else {
    const base = loadBaseline(BASELINE_PATH)
    if (base !== null) {
      console.log('\n' + renderDiff(aggregates, base))
    }
  }

  const report = evaluateTargets(aggregates)
  console.log('\n--- cibles « skill récompensé » ---')
  if (report.pass) {
    console.log('[sim] cibles VERTES ✓')
  } else {
    console.log('[sim] cibles ROUGES:\n - ' + report.failures.join('\n - '))
  }

  // --- invariants sanity (toujours bloquants) ---
  const sanity: string[] = []
  if (nanSeen) {
    sanity.push('position/HP NaN détecté')
  }
  if (minHp < 0) {
    sanity.push(`HP négatif silencieux (min=${minHp})`)
  }
  if (maxEnemies > SPAWN.maxActive + ENEMY_SANITY_MARGIN) {
    sanity.push(`plafond d'ennemis dépassé (${maxEnemies})`)
  }
  if (sanity.length > 0) {
    console.error('\n[sim] INVARIANTS SANITY ROUGES:\n - ' + sanity.join('\n - '))
    process.exit(1)
  }

  if (args.enforce && !report.pass) {
    process.exit(1)
  }
}

main()
