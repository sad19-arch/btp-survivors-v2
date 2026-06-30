import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { BotAggregate } from './metrics'

export interface BaselineFile {
  aggregates: BotAggregate[]
}

export function saveBaseline(path: string, aggs: BotAggregate[]): void {
  const data: BaselineFile = { aggregates: aggs }
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
}

export function loadBaseline(path: string): BotAggregate[] | null {
  if (!existsSync(path)) {
    return null
  }
  const raw = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw) as BaselineFile
  return parsed.aggregates
}
