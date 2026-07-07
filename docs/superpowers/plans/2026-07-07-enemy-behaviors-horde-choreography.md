# Comportements d'ennemis + chorégraphie de horde — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner du rythme à BTP Survivors via des comportements d'ennemis variés + un directeur de vagues cadencé (formations chorégraphiées) + un arc de run étendu à ~20 min, tout en restant déterministe et « tendu mais gagnable ».

**Architecture:** Deux couches pures dans `src/core`. (1) Un champ `behavior` data-driven sur l'ennemi ; `enemyAiSystem` *dispatche* vers une fonction de steering par comportement (chase/zigzag/circler/sweep/charger). (2) Un `waveDirector` (module pur) qui remplace l'émission plate de `runSpawns` par une cadence **accalmie ↔ événement** à **budget conservé**, tire ses événements d'un **pool pondéré par phase** via un flux RNG dédié `waveRng`, et réagit à l'état du joueur (anti-camping). L'arc de run s'étend à ~20 min (rampe/courbe/boss + mini-boss périodiques comme événements).

**Tech Stack:** TypeScript strict, ECS-lite maison (`World`), `Rng` mulberry32 seedé, `FixedClock` 60 Hz. Tests : Vitest + harness `npm run sim`/`sim:check` + Playwright (seam). Aucune dépendance nouvelle.

## Global Constraints

- **Sim déterministe pure** : tout code de ce plan vit dans `src/core` / `src/content`. **Interdit** `Math.random`, `Date.now`, `new Date` — toute source d'aléa passe par un `Rng` seedé ; tout timing passe par `elapsedMs`/`dtMs` (temps fixe `STEP_MS`). (Vérifié ESLint.)
- **Zéro `any` dans `src/core`.** TS strict, `noUncheckedIndexedAccess` actif (indexer un tableau donne `T | undefined` → gérer). ESLint 0 warning.
- **Séparation sim/rendu** : aucune modif d'API de rendu. Les ennemis restent des entités `position`/`velocity`/`enemy`. Le rendu (`hordeRenderer.ts`) observe seulement.
- **Data-driven** : comportements (constantes de tuning) et événements (pool par phase) = données typées dans `src/content`.
- **`waveRng` isolé** : nouveau flux `new Rng((seed ^ 0x5a1e) | 0)` (constante DISTINCTE de `0x1007`/`0x2b1d`/`0x3c7a` déjà utilisées) — pour ne PAS décaler `rng`/`lootRng`/`prisonerRng`/`chestRng`.
- **Invariant de non-régression Phase 1-3** : tant que `behavior` par défaut reste `'chase'` **et** que la valeur de spawn n'est pas modifiée, `sim:check` doit rester **diff 0**. Le re-tune/re-baseline n'intervient qu'en Phase 4 (arc 20 min) et à l'activation d'événements en Phase 2 (petit re-tune).
- Gates par tâche : `npm run type-check` · `npm run lint` · `npm run test` · `npm run sim:check` · (`npm run test:e2e` aux tâches qui touchent le seam/rendu). Pas de push sans feu vert.

---

## File Structure

- `src/core/types.ts` — MODIFY : `EnemyBehavior` + champs comportement sur `EnemyComp`.
- `src/core/systems/enemyAi.ts` — MODIFY : dispatch + 5 fonctions de steering pures.
- `src/core/systems/waveDirector.ts` — CREATE : cadence + budget + formations + réactif.
- `src/core/systems/spawn.ts` — MODIFY : `spawnEnemy` pose `behavior`/état ; helper `spawnGroup`.
- `src/core/simulation.ts` — MODIFY : `waveRng` ; brancher le directeur dans `runSpawns` ; boss final @~20:00 ; passer `elapsedMs/dtMs` à `enemyAiSystem` ; suivi déplacement joueur.
- `src/content/enemies.ts` — MODIFY : `behavior?` sur `EnemyDef` + `BEHAVIOR_TUNING`.
- `src/content/waveEvents.ts` — CREATE : types d'événements + pool pondéré par phase + placement.
- `src/content/spawnRamp.ts` — MODIFY : rampe + `difficultyScaleAt` étendues à ~20 min.
- `src/content/config.ts` — MODIFY : `FINAL_BOSS.atMs` ~20:00 ; `MINI_BOSS`/reapers ; seuils anti-camping.
- `tools/sim/targets.ts` + `tools/sim/baseline.json` — MODIFY : cibles re-dérivées + re-baseline (Phase 4).
- Tests : `tests/unit/enemyBehaviors.test.ts`, `tests/unit/waveEvents.test.ts`, `tests/unit/waveDirector.test.ts`, `tests/e2e/waveDirector.spec.ts` (CREATE).

### Interfaces partagées (verbatim — toutes les tâches s'y réfèrent)

```ts
// src/core/types.ts
export type EnemyBehavior = 'chase' | 'zigzag' | 'circler' | 'sweep' | 'charger'

export interface EnemyComp {
  type: string
  speed: number
  isElite: boolean
  isBoss: boolean
  bossRole?: 'mid' | 'final'
  contactDamage: number
  xpValue: number
  behavior: EnemyBehavior         // NOUVEAU — défaut 'chase'
  bPhase?: number                 // phase seedée (zigzag), radians
  bAngle?: number                 // circler: angle cible autour du joueur ; sweep: direction fixe
  bMode?: number                  // charger: 0=approche 1=télégraphe 2=dash 3=récup
  bTimer?: number                 // charger: ms restants dans l'état courant
}
```

```ts
// src/content/enemies.ts
export const BEHAVIOR_TUNING = {
  zigzag:  { amp: 0.65, omega: 2.0 * Math.PI * 1.3 },        // amp (fraction de vitesse), ω rad/s
  circler: { orbitR: 90, rotSpeed: 0.35 },                    // rayon d'orbite px, dérive rad/s de bAngle
  charger: { approachMs: 1400, telegraphMs: 300, dashMs: 450, dashMult: 2.6, recoverMs: 700, recoverMult: 0.45 }
} as const
```

```ts
// src/content/waveEvents.ts
export type WaveEventKind = 'converge' | 'pincer' | 'encircle' | 'burst' | 'sweep' | 'miniBoss'
export interface WaveEventDef {
  kind: WaveEventKind
  weight: number
  countMin: number
  countMax: number
  allowedFromSec: number          // pas avant ce temps
  behaviorOverride?: EnemyBehavior // sinon: défaut du kind (encircle→circler, sweep→sweep, autres→chase)
}
export interface WavePlacement { angle: number; radius: number; behavior: EnemyBehavior; bAngle?: number }
```

```ts
// src/core/systems/waveDirector.ts
export interface WaveDirectorState {
  budgetAcc: number      // ennemis « en réserve » accumulés
  nextEventMs: number    // instant du prochain slot d'événement
  camperCooldownMs: number
  playerTrail: { x: number; y: number }[] // échantillons de position (fenêtre glissante)
}
export function createWaveDirectorState(): WaveDirectorState
// Retourne les placements à spawner CE pas (accalmie + éventuel événement + réactif).
export function stepWaveDirector(
  state: WaveDirectorState,
  input: { dtMs: number; elapsedMs: number; center: { x: number; y: number };
           ramp: readonly SpawnRampStep[]; events: readonly WaveEventDef[];
           ringRadius: number; rng: Rng }
): WavePlacement[]
```

---

## Phase 1 — Socle comportements

### Task 1 : champ `behavior` + dispatch `enemyAiSystem` (chase inchangé)

**Files:**
- Modify: `src/core/types.ts:60-70` (EnemyComp)
- Modify: `src/core/systems/enemyAi.ts` (dispatch + `steerChase`)
- Modify: `src/core/systems/spawn.ts:80-102` (spawnEnemy pose `behavior`)
- Modify: `src/content/enemies.ts:9-18` (EnemyDef.behavior?)
- Modify: `src/core/simulation.ts:518` (appel `enemyAiSystem(this.world, this.elapsedMs, dtMs)`)
- Test: `tests/unit/enemyBehaviors.test.ts` (CREATE)

**Interfaces — Produces:** `EnemyBehavior`, champs sur `EnemyComp` ; `steerChase(pos, vel, enemy, targets)` ; `enemyAiSystem(world, elapsedMs, dtMs)`.

- [ ] **Step 1 — Test : chase reste identique + défaut = chase.** Dans `tests/unit/enemyBehaviors.test.ts` : un World avec 1 joueur en (0,0) et 1 ennemi `behavior:'chase'` en (100,0), speed 150 → après `enemyAiSystem(world, 0, 16)`, `vel ≈ (-150, 0)`. Puis un ennemi sans `behavior` explicite (créé via `spawnEnemy`) → son `enemy.behavior === 'chase'`.

```ts
import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { enemyAiSystem } from '@core/systems/enemyAi'

function withPlayerAndEnemy(behavior: 'chase'|'zigzag'|'circler'|'sweep'|'charger', ex = 100, ey = 0) {
  const w = new World()
  const p = w.spawn(); w.add(p, 'player', { id: 1 }); w.add(p, 'position', { x: 0, y: 0 }); w.add(p, 'health', { hp: 100, maxHp: 100 })
  const e = w.spawn(); w.add(e, 'position', { x: ex, y: ey }); w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'enemy', { type: 't', speed: 150, isElite: false, isBoss: false, contactDamage: 6, xpValue: 5, behavior })
  return { w, e }
}

describe('enemyAiSystem — dispatch', () => {
  it('chase: vélocité vers le joueur (inchangé)', () => {
    const { w, e } = withPlayerAndEnemy('chase', 100, 0)
    enemyAiSystem(w, 0, 16)
    const v = w.get(e, 'velocity')!
    expect(v.x).toBeCloseTo(-150, 5)
    expect(v.y).toBeCloseTo(0, 5)
  })
})
```

- [ ] **Step 2 — Run, échoue** : `npm run test -- enemyBehaviors` → FAIL (signature `enemyAiSystem` à 3 args, champ `behavior`).
- [ ] **Step 3 — Impl `types.ts`** : ajouter `EnemyBehavior` + champs `behavior/bPhase/bAngle/bMode/bTimer` (cf. Interfaces partagées).
- [ ] **Step 4 — Impl `enemyAi.ts`** : nouvelle signature + dispatch ; extraire le calcul actuel en `steerChase`. Le `slow` s'applique APRÈS steering, inchangé.

```ts
export function enemyAiSystem(world: World, elapsedMs: number, dtMs: number): void {
  const targets: Vec2[] = []
  for (const p of world.query('player', 'position', 'health')) {
    const h = world.get(p, 'health'); const pos = world.get(p, 'position')
    if (h && pos && h.hp > 0) { targets.push({ x: pos.x, y: pos.y }) }
  }
  for (const e of world.query('enemy', 'position', 'velocity')) {
    const pos = world.get(e, 'position'); const vel = world.get(e, 'velocity'); const enemy = world.get(e, 'enemy')
    if (!pos || !vel || !enemy) { continue }
    const nearest = findNearest(pos, targets)
    switch (enemy.behavior) {
      case 'zigzag':  steerZigzag(pos, vel, enemy, nearest, elapsedMs); break
      case 'circler': steerCircler(pos, vel, enemy, nearest, dtMs); break
      case 'sweep':   steerSweep(vel, enemy); break
      case 'charger': steerCharger(pos, vel, enemy, nearest, dtMs); break
      default:        steerChase(pos, vel, enemy, nearest)
    }
    const slow = world.get(e, 'slow')
    if (slow) { vel.x *= slow.mult; vel.y *= slow.mult }
  }
}

function steerChase(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null): void {
  if (!nearest) { vel.x = 0; vel.y = 0; return }
  const dx = nearest.x - pos.x, dy = nearest.y - pos.y, len = Math.hypot(dx, dy)
  if (len === 0) { vel.x = 0; vel.y = 0; return }
  vel.x = (dx / len) * enemy.speed; vel.y = (dy / len) * enemy.speed
}
```
(Ajouter `import type { EnemyComp } from '../types'`. Stubs vides pour `steerZigzag/Circler/Sweep/Charger` — remplis en tâches 2-5 ; pour l'instant qu'ils appellent `steerChase` afin de compiler.)

- [ ] **Step 5 — Impl `spawn.ts`** : `spawnEnemy` pose `behavior: def.behavior ?? 'chase'`. Ajouter param optionnel `init?: { behavior?: EnemyBehavior; bPhase?: number; bAngle?: number }` qui override et pose `bPhase/bAngle`. `EnemyDef` gagne `behavior?: EnemyBehavior`.
- [ ] **Step 6 — Impl `simulation.ts:518`** : `enemyAiSystem(this.world, this.elapsedMs, dtMs)` (le `dtMs` est déjà en scope dans `step`).
- [ ] **Step 7 — Run tests** : `npm run test -- enemyBehaviors` → PASS.
- [ ] **Step 8 — GATE non-régression** : `npm run type-check` (0) · `npm run lint` (0) · `npm run test` (517→+ nouveaux) · **`npm run sim:check` → DIFF 0 VERTES** (défaut chase = comportement byte-identique). Si diff ≠ 0 → le refactor a changé quelque chose, corriger.
- [ ] **Step 9 — Commit** : `git add -A && git commit -m "feat(enemy): champ behavior + dispatch enemyAi (chase inchangé)"`

### Task 2 : comportement `zigzag`

**Files:** Modify `src/core/systems/enemyAi.ts` ; `src/content/enemies.ts` (BEHAVIOR_TUNING) ; Test `tests/unit/enemyBehaviors.test.ts`.
**Interfaces — Consumes:** `steerChase`, `EnemyComp`, `BEHAVIOR_TUNING.zigzag`.

- [ ] **Step 1 — Test** : ennemi `zigzag`, `bPhase:0`, joueur à droite → la vélocité a une composante perpendiculaire NON nulle et bornée ; déterministe (même elapsed → même vel) ; sur une moyenne temporelle la progression reste vers le joueur.

```ts
it('zigzag: oscillation perpendiculaire bornée + déterministe', () => {
  const { w, e } = withPlayerAndEnemy('zigzag', 100, 0)
  w.get(e, 'enemy')!.bPhase = 0
  enemyAiSystem(w, 250, 16) // t=0.25s
  const v = w.get(e, 'velocity')!
  const speed = Math.hypot(v.x, v.y)
  expect(speed).toBeGreaterThan(0)
  expect(Math.abs(v.y)).toBeGreaterThan(1)          // composante perpendiculaire réelle
  expect(speed).toBeLessThanOrEqual(150 * 1.8)      // borné
  // déterministe
  const v2x = v.x, v2y = v.y
  w.get(e, 'velocity')!.x = 0; w.get(e, 'velocity')!.y = 0
  enemyAiSystem(w, 250, 16)
  expect(w.get(e, 'velocity')!.x).toBeCloseTo(v2x, 6)
  expect(w.get(e, 'velocity')!.y).toBeCloseTo(v2y, 6)
})
```

- [ ] **Step 2 — Run, échoue** (steerZigzag = stub chase).
- [ ] **Step 3 — Impl `steerZigzag`** : base = direction homing ; ajoute une composante perpendiculaire `A·sin(ω·t + bPhase)` (A = `amp·speed`).

```ts
import { BEHAVIOR_TUNING } from '@content/enemies'
function steerZigzag(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null, elapsedMs: number): void {
  if (!nearest) { vel.x = 0; vel.y = 0; return }
  const dx = nearest.x - pos.x, dy = nearest.y - pos.y, len = Math.hypot(dx, dy)
  if (len === 0) { vel.x = 0; vel.y = 0; return }
  const ux = dx / len, uy = dy / len            // direction joueur
  const px = -uy, py = ux                        // perpendiculaire
  const { amp, omega } = BEHAVIOR_TUNING.zigzag
  const osc = amp * Math.sin(omega * (elapsedMs / 1000) + (enemy.bPhase ?? 0))
  vel.x = (ux + px * osc) * enemy.speed
  vel.y = (uy + py * osc) * enemy.speed
}
```

- [ ] **Step 4 — Run** → PASS. **Step 5 — Commit** `feat(enemy): comportement zigzag (Medusa)`.

### Task 3 : comportement `circler` (encercleur)

**Files:** Modify `enemyAi.ts` ; Test.
**Interfaces — Consumes:** `EnemyComp.bAngle`, `BEHAVIOR_TUNING.circler`.

- [ ] **Step 1 — Test** : ennemi `circler`, `bAngle=0`, joueur en (0,0), ennemi loin en (400,400) → il se dirige vers le point `player + orbitR·(cos0,sin0) = (orbitR, 0)` (donc vel pointe grosso modo vers (orbitR,0), pas vers (0,0)). `bAngle` dérive dans le temps (rotation).

```ts
it('circler: vise un point sur l\'anneau autour du joueur', () => {
  const { w, e } = withPlayerAndEnemy('circler', 400, 400)
  w.get(e, 'enemy')!.bAngle = 0
  enemyAiSystem(w, 0, 16)
  const v = w.get(e, 'velocity')!
  // cible ≈ (90,0) depuis (400,400) → direction majoritairement -x et -y
  expect(v.x).toBeLessThan(0); expect(v.y).toBeLessThan(0)
  expect(w.get(e, 'enemy')!.bAngle).not.toBe(0) // a dérivé
})
```

- [ ] **Step 2-3 — Impl `steerCircler`** : cible = `nearest + orbitR·(cos bAngle, sin bAngle)` ; steering vers la cible ; `bAngle += rotSpeed·dt`.

```ts
function steerCircler(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null, dtMs: number): void {
  if (!nearest) { vel.x = 0; vel.y = 0; return }
  const { orbitR, rotSpeed } = BEHAVIOR_TUNING.circler
  const a = enemy.bAngle ?? 0
  const tx = nearest.x + Math.cos(a) * orbitR, ty = nearest.y + Math.sin(a) * orbitR
  const dx = tx - pos.x, dy = ty - pos.y, len = Math.hypot(dx, dy)
  if (len < 1) { vel.x = 0; vel.y = 0 } else { vel.x = (dx / len) * enemy.speed; vel.y = (dy / len) * enemy.speed }
  enemy.bAngle = a + rotSpeed * (dtMs / 1000)
}
```

- [ ] **Step 4 — Run** → PASS. **Step 5 — Commit** `feat(enemy): comportement circler (encercleur)`.

### Task 4 : comportement `sweep` (traversée)

**Files:** Modify `enemyAi.ts` ; Test.
**Interfaces — Consumes:** `EnemyComp.bAngle` (direction fixe).

- [ ] **Step 1 — Test** : ennemi `sweep`, `bAngle=0` → `vel=(speed,0)` peu importe la position du joueur ; déplacer le joueur ne change pas la vel.

```ts
it('sweep: va tout droit dans bAngle, ignore le joueur', () => {
  const { w, e } = withPlayerAndEnemy('sweep', 100, 0)
  w.get(e, 'enemy')!.bAngle = 0
  enemyAiSystem(w, 0, 16)
  const v = w.get(e, 'velocity')!
  expect(v.x).toBeCloseTo(150, 5); expect(v.y).toBeCloseTo(0, 5)
})
```

- [ ] **Step 2-3 — Impl `steerSweep`** : `vel = speed·(cos bAngle, sin bAngle)`.

```ts
function steerSweep(vel: Vec2, enemy: EnemyComp): void {
  const a = enemy.bAngle ?? 0
  vel.x = Math.cos(a) * enemy.speed; vel.y = Math.sin(a) * enemy.speed
}
```
(Note : le despawn des `sweep` sortis du monde est déjà géré par le culling de distance existant — vérifier qu'il s'applique aux ennemis ; sinon ajouter une borne dans un test de simulation.)

- [ ] **Step 4 — Run** → PASS. **Step 5 — Commit** `feat(enemy): comportement sweep (traversée)`.

### Task 5 : comportement `charger` (à-coups « Stalker »)

**Files:** Modify `enemyAi.ts` ; Test.
**Interfaces — Consumes:** `EnemyComp.bMode/bTimer`, `BEHAVIOR_TUNING.charger`.

- [ ] **Step 1 — Test** : machine à états. Un `charger` fraîchement spawné (`bMode`/`bTimer` undefined → init approche). Après `approachMs` cumulés → passe en télégraphe (`bMode=1`, vel ≈ 0). Après `telegraphMs` → dash (`bMode=2`, |vel| = speed·dashMult). Vérifier la séquence en avançant le temps par pas de 16 ms et en comptant les transitions (déterministe).

```ts
it('charger: approche → télégraphe → dash → récup', () => {
  const { w, e } = withPlayerAndEnemy('charger', 200, 0)
  const en = w.get(e, 'enemy')!
  // approche
  enemyAiSystem(w, 0, 16); expect(en.bMode ?? 0).toBe(0)
  // avance jusqu'au télégraphe
  for (let t = 16; t <= 1500; t += 16) { enemyAiSystem(w, t, 16) }
  expect(en.bMode).toBe(1)
  const vTele = Math.hypot(w.get(e,'velocity')!.x, w.get(e,'velocity')!.y)
  expect(vTele).toBeLessThan(150 * 0.2) // quasi-arrêt
})
```

- [ ] **Step 2-3 — Impl `steerCharger`** : init (`bMode ??= 0`, `bTimer ??= approachMs`) ; décrémente `bTimer` de `dtMs` ; à 0 → transition (0→1→2→3→0) et recharge `bTimer` selon l'état. Vitesse par état : approche = speed vers joueur ; télégraphe = ×0.05 (quasi-arrêt, mémorise la direction du dash) ; dash = ×dashMult vers la dernière direction ; récup = ×recoverMult vers joueur.

```ts
function steerCharger(pos: Vec2, vel: Vec2, enemy: EnemyComp, nearest: Vec2 | null, dtMs: number): void {
  if (!nearest) { vel.x = 0; vel.y = 0; return }
  const T = BEHAVIOR_TUNING.charger
  if (enemy.bMode === undefined) { enemy.bMode = 0; enemy.bTimer = T.approachMs }
  enemy.bTimer = (enemy.bTimer ?? 0) - dtMs
  if (enemy.bTimer <= 0) {
    enemy.bMode = ((enemy.bMode ?? 0) + 1) % 4
    enemy.bTimer = [T.approachMs, T.telegraphMs, T.dashMs, T.recoverMs][enemy.bMode] ?? T.approachMs
    if (enemy.bMode === 2) { // fige la direction du dash au début du dash
      const dx = nearest.x - pos.x, dy = nearest.y - pos.y, l = Math.hypot(dx, dy) || 1
      enemy.bAngle = Math.atan2(dy / l, dx / l)
    }
  }
  const mult = [1, 0.05, T.dashMult, T.recoverMult][enemy.bMode ?? 0] ?? 1
  if (enemy.bMode === 2) { const a = enemy.bAngle ?? 0; vel.x = Math.cos(a) * enemy.speed * mult; vel.y = Math.sin(a) * enemy.speed * mult }
  else { const dx = nearest.x - pos.x, dy = nearest.y - pos.y, l = Math.hypot(dx, dy) || 1; vel.x = (dx / l) * enemy.speed * mult; vel.y = (dy / l) * enemy.speed * mult }
}
```

- [ ] **Step 4 — Run** → PASS. **Step 5 — GATE** (tsc/lint/vitest/**sim:check DIFF 0** — aucun ennemi n'utilise encore ces comportements par défaut). **Commit** `feat(enemy): comportement charger (à-coups)`.

---

## Phase 2 — Directeur de vagues

### Task 6 : `waveRng` + helper `spawnGroup`

**Files:** Modify `src/core/simulation.ts:147-150,416-419` (waveRng) ; `src/core/systems/spawn.ts` (spawnGroup) ; Test `tests/unit/waveDirector.test.ts` (CREATE).
**Interfaces — Produces:** `this.waveRng` ; `spawnGroup(world, phase, center, placements, scale)`.

- [ ] **Step 1 — Test isolation RNG** : deux Simulations même seed, l'une consomme `waveRng`, l'autre non → la liste d'ennemis issue de `rng` (types/positions) reste identique (le waveRng ne décale pas `rng`). (Test : après N pas, comparer `getState().enemies` filtrés sur les non-directeur — ou vérifier le snapshot de `rng` inchangé.)
- [ ] **Step 2-3 — Impl** : dans le constructeur ET `reset()` : `this.waveRng = new Rng((seed ^ 0x5a1e) | 0)`. `spawnGroup` : pour chaque `WavePlacement`, tire un type du pool de la phase (via un rng passé), calcule pos = `center + radius·(cos,sin angle)`, appelle `spawnEnemy` avec `init:{behavior, bAngle}` + `bPhase = rng.float(0, 2π)`.
- [ ] **Step 4 — Run** → PASS. **Step 5 — GATE sim:check DIFF 0** (spawnGroup pas encore appelé). **Commit** `feat(spawn): waveRng isolé + helper spawnGroup`.

### Task 7 : `waveEvents.ts` (données + formations)

**Files:** Create `src/content/waveEvents.ts` ; Test `tests/unit/waveEvents.test.ts`.
**Interfaces — Produces:** `WaveEventKind`, `WaveEventDef`, `WavePlacement`, `placeEvent(kind, count, ringRadius, rng): WavePlacement[]`, `EVENT_POOL_DEFAULT: readonly WaveEventDef[]`.

- [ ] **Step 1 — Test placements** : `placeEvent('encircle', 8, 400, rng)` → 8 placements, `behavior:'circler'`, `bAngle` équirépartis (Δ≈2π/8), rayon = ringRadius resserré. `placeEvent('pincer', 6, 400, rng)` → 2 clusters à ~π d'écart. `placeEvent('sweep', 5, 400, rng)` → tous `behavior:'sweep'`, même `bAngle` (direction de traversée), positions alignées sur un bord. `placeEvent('converge', 5, …)` → tous dans un arc étroit, `behavior:'chase'`. Déterministe (même rng → même sortie).
- [ ] **Step 2-3 — Impl** : chaque formation = fonction pure de placement (cf. table du spec). `EVENT_POOL_DEFAULT` = pool générique (converge/pincer/burst poids élevés tôt, encircle/sweep plus tard via `allowedFromSec`). Le `bAngle` d'un `sweep` = direction traversant l'arène ; le `bAngle` d'un `circler` = sa position sur l'anneau.
- [ ] **Step 4 — Run** → PASS. **Step 5 — Commit** `feat(content): waveEvents (formations + pool)`.

### Task 8 : `waveDirector.ts` + branchement `runSpawns` (golden)

**Files:** Create `src/core/systems/waveDirector.ts` ; Modify `src/core/simulation.ts:663-678` (runSpawns) ; Test `tests/unit/waveDirector.test.ts`.
**Interfaces — Consumes:** `spawnParamsAt`, `SPAWN_RAMP`, `placeEvent`, `EVENT_POOL_DEFAULT`, `Rng`. **Produces:** `createWaveDirectorState`, `stepWaveDirector` (cf. Interfaces partagées).

- [ ] **Step 1 — Test conservation du budget** : sur une fenêtre simulée (ex. 60 s, dt 16 ms), la somme des placements retournés par `stepWaveDirector` ≈ la somme qu'aurait émise `spawnParamsAt` (à ε près, ex. ±10 %). Test : accumuler `Σ placements` vs `Σ countPerWave/intervalMs·durée`.
- [ ] **Step 2 — Test déterminisme + événements** : même seed → même séquence de placements ; au moins un « gros » événement (≥ countMin) apparaît sur 3 min ; le type d'événement respecte `allowedFromSec`.
- [ ] **Step 3 — Impl `stepWaveDirector`** : accumule le budget (`budgetAcc += (dt/intervalMs)·countPerWave`) ; en accalmie, dépense une petite fraction (filet) ; quand `elapsedMs ≥ nextEventMs` ET `budgetAcc ≥ seuil` → tire un `kind` pondéré (`rng`) parmi les events `allowedFromSec ≤ t`, `count = rng.int(countMin,countMax)` borné par `budgetAcc`, `placements = placeEvent(...)`, décrémente `budgetAcc`, programme `nextEventMs += gap` (gap décroissant avec `elapsedMs`). Réactif (Task 9) : hook laissé en place (no-op ici).
- [ ] **Step 4 — Impl `runSpawns`** : remplacer la boucle `while` par : `const placements = stepWaveDirector(this.waveDir, {...})` puis `if (this.countEnemies() < SPAWN.maxActive) spawnGroup(this.world, this.phase, this.playersCentroid(), placements, coopScale)`. Garder `maybeSpawnMidBoss/FinalBoss`. (Activer le directeur pour TOUS les stages — les poids par phase viennent en Phase 5 ; défaut `EVENT_POOL_DEFAULT` en attendant.)
- [ ] **Step 5 — Run tests** → PASS.
- [ ] **Step 6 — GATE + petit re-tune** : `sim:check` VA bouger (spawn groupé ≠ flux plat). Objectif : rester dans les cibles ACTUELLES (kite ≥12 % win, survie médiane ≥5:00, greedy/idle plafonds). Itérer les paramètres du directeur (fraction accalmie, gap d'événements, seuil budget) via `npm run sim -- --seeds 12 --duration 660` jusqu'aux cibles VERTES, puis **re-baseline** (`npm run sim:check` régénère si prévu, sinon `tools/sim/run.ts --update-baseline` selon le harness). Documenter les nombres retenus.
- [ ] **Step 7 — e2e** : `tests/e2e/waveDirector.spec.ts` — via seam, `advanceTime` jusqu'à un événement, asserter qu'un groupe d'ennemis apparaît (positions clusterisées / behaviors `circler` présents dans `getState().enemies`) ; pas de crash. `npm run test:e2e -- waveDirector`.
- [ ] **Step 8 — Commit** `feat(sim): directeur de vagues cadencé (budget conservé) branché`.

---

## Phase 3 — Couche réactive (anti-camping)

### Task 9 : suivi déplacement joueur + événement anti-camping

**Files:** Modify `src/core/systems/waveDirector.ts` (trail + trigger) ; `src/content/config.ts` (seuils) ; Test `tests/unit/waveDirector.test.ts`.
**Interfaces — Consumes:** `WaveDirectorState.playerTrail/camperCooldownMs`. **Produces:** règle anti-camping dans `stepWaveDirector`.

- [ ] **Step 1 — Test** : joueur immobile (même `center` à chaque pas) pendant > fenêtre → `stepWaveDirector` déclenche un événement agressif (encircle ou convergence de `charger`) même hors slot normal, puis pose un cooldown (pas de re-déclenchement pendant `CAMPER.cooldownMs`). Joueur qui bouge (center qui varie > seuil) → pas de déclenchement. Déterministe.
- [ ] **Step 2-3 — Impl** : échantillonner `center` dans `playerTrail` (fenêtre ~6 s = N derniers samples) ; `displacement = distance(center, trail[0])` (ou somme des pas). Si `displacement < CAMPER.minMove` ET `camperCooldownMs ≤ 0` → forcer un `placeEvent('encircle'|'converge', …, behaviorOverride:'charger')`, `camperCooldownMs = CAMPER.cooldownMs`. Décrémenter le cooldown de `dtMs`. Constantes dans `config.ts` : `CAMPER = { windowMs: 6000, minMove: 120, cooldownMs: 12000 }`.
- [ ] **Step 4 — Run** → PASS. **Step 5 — GATE** (sim:check : re-vérifier les cibles ; l'anti-camping touche surtout le bot `idle`/`greedy` qui campent — vérifier que leurs plafonds tiennent). **Commit** `feat(sim): événement réactif anti-camping (déterministe)`.

---

## Phase 4 — Arc de run ~20 min

### Task 10 : étendre rampe + courbe + boss + mini-boss/reapers

**Files:** Modify `src/content/spawnRamp.ts` (SPAWN_RAMP, difficultyScaleAt) ; `src/content/config.ts` (FINAL_BOSS.atMs) ; `src/core/systems/waveDirector.ts` ou `simulation.ts` (mini-boss périodiques) ; `src/content/waveEvents.ts` (kind `miniBoss`).
**Interfaces — Consumes:** `spawnBoss`, `MINI_BOSS_ID`.

- [ ] **Step 1 — Étendre `SPAWN_RAMP`** : ajouter des paliers couvrant ~630 s → ~1200 s (20 min), montée continue puis climax final. Étendre `difficultyScaleAt` : la courbe hp/contact/speed continue de monter jusqu'à ~20 min (garder un « coup de fouet » avant 20:00) au lieu de plafonner. (Valeurs initiales à ajuster au tuning — Task 11.)
- [ ] **Step 2 — Déplacer boss final** : `FINAL_BOSS.atMs = 1_200_000` (~20:00). Conserver `MINI_BOSS.atMs` (5:00) et AJOUTER des **mini-boss/reapers périodiques** comme événements du directeur (kind `miniBoss`) à des paliers (~toutes les 4-5 min : 5/10/15 min), rôle `'mid'`, réutilisant `ENEMIES[MINI_BOSS_ID]` (skin de stage). Un mini-boss « reaper » peut être un `charger` costaud plutôt qu'un vrai boss (choix de tuning).
- [ ] **Step 3 — Tests** : `spawnParamsAt` renvoie des paliers cohérents jusqu'à 1200 s ; `difficultyScaleAt(1_200_000)` > `difficultyScaleAt(600_000)` (monte encore) ; le directeur programme des `miniBoss` aux paliers (déterministe).
- [ ] **Step 4 — GATE partiel** : tsc/lint/vitest verts. (sim:check VA être rouge — c'est attendu, le re-tune est Task 11.) **Commit** `feat(pace): arc de run étendu à ~20 min + mini-boss périodiques`.

### Task 11 : re-tuner + re-baseliner les cibles (arc 20 min)

**Files:** Modify `tools/sim/targets.ts` ; `tools/sim/baseline.json` ; itérations sur `spawnRamp.ts` / `difficultyScaleAt` / paramètres du directeur.
**Interfaces:** cibles PASS/FAIL du harness.

- [ ] **Step 1 — Re-dériver les cibles** (`tools/sim/targets.ts`) pour un arc ~20 min : notamment `KITE_MIN_SURVIVAL_MEDIAN_MS` (viser une médiane qui traverse une bonne part de l'arc, ex. ≥ ~10-12 min — valeur à fixer d'après les mesures), garder `KITE_MIN_WIN_PCT` ≥ un plancher gagnable (≥12 %), un creux de PV significatif (climax), plafonds greedy/idle. Ajuster la durée de sim par défaut (`--duration`) à ~1260 s.
- [ ] **Step 2 — Boucle de tuning** : `npm run sim -- --seeds 12 --duration 1260 --bot kite` (+ greedy/idle). Ajuster **une variable à la fois** (paliers de `SPAWN_RAMP`, pente de `difficultyScaleAt`, gap/seuil du directeur, hp du boss final @20:00) et relancer, jusqu'à ce que les 4 bots respectent les cibles re-dérivées (« tendu mais gagnable » sur 20 min). Attention au caractère « à falaise » du late-game (cf. historique) : bouger par petits pas.
- [ ] **Step 3 — Re-baseline** : une fois les cibles VERTES, régénérer `tools/sim/baseline.json`. `npm run sim:check` → VERT.
- [ ] **Step 4 — GATE complet** : tsc/lint/vitest/**sim:check VERT**/e2e. **Commit** `chore(balance): re-tune + re-baseline (arc 20 min gagnable)`.

---

## Phase 5 — Déroulé des poids d'événements par phase

### Task 12 : pools d'événements par phase (10 stages)

**Files:** Modify `src/content/waveEvents.ts` (pool par phase) ; `src/content/phases.ts` (référence si besoin) ; Test `tests/unit/waveEvents.test.ts`.

- [ ] **Step 1 — Test** : chaque phase (terrain_vierge…livraison_audit) a un pool d'événements valide (poids > 0, kinds connus, `countMin ≤ countMax`) ; les phases tardives autorisent plus d'`encircle`/`sweep`/`miniBoss`. Fonction `eventPoolForPhase(phaseId): readonly WaveEventDef[]` (défaut `EVENT_POOL_DEFAULT`).
- [ ] **Step 2-3 — Impl** : `EVENT_POOL_BY_PHASE: Record<string, WaveEventDef[]>` — décliner les poids par identité de stage (ex. « échafaudages » favorise `sweep` façon chute de tubes ; « livraison/audit » favorise `encircle` + `miniBoss »). `stepWaveDirector` reçoit le pool de la phase courante (passé par `simulation` selon `this.phase`).
- [ ] **Step 4 — Run** → PASS. **Step 5 — GATE** (sim:check VERT — vérifier qu'aucune phase ne casse l'équilibre ; ajuster les poids extrêmes). **Commit** `feat(content): pools d'événements par phase (10 stages)`.

---

## Vérification (« jouer pour valider »)

- **Par tâche** : tsc 0 · lint 0 · vitest · **sim:check** (diff 0 en Phase 1 ; cibles re-dérivées VERTES à partir de Phase 2/4) · e2e aux tâches seam.
- **Sim headless** : `npm run sim -- --seeds 12 --duration 1260 --bot kite|greedy|idle` — l'oracle d'équilibrage de l'arc 20 min.
- **e2e (seam)** : `waveDirector.spec.ts` prouve qu'un événement (encercle/traversée) se déclenche et que `getState()` expose les `behavior` — lisibilité, pas de crash, `advanceTime` déterministe.
- **Perf** : `fps-horde` reste vert malgré les pics de spawn (le plafond `SPAWN.maxActive=300` + budget conservé bornent la horde).
- **Oracle final = playtest** : « la run de 20 min respire », les formations sont lisibles, l'anti-camping force à bouger sans harceler.

## Séquencement & risques

Phase 1 (comportements, sim:check diff 0 garanti) → Phase 2 (directeur, petit re-tune) → Phase 3 (réactif) → **Phase 4 (arc 20 min = gros re-tune/re-baseline — le risque principal)** → Phase 5 (poids par phase). Le tuning 20 min est itératif et « à falaise » : avancer par petits pas, une variable à la fois, valider au harness à chaque itération.

## Hors périmètre
- Tir à distance ennemi, pathfinding, nouveaux assets (skins dédiés par comportement = passe DA ultérieure), VFX de télégraphe du `charger` (option rendu, non bloquant).
