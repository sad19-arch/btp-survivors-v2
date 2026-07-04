import type { BotAggregate } from './metrics'

const BLOCKS = '▁▂▃▄▅▆▇█'

export function sparkline(values: number[], opts: { min?: number; max?: number } = {}): string {
  if (values.length === 0) {
    return ''
  }
  const min = opts.min ?? Math.min(...values)
  const max = opts.max ?? Math.max(...values)
  const span = max - min
  return values
    .map((v) => {
      if (span <= 0) {
        return BLOCKS.charAt(0)
      }
      const idx = Math.round(((v - min) / span) * (BLOCKS.length - 1))
      return BLOCKS.charAt(Math.max(0, Math.min(BLOCKS.length - 1, idx)))
    })
    .join('')
}

function sec(ms: number): string {
  return `${Math.round(ms / 1000)}s`
}

export function renderSummaryTable(aggs: BotAggregate[]): string {
  const lines = ['bot      | survie méd | %survie pleine | % victoire | niv@5:00 | pic ennemis']
  lines.push('---------|------------|----------------|------------|----------|------------')
  for (const a of aggs) {
    lines.push(
      `${a.bot.padEnd(8)} | ${sec(a.survivalMsMedian).padStart(10)} | ` +
        `${`${Math.round(a.survivedFullPct)}%`.padStart(14)} | ` +
        `${`${Math.round(a.winPct)}%`.padStart(10)} | ` +
        `${String(Math.round(a.levelAt5minMedian)).padStart(8)} | ` +
        `${String(Math.round(a.peakEnemiesMedian)).padStart(11)}`
    )
  }
  return lines.join('\n')
}

export function renderCurves(aggs: BotAggregate[]): string {
  const lines: string[] = []
  for (const a of aggs) {
    lines.push(`[${a.bot}] HP%      ${sparkline(a.hpPctCurve, { min: 0, max: 100 })}`)
    lines.push(`[${a.bot}] ennemis  ${sparkline(a.enemiesCurve)}`)
  }
  return lines.join('\n')
}

export function renderDiff(current: BotAggregate[], baseline: BotAggregate[]): string {
  const byBot = new Map(baseline.map((b) => [b.bot, b]))
  const lines = ['--- diff vs baseline (survie méd / niv@5:00 / pic ennemis) ---']
  for (const a of current) {
    const b = byBot.get(a.bot)
    if (b === undefined) {
      lines.push(`${a.bot}: (pas de baseline)`)
      continue
    }
    const dSurv = Math.round((a.survivalMsMedian - b.survivalMsMedian) / 1000)
    const dLvl = Math.round(a.levelAt5minMedian - b.levelAt5minMedian)
    const dPeak = Math.round(a.peakEnemiesMedian - b.peakEnemiesMedian)
    const sign = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)
    lines.push(`${a.bot.padEnd(8)} | ${sign(dSurv)}s | niv ${sign(dLvl)} | pic ${sign(dPeak)}`)
  }
  return lines.join('\n')
}
