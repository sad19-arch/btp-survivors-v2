/**
 * site-plan-ascii — ÉTAPE 4 de la méthode « plan de chantier » : rend le plan
 * masse d'un stage en ASCII (1 caractère = 320 px), généré depuis le VRAI plan
 * seedé (`buildSitePlan`). Artefact de revue humaine : on juge/corrige le PLAN
 * avant de peindre le moindre pixel.
 *
 * Usage : npm run site:plan -- --stage terrassement --seed 1
 */

import { buildSitePlan } from '@core/sitePlan'
import type { SitePlan, PlanSeg } from '@core/sitePlan'
import { SITE_PROGRAMS } from '@content/sitePrograms'

const CELL = 320
const WORLD_W = 10240
const WORLD_H = 7680

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`)
  const v = idx >= 0 ? process.argv[idx + 1] : undefined
  return v ?? fallback
}

/** Indice de cellule d'un point (grille semi-ouverte : pas d'aliasing de frontière). */
function cellOf(v: number): number {
  return Math.floor(v / CELL)
}

/** True si le point tombe dans la cellule (i, j). */
function pointInCell(x: number, y: number, i: number, j: number): boolean {
  return cellOf(x) === i && cellOf(y) === j
}

/** True si le segment axis-aligned traverse la cellule (i, j). */
function segInCell(s: PlanSeg, i: number, j: number): boolean {
  if (s.y1 === s.y2) {
    if (cellOf(s.y1) !== j) {
      return false
    }
    const lo = Math.min(s.x1, s.x2)
    const hi = Math.max(s.x1, s.x2)
    return hi >= i * CELL && lo < (i + 1) * CELL
  }
  if (cellOf(s.x1) !== i) {
    return false
  }
  const lo = Math.min(s.y1, s.y2)
  const hi = Math.max(s.y1, s.y2)
  return hi >= j * CELL && lo < (j + 1) * CELL
}

function render(plan: SitePlan): string {
  const cols = Math.round(plan.worldW / CELL)
  const rows = Math.round(plan.worldH / CELL)
  const spawn = { x: plan.worldW / 2, y: plan.worldH / 2 }
  const lines: string[] = []
  for (let j = 0; j < rows; j++) {
    let line = ''
    for (let i = 0; i < cols; i++) {
      line += cellChar(plan, spawn, i, j)
    }
    lines.push(`${line}  ${j}`)
  }
  return lines.join('\n')
}

function cellChar(plan: SitePlan, spawn: { x: number; y: number }, i: number, j: number): string {
  // Priorités : portail > spawn > ouverture > clôture > chemin > zone > route > libre.
  if (pointInCell(plan.gate.x, plan.gate.y, i, j)) {
    return 'G'
  }
  if (pointInCell(spawn.x, spawn.y, i, j)) {
    return '*'
  }
  for (const z of plan.zones) {
    for (const o of z.openings) {
      if (pointInCell(o.x, o.y, i, j)) {
        return 'o'
      }
    }
  }
  for (const f of plan.fences) {
    if (segInCell(f, i, j)) {
      return '#'
    }
  }
  for (const p of plan.paths) {
    if (segInCell(p, i, j)) {
      return '='
    }
  }
  const x = (i + 0.5) * CELL
  const y = (j + 0.5) * CELL
  for (const z of plan.zones) {
    if (Math.abs(x - z.cx) <= z.halfW && Math.abs(y - z.cy) <= z.halfH) {
      return z.glyph
    }
  }
  if (y >= plan.routeTopY) {
    return 'R'
  }
  return '.'
}

function legend(plan: SitePlan, stageId: string): string {
  const zoneLines = plan.zones
    .map((z) => `  ${z.glyph} ${z.id} (${z.role}${z.fenced ? ', clôturée' : ''})`)
    .join('\n')
  return (
    `Stage : ${stageId} — 1 caractère = ${CELL} px (monde ${plan.worldW}×${plan.worldH})\n` +
    `  R route   G portail   # clôture   o ouverture   = chemin   * spawn   . libre\n` +
    zoneLines
  )
}

const stageId = arg('stage', 'terrassement')
const seed = parseInt(arg('seed', '1'), 10)

if (SITE_PROGRAMS[stageId] === undefined) {
  console.log(`Stage « ${stageId} » sans programme. Programmes disponibles : ${Object.keys(SITE_PROGRAMS).join(', ')}`)
  process.exit(1)
}
const plan = buildSitePlan(seed, WORLD_W, WORLD_H, stageId)
if (plan === null) {
  console.log('Plan nul (stage sans programme).')
  process.exit(1)
}
console.log(legend(plan, stageId))
console.log('')
console.log(render(plan))
