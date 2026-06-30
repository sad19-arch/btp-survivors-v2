# Tuning d'équilibrage « skill récompensé » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire l'instrument de mesure (harness `sim` étendu : séries temporelles, balayage multi-seed/multi-bot, sparklines, baseline/diff, cibles), mesurer l'équilibrage existant, puis tuner les leviers data-driven jusqu'au feel « skill récompensé ».

**Architecture:** L'instrument vit dans `tools/sim/` et lit **uniquement** `getState()` du vrai cœur de jeu (`src/core/simulation.ts`) — le cœur reste pur et déterministe, l'instrument ne le mute jamais. Les modules purs (agrégation, rendu, cibles) ne dépendent pas de `Simulation` et sont testés en Vitest. Le seul levier de gameplay touchant le code est la **rampe de spawn temporelle** (`src/content/spawnRamp.ts`), lue par `runSpawns`. Tout le reste du tuning = valeurs dans `src/content`.

**Tech Stack:** TypeScript strict, Vitest (`happy-dom`), `tsx` (exécution du harness), alias `@core`/`@content`.

## Global Constraints

- `src/core` et `src/content` n'importent JAMAIS Phaser ni le DOM. (CLAUDE.md règle 1)
- Interdit dans `src/core`/`src/content` : `Math.random()`, `Date.now()`, `new Date()` — RNG seedé + `FixedClock`. (règle 2)
- Zéro `any`. ESLint strict, `--max-warnings 0`. (règle 6)
- Équilibrage = données typées dans `src/content`, jamais en dur dans les systèmes. (règle 5)
- Déterminisme : même seed + mêmes inputs ⇒ même partie. Seeds du balayage **énumérées** (1..N), pas aléatoires.
- Texte in-game / sorties en français.
- Style de test : `import { describe, it, expect } from 'vitest'`, descriptions en français, accès défensif (`?? 0`) — pas de `!` non-null.
- Tests unitaires dans `tests/unit/**/*.test.ts` (seul motif inclus par Vitest). Imports via `@core`/`@content` ou relatifs `../../tools/sim/*`.
- Le harness garde la **compat CLI** : `--seed`/`--bot` (singulier) doivent continuer à marcher en plus de `--seeds`/`--bots`.
- Pas de commit/push sans accord — ici l'utilisateur a validé le déroulé ; chaque tâche se termine par un commit.

---

## File Structure

**Couche A — instrument (`tools/sim/`)**, découpé par responsabilité :

- `tools/sim/bots.ts` — définition des bots (`kite`/`greedy`/`idle`) : `botMove(bot, state) => Vec2`. (extrait de `run.ts`)
- `tools/sim/metrics.ts` — types `Sample`/`RunResult`/`BotAggregate`, `median()`, `aggregate()`. **Pur** (zéro import de `Simulation`).
- `tools/sim/runOne.ts` — `runOne(seed, bot, opts) => RunResult`. Importe `Simulation`.
- `tools/sim/targets.ts` — `TARGETS` (cibles « skill récompensé ») + `evaluateTargets()`. **Pur**.
- `tools/sim/render.ts` — `sparkline()`, `renderSummaryTable()`, `renderCurves()`, `renderDiff()`. **Pur**.
- `tools/sim/baseline.ts` — `saveBaseline()`, `loadBaseline()` (lecture/écriture JSON via `node:fs`).
- `tools/sim/run.ts` — orchestration CLI (réécrit) : parse args, balayage, agrège, rend, baseline/diff, code de sortie.
- `tools/sim/baseline.json` — snapshot des agrégats (créé en Couche B, étape mesure).

**Couche B — leviers (`src/content/`)** :

- `src/content/spawnRamp.ts` — **nouveau** : `SpawnRampStep`, `SPAWN_RAMP`, `spawnParamsAt(ramp, elapsedMs)`.
- `src/core/simulation.ts` — `runSpawns` lit la rampe (modif ciblée).
- `src/content/config.ts` / `weapons.ts` / `enemies.ts` — valeurs tunées (étapes itératives).

**Tests** : `tests/unit/simMetrics.test.ts`, `simRender.test.ts`, `simTargets.test.ts`, `simRunOne.test.ts`, `spawnRamp.test.ts`.

---

## PHASE 1 — Instrument de mesure (Couche A)

### Task 1: Extraire les bots dans `tools/sim/bots.ts`

**Files:**
- Create: `tools/sim/bots.ts`
- Modify: `tools/sim/run.ts` (retire `botMove`, importe-le)
- Test: `tests/unit/simRunOne.test.ts` (créé en Task 4 ; pas de test ici — refactor pur couvert par le harness existant)

**Interfaces:**
- Produces: `export type BotName = 'kite' | 'greedy' | 'idle'` ; `export function botMove(bot: BotName, s: GameState): Vec2`

- [ ] **Step 1: Créer `tools/sim/bots.ts`** — déplacer la fonction `botMove` actuelle de `run.ts`, en typant le paramètre `bot: BotName`.

```ts
import type { GameState, Vec2 } from '@core/types'

export type BotName = 'kite' | 'greedy' | 'idle'

export const BOT_NAMES: readonly BotName[] = ['kite', 'greedy', 'idle']

export function isBotName(s: string): s is BotName {
  return (BOT_NAMES as readonly string[]).includes(s)
}

/** Vecteur de déplacement du bot pour la frame courante. */
export function botMove(bot: BotName, s: GameState): Vec2 {
  const p = s.players[0]
  if (p === undefined || bot === 'idle') {
    return { x: 0, y: 0 }
  }
  if (bot === 'greedy') {
    const targets = s.pickups.length > 0 ? s.pickups : s.enemies
    let tx = p.x
    let ty = p.y
    let bd = Infinity
    for (const t of targets) {
      const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2
      if (d < bd) {
        bd = d
        tx = t.x
        ty = t.y
      }
    }
    return { x: tx - p.x, y: ty - p.y }
  }
  // kite : fuit l'ennemi le plus proche, se recentre près des bords.
  let nx = 0
  let ny = 0
  let bd = Infinity
  for (const e of s.enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
    if (d < bd) {
      bd = d
      nx = p.x - e.x
      ny = p.y - e.y
    }
  }
  const cx = 800 - p.x
  const cy = 600 - p.y
  const edge = Math.hypot(cx, cy) > 500 ? 2 : 0
  return { x: nx + cx * edge, y: ny + cy * edge }
}
```

- [ ] **Step 2: Mettre `run.ts` en accord temporairement** — dans `tools/sim/run.ts`, supprimer la fonction locale `botMove` et ajouter `import { botMove, type BotName } from './bots'`. Adapter `parseArgs` pour que `bot` soit typé `BotName` (cast validé via `isBotName`, défaut `'kite'`). (Le run.ts sera réécrit en Task 7 ; ici on garde juste un état compilable.)

- [ ] **Step 3: Vérifier que ça compile et tourne**

Run: `npm run type-check && npm run sim -- --seed 42 --duration 30 --bot kite`
Expected: type-check vert ; sortie `[sim] ...` identique à avant (refactor sans changement de comportement).

- [ ] **Step 4: Commit**

```bash
git add tools/sim/bots.ts tools/sim/run.ts
git commit -m "refactor(sim): extrait les bots dans tools/sim/bots.ts"
```

---

### Task 2: Types & agrégation purs (`tools/sim/metrics.ts`)

**Files:**
- Create: `tools/sim/metrics.ts`
- Test: `tests/unit/simMetrics.test.ts`

**Interfaces:**
- Produces:
  - `export interface Sample { tSec: number; hpPct: number; enemies: number; level: number; score: number }`
  - `export interface RunResult { seed: number; bot: string; samples: Sample[]; survived: boolean; survivalMs: number; finalLevel: number; levelAt5min: number; peakEnemies: number; nanSeen: boolean; minHp: number; maxEnemies: number }`
  - `export interface BotAggregate { bot: string; runs: number; survivedFullPct: number; survivalMsMedian: number; survivalMsMin: number; survivalMsMax: number; levelAt5minMedian: number; peakEnemiesMedian: number; bucketSec: number; hpPctCurve: number[]; enemiesCurve: number[] }`
  - `export function median(xs: number[]): number`
  - `export function aggregate(results: RunResult[]): BotAggregate` (tous de même bot ; suppose des `samples` alignés sur les mêmes `tSec`)

- [ ] **Step 1: Écrire le test qui échoue** — `tests/unit/simMetrics.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { median, aggregate, type RunResult } from '../../tools/sim/metrics'

function run(partial: Partial<RunResult>): RunResult {
  return {
    seed: 1, bot: 'kite', samples: [], survived: false, survivalMs: 0,
    finalLevel: 0, levelAt5min: 0, peakEnemies: 0, nanSeen: false,
    minHp: 100, maxEnemies: 0, ...partial
  }
}

describe('median', () => {
  it('renvoie 0 sur liste vide', () => expect(median([])).toBe(0))
  it('médiane impaire', () => expect(median([3, 1, 2])).toBe(2))
  it('médiane paire = moyenne des deux centraux', () => expect(median([1, 2, 3, 4])).toBe(2.5))
})

describe('aggregate', () => {
  it('calcule % de survie pleine, survie médiane et niveau médian @5min', () => {
    const results: RunResult[] = [
      run({ seed: 1, survived: true, survivalMs: 480000, levelAt5min: 10, peakEnemies: 40,
            samples: [{ tSec: 0, hpPct: 100, enemies: 0, level: 1, score: 0 },
                      { tSec: 10, hpPct: 80, enemies: 5, level: 2, score: 20 }] }),
      run({ seed: 2, survived: false, survivalMs: 240000, levelAt5min: 6, peakEnemies: 60,
            samples: [{ tSec: 0, hpPct: 100, enemies: 0, level: 1, score: 0 },
                      { tSec: 10, hpPct: 60, enemies: 9, level: 2, score: 10 }] })
    ]
    const a = aggregate(results)
    expect(a.runs).toBe(2)
    expect(a.survivedFullPct).toBe(50)
    expect(a.survivalMsMedian).toBe(360000) // (240000+480000)/2
    expect(a.levelAt5minMedian).toBe(8)     // (10+6)/2
    expect(a.peakEnemiesMedian).toBe(50)
    expect(a.hpPctCurve).toEqual([100, 70]) // médiane par bucket
    expect(a.enemiesCurve).toEqual([0, 7])
  })
})
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npm run test -- simMetrics`
Expected: FAIL (`Cannot find module '../../tools/sim/metrics'`).

- [ ] **Step 3: Implémenter `tools/sim/metrics.ts`**

```ts
export interface Sample {
  tSec: number
  hpPct: number
  enemies: number
  level: number
  score: number
}

export interface RunResult {
  seed: number
  bot: string
  samples: Sample[]
  /** A atteint la durée pleine vivant. */
  survived: boolean
  /** Instant de mort en ms, ou durée pleine si survie. */
  survivalMs: number
  finalLevel: number
  /** Niveau au plus proche échantillon t ≤ 300 s (climax mini-boss). */
  levelAt5min: number
  peakEnemies: number
  nanSeen: boolean
  minHp: number
  maxEnemies: number
}

export interface BotAggregate {
  bot: string
  runs: number
  survivedFullPct: number
  survivalMsMedian: number
  survivalMsMin: number
  survivalMsMax: number
  levelAt5minMedian: number
  peakEnemiesMedian: number
  /** Taille de bucket des courbes, en secondes. */
  bucketSec: number
  hpPctCurve: number[]
  enemiesCurve: number[]
}

export function median(xs: number[]): number {
  if (xs.length === 0) {
    return 0
  }
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  if (s.length % 2 === 1) {
    return s[mid] ?? 0
  }
  return ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2
}

/** Médiane, colonne par colonne, d'une matrice de courbes (lignes = runs). */
function medianCurve(curves: number[][]): number[] {
  const len = curves.reduce((m, c) => Math.max(m, c.length), 0)
  const out: number[] = []
  for (let i = 0; i < len; i++) {
    out.push(median(curves.map((c) => c[i] ?? 0)))
  }
  return out
}

export function aggregate(results: RunResult[]): BotAggregate {
  const bot = results[0]?.bot ?? 'unknown'
  const runs = results.length
  const survivalMs = results.map((r) => r.survivalMs)
  const bucketSec = results[0]?.samples[1]?.tSec ?? 10
  return {
    bot,
    runs,
    survivedFullPct: runs === 0 ? 0 : (results.filter((r) => r.survived).length / runs) * 100,
    survivalMsMedian: median(survivalMs),
    survivalMsMin: survivalMs.length === 0 ? 0 : Math.min(...survivalMs),
    survivalMsMax: survivalMs.length === 0 ? 0 : Math.max(...survivalMs),
    levelAt5minMedian: median(results.map((r) => r.levelAt5min)),
    peakEnemiesMedian: median(results.map((r) => r.peakEnemies)),
    bucketSec,
    hpPctCurve: medianCurve(results.map((r) => r.samples.map((s) => s.hpPct))),
    enemiesCurve: medianCurve(results.map((r) => r.samples.map((s) => s.enemies)))
  }
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npm run test -- simMetrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/sim/metrics.ts tests/unit/simMetrics.test.ts
git commit -m "feat(sim): types de métriques + agrégation (médiane, courbes)"
```

---

### Task 3: Sparklines & rendu CLI (`tools/sim/render.ts`)

**Files:**
- Create: `tools/sim/render.ts`
- Test: `tests/unit/simRender.test.ts`

**Interfaces:**
- Consumes: `BotAggregate` (Task 2)
- Produces:
  - `export function sparkline(values: number[], opts?: { min?: number; max?: number }): string`
  - `export function renderSummaryTable(aggs: BotAggregate[]): string`
  - `export function renderCurves(aggs: BotAggregate[]): string`
  - `export function renderDiff(current: BotAggregate[], baseline: BotAggregate[]): string`

- [ ] **Step 1: Écrire le test qui échoue** — `tests/unit/simRender.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { sparkline, renderSummaryTable, renderDiff } from '../../tools/sim/render'
import type { BotAggregate } from '../../tools/sim/metrics'

function agg(partial: Partial<BotAggregate>): BotAggregate {
  return {
    bot: 'kite', runs: 10, survivedFullPct: 80, survivalMsMedian: 480000,
    survivalMsMin: 300000, survivalMsMax: 480000, levelAt5minMedian: 8,
    peakEnemiesMedian: 50, bucketSec: 10, hpPctCurve: [], enemiesCurve: [], ...partial
  }
}

describe('sparkline', () => {
  it('mappe min→premier bloc, max→dernier bloc', () => {
    const s = sparkline([0, 50, 100])
    expect(s).toHaveLength(3)
    expect(s.charAt(0)).toBe('▁')
    expect(s.charAt(2)).toBe('█')
  })
  it('valeurs constantes → bloc bas, pas de NaN', () => {
    expect(sparkline([5, 5, 5])).toBe('▁▁▁')
  })
  it('liste vide → chaîne vide', () => expect(sparkline([])).toBe(''))
})

describe('renderSummaryTable', () => {
  it('contient le bot et les colonnes clés', () => {
    const out = renderSummaryTable([agg({ bot: 'kite' })])
    expect(out).toContain('kite')
    expect(out).toContain('survie')
  })
})

describe('renderDiff', () => {
  it('montre le delta de survie médiane', () => {
    const out = renderDiff([agg({ survivalMsMedian: 480000 })], [agg({ survivalMsMedian: 300000 })])
    expect(out).toContain('kite')
    expect(out).toMatch(/\+|180/) // +180s ou un delta visible
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npm run test -- simRender`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `tools/sim/render.ts`**

```ts
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
  const lines = ['bot      | survie méd | %survie pleine | niv@5:00 | pic ennemis']
  lines.push('---------|------------|----------------|----------|------------')
  for (const a of aggs) {
    lines.push(
      `${a.bot.padEnd(8)} | ${sec(a.survivalMsMedian).padStart(10)} | ` +
        `${`${Math.round(a.survivedFullPct)}%`.padStart(14)} | ` +
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
```

- [ ] **Step 4: Lancer → succès**

Run: `npm run test -- simRender`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/sim/render.ts tests/unit/simRender.test.ts
git commit -m "feat(sim): sparklines ASCII + tableau récap + diff baseline"
```

---

### Task 4: Exécuter un run unique instrumenté (`tools/sim/runOne.ts`)

**Files:**
- Create: `tools/sim/runOne.ts`
- Test: `tests/unit/simRunOne.test.ts`

**Interfaces:**
- Consumes: `Sample`/`RunResult` (Task 2), `BotName`/`botMove` (Task 1), `Simulation` (`@core/simulation`)
- Produces: `export interface RunOptions { durationSec: number; stepMs: number; sampleEveryMs: number }` ; `export function runOne(seed: number, bot: BotName, opts?: Partial<RunOptions>): RunResult`

- [ ] **Step 1: Écrire le test qui échoue** — `tests/unit/simRunOne.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { runOne } from '../../tools/sim/runOne'

describe('runOne (déterministe)', () => {
  it('même seed + même bot ⇒ résultat identique', () => {
    const a = runOne(42, 'kite', { durationSec: 60 })
    const b = runOne(42, 'kite', { durationSec: 60 })
    expect(a.survivalMs).toBe(b.survivalMs)
    expect(a.finalLevel).toBe(b.finalLevel)
    expect(a.samples.map((s) => s.enemies)).toEqual(b.samples.map((s) => s.enemies))
  })

  it('produit des échantillons et des invariants sains sur une courte run', () => {
    const r = runOne(7, 'kite', { durationSec: 60, sampleEveryMs: 10000 })
    expect(r.samples.length).toBeGreaterThan(0)
    expect(r.nanSeen).toBe(false)
    expect(r.minHp).toBeGreaterThanOrEqual(0)
    expect(r.samples[0]?.hpPct).toBeCloseTo(100, 0) // plein HP au départ
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npm run test -- simRunOne`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `tools/sim/runOne.ts`** — reprend la boucle de l'ancien `run.ts`, ajoute l'échantillonnage.

```ts
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
  let maxEnemies = 0
  let nanSeen = false
  let survived = true
  let survivalMs = targetMs

  for (let t = 0; t < targetMs; t += stepMs) {
    const s = sim.getState()
    if (s.scene === 'gameover') {
      survived = false
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
    survivalMs,
    finalLevel: fp?.level ?? 0,
    levelAt5min: at5min[at5min.length - 1]?.level ?? fp?.level ?? 0,
    peakEnemies: maxEnemies,
    nanSeen,
    minHp: minHp === Infinity ? 0 : minHp,
    maxEnemies
  }
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npm run test -- simRunOne`
Expected: PASS (déterminisme + run saine).

- [ ] **Step 5: Commit**

```bash
git add tools/sim/runOne.ts tests/unit/simRunOne.test.ts
git commit -m "feat(sim): runOne instrumenté (séries temporelles, déterministe)"
```

---

### Task 5: Cibles « skill récompensé » (`tools/sim/targets.ts`)

**Files:**
- Create: `tools/sim/targets.ts`
- Test: `tests/unit/simTargets.test.ts`

**Interfaces:**
- Consumes: `BotAggregate` (Task 2)
- Produces:
  - `export interface TargetReport { pass: boolean; failures: string[] }`
  - `export function evaluateTargets(aggs: BotAggregate[]): TargetReport`

> Les seuils ci-dessous sont les **valeurs de départ du spec §3.5**, à calibrer en PHASE 3. Le rapport est **informatif** (n'impose rien) tant que l'orchestrateur ne passe pas `--enforce` (Task 7).

- [ ] **Step 1: Écrire le test qui échoue** — `tests/unit/simTargets.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { evaluateTargets } from '../../tools/sim/targets'
import type { BotAggregate } from '../../tools/sim/metrics'

function agg(partial: Partial<BotAggregate>): BotAggregate {
  return {
    bot: 'kite', runs: 10, survivedFullPct: 90, survivalMsMedian: 480000,
    survivalMsMin: 70000, survivalMsMax: 480000, levelAt5minMedian: 9,
    peakEnemiesMedian: 50, bucketSec: 10, hpPctCurve: [], enemiesCurve: [], ...partial
  }
}

describe('evaluateTargets', () => {
  it('PASS quand kite survit, greedy meurt en milieu, idle meurt tôt', () => {
    const rep = evaluateTargets([
      agg({ bot: 'kite', survivedFullPct: 90, levelAt5minMedian: 9, survivalMsMin: 70000 }),
      agg({ bot: 'greedy', survivedFullPct: 0, survivalMsMedian: 240000 }),
      agg({ bot: 'idle', survivedFullPct: 0, survivalMsMedian: 180000 })
    ])
    expect(rep.pass).toBe(true)
    expect(rep.failures).toHaveLength(0)
  })

  it('FAIL si kite meurt avant 1:00 (spawn trop brutal au départ)', () => {
    const rep = evaluateTargets([agg({ bot: 'kite', survivalMsMin: 30000 })])
    expect(rep.pass).toBe(false)
    expect(rep.failures.join(' ')).toContain('kite')
  })

  it('FAIL si greedy survit la run pleine (trop facile)', () => {
    const rep = evaluateTargets([agg({ bot: 'greedy', survivedFullPct: 100, survivalMsMedian: 480000 })])
    expect(rep.pass).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npm run test -- simTargets`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `tools/sim/targets.ts`**

```ts
import type { BotAggregate } from './metrics'

export interface TargetReport {
  pass: boolean
  failures: string[]
}

/** Seuils de départ (spec §3.5) — à calibrer en PHASE 3. */
const KITE_MIN_SURVIVE_FULL_PCT = 80
const KITE_MIN_LEVEL_AT_5MIN = 8
const KITE_MIN_FIRST_DEATH_MS = 60000 // ne doit jamais mourir avant 1:00
const GREEDY_DEATH_LO_MS = 180000 // 3:00
const GREEDY_DEATH_HI_MS = 330000 // 5:30
const IDLE_DEATH_LO_MS = 90000 // 1:30
const IDLE_DEATH_HI_MS = 240000 // 4:00

export function evaluateTargets(aggs: BotAggregate[]): TargetReport {
  const byBot = new Map(aggs.map((a) => [a.bot, a]))
  const failures: string[] = []

  const kite = byBot.get('kite')
  if (kite !== undefined) {
    if (kite.survivedFullPct < KITE_MIN_SURVIVE_FULL_PCT) {
      failures.push(`kite: survie pleine ${Math.round(kite.survivedFullPct)}% < ${KITE_MIN_SURVIVE_FULL_PCT}%`)
    }
    if (kite.levelAt5minMedian < KITE_MIN_LEVEL_AT_5MIN) {
      failures.push(`kite: niveau @5:00 ${Math.round(kite.levelAt5minMedian)} < ${KITE_MIN_LEVEL_AT_5MIN}`)
    }
    if (kite.survivalMsMin < KITE_MIN_FIRST_DEATH_MS) {
      failures.push(`kite: une run meurt à ${Math.round(kite.survivalMsMin / 1000)}s (< 60s, départ trop brutal)`)
    }
  }

  const greedy = byBot.get('greedy')
  if (greedy !== undefined) {
    if (greedy.survivedFullPct > 0) {
      failures.push(`greedy: ${Math.round(greedy.survivedFullPct)}% survivent la run pleine (trop facile)`)
    } else if (greedy.survivalMsMedian < GREEDY_DEATH_LO_MS || greedy.survivalMsMedian > GREEDY_DEATH_HI_MS) {
      failures.push(`greedy: mort médiane ${Math.round(greedy.survivalMsMedian / 1000)}s hors [180s, 330s]`)
    }
  }

  const idle = byBot.get('idle')
  if (idle !== undefined && idle.survivedFullPct === 0) {
    if (idle.survivalMsMedian < IDLE_DEATH_LO_MS || idle.survivalMsMedian > IDLE_DEATH_HI_MS) {
      failures.push(`idle: mort médiane ${Math.round(idle.survivalMsMedian / 1000)}s hors [90s, 240s]`)
    }
  }

  return { pass: failures.length === 0, failures }
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npm run test -- simTargets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/sim/targets.ts tests/unit/simTargets.test.ts
git commit -m "feat(sim): cibles 'skill récompensé' + évaluation PASS/FAIL"
```

---

### Task 6: Persistance baseline (`tools/sim/baseline.ts`)

**Files:**
- Create: `tools/sim/baseline.ts`

**Interfaces:**
- Consumes: `BotAggregate` (Task 2)
- Produces:
  - `export interface BaselineFile { aggregates: BotAggregate[] }`
  - `export function saveBaseline(path: string, aggs: BotAggregate[]): void`
  - `export function loadBaseline(path: string): BotAggregate[] | null`

> Pas de test Vitest dédié (I/O fichier ; couvert par l'exécution en PHASE 2). `node:fs` est autorisé ici (tools, pas core/content).

- [ ] **Step 1: Implémenter `tools/sim/baseline.ts`**

```ts
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
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npm run type-check`
Expected: vert.

- [ ] **Step 3: Commit**

```bash
git add tools/sim/baseline.ts
git commit -m "feat(sim): persistance baseline (save/load JSON)"
```

---

### Task 7: Orchestrateur CLI (réécriture de `tools/sim/run.ts`)

**Files:**
- Modify: `tools/sim/run.ts` (réécriture complète)

**Interfaces:**
- Consumes: `runOne` (Task 4), `aggregate` (Task 2), `renderSummaryTable`/`renderCurves`/`renderDiff` (Task 3), `evaluateTargets` (Task 5), `saveBaseline`/`loadBaseline` (Task 6), `BOT_NAMES`/`isBotName` (Task 1)
- Produces: binaire CLI `npm run sim` (aucune API consommée par d'autres tâches)

- [ ] **Step 1: Réécrire `tools/sim/run.ts`**

```ts
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
import { aggregate, type BotAggregate, type RunResult } from './metrics'
import { renderSummaryTable, renderCurves, renderDiff } from './render'
import { evaluateTargets } from './targets'
import { saveBaseline, loadBaseline } from './baseline'
import { BOT_NAMES, isBotName, type BotName } from './bots'

const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'baseline.json')

interface Args {
  seeds: number[]
  bots: BotName[]
  durationSec: number
  saveBaseline: boolean
  enforce: boolean
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
  } else if (list !== undefined && /^[0-9,\s]+$/.test(list)) {
    seeds = list.split(',').map((s) => Number.parseInt(s.trim(), 10))
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
    enforce: argv.includes('--enforce')
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  console.log(
    '[sim] seeds=%s bots=%s duration=%ds',
    args.seeds.join(','),
    args.bots.join(','),
    args.durationSec
  )

  const aggregates: BotAggregate[] = []
  let nanSeen = false
  let minHp = Infinity
  let maxEnemies = 0

  for (const bot of args.bots) {
    const results: RunResult[] = []
    for (const seed of args.seeds) {
      const r = runOne(seed, bot, { durationSec: args.durationSec })
      results.push(r)
      nanSeen = nanSeen || r.nanSeen
      minHp = Math.min(minHp, r.minHp)
      maxEnemies = Math.max(maxEnemies, r.maxEnemies)
    }
    aggregates.push(aggregate(results))
  }

  console.log('\n' + renderSummaryTable(aggregates))
  console.log('\n' + renderCurves(aggregates))

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
  if (maxEnemies > 220) {
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
```

- [ ] **Step 2: Vérifier compat + sortie**

Run: `npm run type-check && npm run sim -- --seed 42 --bot kite --duration 60`
Expected: type-check vert ; sortie avec tableau + sparklines pour `kite`, pas de crash.

- [ ] **Step 3: Lancer la suite complète (non-régression)**

Run: `npm run test && npm run lint`
Expected: tous les tests verts (anciens + nouveaux `sim*`), 0 warning lint.

- [ ] **Step 4: Commit**

```bash
git add tools/sim/run.ts
git commit -m "feat(sim): orchestrateur CLI (balayage seeds×bots, baseline/diff, cibles)"
```

---

## PHASE 2 — Mesure de l'existant (gate, sans tuning)

> **Aucune valeur de gameplay n'est modifiée ici.** On mesure l'équilibrage actuel et on présente le diagnostic.

### Task 8: Capturer la baseline et diagnostiquer

- [ ] **Step 1: Lancer le balayage complet sur l'existant**

Run: `npm run sim -- --seeds 12 --duration 480`
Expected: tableau + courbes pour les 3 bots ; invariants sanity verts.

- [ ] **Step 2: Sauvegarder la baseline**

Run: `npm run sim -- --seeds 12 --duration 480 --baseline save`
Expected: `tools/sim/baseline.json` créé.

- [ ] **Step 3: Commit de la baseline**

```bash
git add tools/sim/baseline.json
git commit -m "chore(sim): baseline d'équilibrage (avant tuning)"
```

- [ ] **Step 4: Présenter le diagnostic à l'utilisateur** — résumer : kite survit-il ? greedy/idle meurent-ils, et quand ? niveau @5:00 ? forme des courbes (HP qui s'effondre ? ennemis qui explosent ?). **Mettre en évidence l'écart vs cibles de départ.** STOP — attendre la décision de l'utilisateur sur la calibration (PHASE 3).

---

## PHASE 3 — Calibration des cibles (gate, avec l'utilisateur)

### Task 9: Figer les cibles validées

- [ ] **Step 1: Ajuster les seuils** dans `tools/sim/targets.ts` selon ce que la mesure a révélé et la décision utilisateur (les constantes `KITE_*`/`GREEDY_*`/`IDLE_*`). Mettre à jour `tests/unit/simTargets.test.ts` en conséquence.

- [ ] **Step 2: Activer l'enforcement par défaut** — ajouter le script `"sim:check": "tsx tools/sim/run.ts --enforce"` dans `package.json` (le `sim` normal reste informatif pour l'itération).

- [ ] **Step 3: Vérifier**

Run: `npm run test -- simTargets && npm run type-check`
Expected: vert.

- [ ] **Step 4: Commit**

```bash
git add tools/sim/targets.ts tests/unit/simTargets.test.ts package.json
git commit -m "feat(sim): cibles d'équilibrage calibrées sur la mesure + sim:check"
```

---

## PHASE 4 — Tuning des leviers (Couche B)

### Task 10: Mécanisme de rampe de spawn (no-op prouvé)

**Files:**
- Create: `src/content/spawnRamp.ts`
- Modify: `src/core/simulation.ts` (`runSpawns`)
- Test: `tests/unit/spawnRamp.test.ts`

**Interfaces:**
- Produces:
  - `export interface SpawnRampStep { fromSec: number; intervalMs: number; countPerWave: number }`
  - `export const SPAWN_RAMP: readonly SpawnRampStep[]`
  - `export function spawnParamsAt(ramp: readonly SpawnRampStep[], elapsedMs: number): { intervalMs: number; countPerWave: number }`

> Valeurs initiales = **équivalentes au spawn plat actuel** (1400 ms / 1) → changement de comportement nul, prouvé par diff baseline == 0.

- [ ] **Step 1: Écrire le test qui échoue** — `tests/unit/spawnRamp.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { spawnParamsAt, type SpawnRampStep } from '@content/spawnRamp'

const RAMP: SpawnRampStep[] = [
  { fromSec: 0, intervalMs: 1400, countPerWave: 1 },
  { fromSec: 60, intervalMs: 1000, countPerWave: 2 },
  { fromSec: 300, intervalMs: 600, countPerWave: 3 }
]

describe('spawnParamsAt', () => {
  it('renvoie le palier dont fromSec est le plus grand ≤ t', () => {
    expect(spawnParamsAt(RAMP, 0)).toEqual({ intervalMs: 1400, countPerWave: 1 })
    expect(spawnParamsAt(RAMP, 59_000)).toEqual({ intervalMs: 1400, countPerWave: 1 })
    expect(spawnParamsAt(RAMP, 60_000)).toEqual({ intervalMs: 1000, countPerWave: 2 })
    expect(spawnParamsAt(RAMP, 5 * 60_000)).toEqual({ intervalMs: 600, countPerWave: 3 })
  })
  it('avant le premier palier, retombe sur le premier', () => {
    expect(spawnParamsAt([{ fromSec: 10, intervalMs: 800, countPerWave: 1 }], 0))
      .toEqual({ intervalMs: 800, countPerWave: 1 })
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npm run test -- spawnRamp`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/content/spawnRamp.ts`**

```ts
/**
 * Rampe de spawn temporelle (data-driven). Définit comment la pression
 * ennemie monte dans le temps : 0-1 min calme (PRD apprentissage) → montée
 * → pic vers le climax mini-boss (5:00).
 *
 * Valeurs initiales = équivalentes au spawn plat historique (no-op).
 * Le tuning fait évoluer ce tableau (un palier = un seuil de temps).
 */
export interface SpawnRampStep {
  /** Seuil de temps (s) à partir duquel ce palier s'applique. */
  fromSec: number
  /** Intervalle entre deux vagues, en ms. */
  intervalMs: number
  /** Nombre d'ennemis par vague. */
  countPerWave: number
}

export const SPAWN_RAMP: readonly SpawnRampStep[] = [
  { fromSec: 0, intervalMs: 1400, countPerWave: 1 }
]

/** Palier courant : le dernier dont `fromSec` est ≤ au temps écoulé. */
export function spawnParamsAt(
  ramp: readonly SpawnRampStep[],
  elapsedMs: number
): { intervalMs: number; countPerWave: number } {
  const elapsedSec = elapsedMs / 1000
  let chosen = ramp[0]
  for (const step of ramp) {
    if (step.fromSec <= elapsedSec) {
      chosen = step
    }
  }
  return {
    intervalMs: chosen?.intervalMs ?? 1400,
    countPerWave: chosen?.countPerWave ?? 1
  }
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npm run test -- spawnRamp`
Expected: PASS.

- [ ] **Step 5: Brancher la rampe dans `runSpawns`** (`src/core/simulation.ts`). Ajouter l'import et remplacer la lecture des constantes :

```ts
// en tête de fichier :
import { SPAWN_RAMP, spawnParamsAt } from '@content/spawnRamp'

// runSpawns :
private runSpawns(dtMs: number): void {
  this.maybeSpawnMiniBoss()
  this.spawnAccMs += dtMs
  const { intervalMs, countPerWave } = spawnParamsAt(SPAWN_RAMP, this.elapsedMs)
  while (this.spawnAccMs >= intervalMs) {
    this.spawnAccMs -= intervalMs
    if (this.countEnemies() < SPAWN.maxActive) {
      spawnWave(this.world, this.rng, this.phase, this.playersCentroid(), countPerWave)
    }
  }
}
```

(Garder `SPAWN.ringRadius`/`SPAWN.maxActive` ; `SPAWN.intervalMs`/`countPerWave` deviennent inutilisés — les laisser comme défauts documentés ou les retirer si le lint signale du code mort.)

- [ ] **Step 6: Prouver le no-op** — la rampe plate doit reproduire exactement la baseline.

Run: `npm run test && npm run sim -- --seeds 12 --duration 480`
Expected: tous les tests verts ; le **diff vs baseline affiche `+0s / niv +0 / pic +0`** pour les 3 bots (comportement inchangé).

- [ ] **Step 7: Commit**

```bash
git add src/content/spawnRamp.ts src/core/simulation.ts tests/unit/spawnRamp.test.ts
git commit -m "feat(content): rampe de spawn temporelle (mécanisme, no-op prouvé)"
```

---

### Task 11: Boucle de tuning itérative (protocole — valeurs déterminées à l'exécution)

> **Pas de chiffres pré-écrits ici, par conception** (spec §3.5/§4 : on tune contre la mesure, pas vers des nombres inventés). Chaque itération suit ce protocole et produit un commit prouvé.

**Files (selon le levier de l'itération):**
- Modify: `src/content/spawnRamp.ts` (paliers de la rampe — **levier #1, à attaquer en premier**)
- Modify: `src/content/config.ts` (`PLAYER_BASE`, `PROGRESSION`)
- Modify: `src/content/weapons.ts` (`damage`/`cooldownMs` des 3 armes)
- Modify: `src/content/enemies.ts` (`hp`/`speed`/`contactDamage`/`xpValue` des 3 + mini-boss)

**Protocole d'une itération :**

- [ ] **Step 1:** Identifier l'écart dominant vs cibles dans la dernière sortie `npm run sim` (ex. « kite meurt à 4:00, ennemis explosent après 3:00 »).
- [ ] **Step 2:** Choisir **un seul groupe de leviers** (commencer par la rampe de spawn) et ajuster les valeurs de façon ciblée.
- [ ] **Step 3:** Re-mesurer.

  Run: `npm run sim -- --seeds 12 --duration 480`
  Observer : le diff vs baseline et le bloc cibles se rapprochent-ils du PASS ?

- [ ] **Step 4:** Si amélioration et aucune régression sanity → commit ; sinon, revenir en arrière et réessayer.

  ```bash
  git add src/content/<fichier modifié>
  git commit -m "balance: <lever ajusté> — <effet mesuré, ex. kite survie 4:00→8:00>"
  ```

- [ ] **Step 5:** Répéter jusqu'à `npm run sim:check` **VERT** (cibles + sanity) sur les 3 bots.

- [ ] **Step 6: Mettre à jour la baseline « après »** (optionnel, pour figer le nouveau point de référence).

  ```bash
  npm run sim -- --seeds 12 --duration 480 --baseline save
  git add tools/sim/baseline.json
  git commit -m "chore(sim): baseline d'équilibrage (après tuning)"
  ```

---

### Task 12: Validation finale & journal (play-to-validate)

- [ ] **Step 1: Suite complète**

Run: `npm run type-check && npm run lint && npm run test && npm run test:e2e`
Expected: tout vert (type-check, 0 warning lint, ~107+ unit, e2e headless — la partie tourne, mini-boss à 5:00, pas de régression d'écran).

- [ ] **Step 2: Preuve d'équilibrage**

Run: `npm run sim:check`
Expected: cibles VERTES + sanity VERTS.

- [ ] **Step 3: Mettre à jour le Journal de bord** — ajouter une entrée dans `PILOTAGE.md` §10 : date, ce qui a été fait (instrument + tuning), **avant/après** (chiffres clés du diff baseline), prochaine étape. Cocher « Tuning d'équilibrage » dans §7.

- [ ] **Step 4: Commit**

```bash
git add PILOTAGE.md
git commit -m "docs(pilotage): journal — tuning d'équilibrage (avant/après)"
```

---

## Self-Review (couverture du spec)

- **§3.1 séries temporelles** → Task 4 (`runOne` échantillonne). ✅
- **§3.2 balayage déterministe** → Task 7 (seeds énumérées, bots multiples). ✅
- **§3.3 sortie CLI (table + sparklines + PASS/FAIL)** → Tasks 3, 5, 7. ✅
- **§3.4 baseline/diff** → Tasks 6, 7, 8. ✅
- **§3.5 cibles → invariants** → Tasks 5 (départ), 9 (calibration), 7 (`--enforce`). ✅
- **§3.6 hypothèses (upgrade index 0, bots = skill)** → Task 4 (`chooseUpgrade(0)`), Task 1 (bots). ✅
- **§4.1 rampe de spawn** → Task 10. ✅
- **§4.2-4 joueur/armes/ennemis** → Task 11. ✅
- **§5 validation (Vitest/sim/e2e/type-check/lint)** → Tasks 2-7, 10, 12. ✅
- **§6 garde-fous archi** → Global Constraints + Task 10 (rampe en `src/content`). ✅
- **§7 livrables** → couverts. ✅
- **§9 ordre (instrument → mesure → calibration → tuning)** → Phases 1→4. ✅

Pas de placeholder de gameplay : les chiffres de tuning sont **intentionnellement** déterminés à l'exécution (Task 11), conformément à la consigne « mesurer avant de toucher aux chiffres ».
```
