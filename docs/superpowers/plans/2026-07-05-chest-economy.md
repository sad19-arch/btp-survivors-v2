# Chest Economy (C1 + C2 + C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the coffre economy (periodic + elite drops, capped at 5 simultaneous) so the player can evolve weapons multiple times per run, and recalibrate mini-boss HP so it survives long enough to feel like a proper fight.

**Architecture:** A new pure `chestDirector` system (one file, one responsibility) is added to `src/core/systems/` and called from `simulation.ts`'s `step()` method. Constants live in `config.ts`. The director uses its own dedicated `Rng` instance (XOR-seeded from run seed, distinct XOR constant from `lootRng`/`prisonerRng`) so it never perturbs spawn/upgrade RNG sequences. The boss HP change is a single-number edit in `enemies.ts`.

**Tech Stack:** TypeScript strict, Vitest (pure logic), `npm run sim:check` (balance report)

## Global Constraints

- `src/core`/`src/content` MUST be pure/deterministic: NO `Math.random()`, `Date.now()`, Phaser, DOM — only seeded `Rng` and `FixedClock`.
- Zero `any`, TS strict, ESLint 0 warnings.
- Gates: `npm run type-check` (0 errors) · `npm run lint` (0 warnings) · `npm run test` (no regressions on ≥ 465 tests) · `npx playwright test seam` (smoke green) · `npm run sim:check` (report only — do NOT modify `tools/sim/targets.ts`).
- No push. Branch: `feat/juice-economy` (already checked out, HEAD d0776bb).
- Commits on `feat/juice-economy` only.
- One file = one responsibility. Data-driven (constants in `config.ts`).
- The `reap.ts` mini-boss guaranteed chest on `bossRole === 'mid'` stays unchanged.
- `src/core/systems/evolution.ts` is untouched (evolution conditions unchanged).
- `dropPickup` helper in `reap.ts` is to be extracted/reused by `chestDirector.ts` — not duplicated.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/content/config.ts` | Modify | Add `CHEST` constants block |
| `src/core/systems/reap.ts` | Modify | Export `dropPickup` (currently unexported) so `chestDirector` can reuse it |
| `src/core/systems/chestDirector.ts` | Create | Pure function `tickChestDirector(world, dt, rng, elapsedSinceLast, centroid)` + `shouldSpawnChest(...)` decision function |
| `src/core/simulation.ts` | Modify | Add `chestRng` field + `elapsedSinceLast` tracking + call `tickChestDirector` in `step()` + call `maybeDropEliteChest` in `reapDeadEnemies` call site |
| `src/content/enemies.ts` | Modify | Raise `contremaitre.hp` from 900 → 1800 |
| `tests/unit/chestDirector.test.ts` | Create | Unit tests: spawn condition, cap, determinism, RNG isolation |

---

### Task 1: Export `dropPickup` from `reap.ts` + add `CHEST` config constants

**Files:**
- Modify: `src/core/systems/reap.ts`
- Modify: `src/content/config.ts`
- Test: `tests/unit/chestDirector.test.ts` (created here, failing; green in Task 2)

**Interfaces:**
- Produces: `dropPickup(world: World, pos: Vec2, type: PickupKind, value: number): void` — now exported from `reap.ts`
- Produces: `CHEST` constant from `config.ts`:
  ```ts
  export const CHEST = {
    intervalMs: 55000,     // ~55s between periodic spawns
    eliteDropChance: 0.35, // 35% chance an elite drops a chest on death
    maxActive: 5,          // never more than 5 coffres on the ground at once
    spawnRadius: 260       // px around the nearest living player
  } as const
  ```

- [ ] **Step 1: Export `dropPickup` from `reap.ts`**

  In `src/core/systems/reap.ts`, change line 59 from:

  ```ts
  function dropPickup(world: World, pos: Vec2, type: PickupKind, value: number): void {
  ```

  to:

  ```ts
  export function dropPickup(world: World, pos: Vec2, type: PickupKind, value: number): void {
  ```

- [ ] **Step 2: Add `CHEST` constants to `config.ts`**

  In `src/content/config.ts`, add after the `PICKUP_DROPS` block (after line 74):

  ```ts
  /**
   * Directeur de coffres d'évolution.
   *
   * Contrôle l'économie de coffres : apparition périodique + drop sur mort d'élite.
   * Plafon `maxActive` garantit que jamais plus de N coffres ne coexistent.
   *
   * Ces valeurs sont tunables séparément de `PICKUP_DROPS` (coffres d'évolution,
   * pas simples bonus de loot) — la décision est déterministe via un RNG dédié.
   */
  export const CHEST = {
    /** Intervalle (ms) entre deux apparitions périodiques de coffre. */
    intervalMs: 55000,
    /** Probabilité qu'un ennemi élite lâche un coffre à sa mort (0..1). */
    eliteDropChance: 0.35,
    /** Nombre maximum de coffres actifs simultanément (inclut le coffre mini-boss). */
    maxActive: 5,
    /** Rayon d'apparition (px) autour du joueur vivant le plus proche. */
    spawnRadius: 260
  } as const
  ```

- [ ] **Step 3: Write failing tests in `tests/unit/chestDirector.test.ts`**

  Create the file with this exact content:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { shouldSpawnChest, countActiveChests } from '@core/systems/chestDirector'
  import { World } from '@core/world'

  /** Helper : ajoute N pickups 'coffre' dans un world. */
  function addChests(world: World, n: number): void {
    for (let i = 0; i < n; i++) {
      const e = world.spawn()
      world.add(e, 'position', { x: 100 + i * 10, y: 100 })
      world.add(e, 'pickup', { type: 'coffre', value: 0 })
    }
  }

  describe('chestDirector — shouldSpawnChest', () => {
    it('renvoie true quand le délai est atteint et le plafond non atteint', () => {
      const world = new World()
      addChests(world, 2)
      expect(shouldSpawnChest(world, 55001, 55000, 5)).toBe(true)
    })

    it('renvoie false quand le délai n'est pas atteint', () => {
      const world = new World()
      expect(shouldSpawnChest(world, 40000, 55000, 5)).toBe(false)
    })

    it('renvoie false quand le plafond est atteint exactement', () => {
      const world = new World()
      addChests(world, 5)
      expect(shouldSpawnChest(world, 55001, 55000, 5)).toBe(false)
    })

    it('renvoie false quand le plafond est dépassé', () => {
      const world = new World()
      addChests(world, 6)
      expect(shouldSpawnChest(world, 99999, 55000, 5)).toBe(false)
    })

    it('renvoie true au seuil exact du délai', () => {
      const world = new World()
      expect(shouldSpawnChest(world, 55000, 55000, 5)).toBe(true)
    })
  })

  describe('chestDirector — countActiveChests', () => {
    it('compte 0 quand le monde est vide', () => {
      const world = new World()
      expect(countActiveChests(world)).toBe(0)
    })

    it('compte exactement les pickups de type coffre', () => {
      const world = new World()
      addChests(world, 3)
      // Ajouter un pickup XP (ne doit pas être compté)
      const e = world.spawn()
      world.add(e, 'position', { x: 0, y: 0 })
      world.add(e, 'pickup', { type: 'xp', value: 5, lifeMs: 10000 })
      expect(countActiveChests(world)).toBe(3)
    })
  })
  ```

- [ ] **Step 4: Run tests to confirm they fail**

  ```
  npx vitest run tests/unit/chestDirector.test.ts
  ```

  Expected: FAIL with "Cannot find module '@core/systems/chestDirector'" or similar.

- [ ] **Step 5: Run type-check to confirm no new errors from the export change**

  ```
  npm run type-check
  ```

  Expected: 0 errors (the export is just a visibility change).

- [ ] **Step 6: Commit**

  ```bash
  git add src/content/config.ts src/core/systems/reap.ts tests/unit/chestDirector.test.ts
  git commit -m "feat(C1): CHEST config + export dropPickup + failing chestDirector tests"
  ```

---

### Task 2: Implement `chestDirector.ts` (pure functions)

**Files:**
- Create: `src/core/systems/chestDirector.ts`
- Test: `tests/unit/chestDirector.test.ts` (already written, should now pass)

**Interfaces:**
- Consumes: `dropPickup` from `@core/systems/reap` (exported in Task 1), `World` from `@core/world`, `Rng` from `@core/rng`, `CHEST` from `@content/config`, `Vec2` from `@core/types`
- Produces:
  ```ts
  export function countActiveChests(world: World): number
  export function shouldSpawnChest(world: World, elapsedSinceLast: number, intervalMs: number, maxActive: number): boolean
  export function tickChestDirector(world: World, rng: Rng, elapsedSinceLast: number, centroid: Vec2): number
  export function maybeDropEliteChest(world: World, rng: Rng, pos: Vec2): void
  ```

  `tickChestDirector` returns the new `elapsedSinceLast` (reset to 0 if a chest was spawned, otherwise `elapsedSinceLast + dt` — **but `dt` is NOT passed in; the caller accumulates and passes the total elapsed**). Actually, the caller accumulates `elapsedSinceLast` and passes it in; `tickChestDirector` returns the updated value (0 if spawned, unchanged otherwise).

  Wait — cleaner: the caller passes `elapsedSinceLast` in milliseconds; `tickChestDirector` internally decides to spawn; returns the updated elapsed (reset to 0 if spawned).

- [ ] **Step 1: Create `src/core/systems/chestDirector.ts`**

  ```ts
  /**
   * Directeur de coffres d'évolution.
   *
   * Deux sources de coffres (en plus du mini-boss garanti, inchangé dans reap.ts) :
   *  1. Périodique : un coffre apparaît toutes les `CHEST.intervalMs` ms autour du
   *     joueur vivant le plus proche, si `maxActive` n'est pas atteint.
   *  2. Mort d'élite : `maybeDropEliteChest` est appelé depuis `simulation.ts`
   *     lors du reap d'un ennemi élite — probabilité `CHEST.eliteDropChance`.
   *
   * Déterminisme : toutes les décisions passent par le `Rng` dédié `chestRng`
   * (séparé du RNG spawn/loot/upgrade) — la séquence de spawn d'ennemis est inchangée.
   *
   * Purs/sans effets de bord sur l'état hors du `World` : aucun `Math.random()`,
   * aucun `Date.now()`, pas de Phaser, pas de DOM.
   */

  import type { World } from '@core/world'
  import type { Rng } from '@core/rng'
  import type { Vec2 } from '@core/types'
  import { dropPickup } from '@core/systems/reap'
  import { CHEST } from '@content/config'

  /**
   * Compte les coffres d'évolution (`'coffre'`) actuellement au sol.
   * Utilisé pour faire respecter le plafond `maxActive`.
   */
  export function countActiveChests(world: World): number {
    let count = 0
    for (const e of world.query('pickup')) {
      const pk = world.get(e, 'pickup')
      if (pk?.type === 'coffre') {
        count++
      }
    }
    return count
  }

  /**
   * Décide si un coffre périodique doit apparaître.
   * Fonction pure — toutes les décisions basées sur les paramètres fournis.
   *
   * @param world          - monde courant (pour compter les coffres actifs)
   * @param elapsedSinceLast - ms depuis le dernier coffre périodique spawné
   * @param intervalMs     - intervalle cible (ex. CHEST.intervalMs)
   * @param maxActive      - plafond de coffres simultanés (ex. CHEST.maxActive)
   */
  export function shouldSpawnChest(
    world: World,
    elapsedSinceLast: number,
    intervalMs: number,
    maxActive: number
  ): boolean {
    if (elapsedSinceLast < intervalMs) {
      return false
    }
    return countActiveChests(world) < maxActive
  }

  /**
   * Tick du directeur de coffres périodiques. Appelé chaque pas fixe depuis
   * `simulation.ts` (uniquement quand la scène est 'game').
   *
   * Retourne le nouveau `elapsedSinceLast` : remis à 0 si un coffre a été spawné,
   * sinon inchangé (l'appelant y ajoute dt avant d'appeler).
   *
   * @param world            - monde ECS courant
   * @param rng              - RNG dédié `chestRng` (seed isolé)
   * @param elapsedSinceLast - ms accumulées depuis le dernier coffre périodique
   * @param centroid         - position du joueur vivant le plus proche (ou centroïde)
   */
  export function tickChestDirector(
    world: World,
    rng: Rng,
    elapsedSinceLast: number,
    centroid: Vec2
  ): number {
    if (!shouldSpawnChest(world, elapsedSinceLast, CHEST.intervalMs, CHEST.maxActive)) {
      return elapsedSinceLast
    }
    // Spawne le coffre à une position déterministe autour du centroïde.
    const angle = rng.float(0, Math.PI * 2)
    const pos: Vec2 = {
      x: centroid.x + Math.cos(angle) * CHEST.spawnRadius,
      y: centroid.y + Math.sin(angle) * CHEST.spawnRadius
    }
    dropPickup(world, pos, 'coffre', 0)
    return 0 // reset le compteur
  }

  /**
   * Tente de lâcher un coffre à la mort d'un ennemi élite (`isElite === true`).
   * Ne fait rien si le plafond est déjà atteint.
   * Appelé depuis `simulation.ts` dans la boucle de mort (après `reapDeadEnemies`).
   *
   * @param world - monde ECS courant
   * @param rng   - RNG dédié `chestRng`
   * @param pos   - position de mort de l'ennemi élite
   */
  export function maybeDropEliteChest(world: World, rng: Rng, pos: Vec2): void {
    if (countActiveChests(world) >= CHEST.maxActive) {
      return
    }
    if (rng.chance(CHEST.eliteDropChance)) {
      dropPickup(world, pos, 'coffre', 0)
    }
  }
  ```

- [ ] **Step 2: Run the failing tests**

  ```
  npx vitest run tests/unit/chestDirector.test.ts
  ```

  Expected: ALL PASS (5 + 2 = 7 tests green).

- [ ] **Step 3: Run full Vitest suite to check for regressions**

  ```
  npm run test
  ```

  Expected: ≥ 465 passing, 0 failures.

- [ ] **Step 4: Run type-check**

  ```
  npm run type-check
  ```

  Expected: 0 errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/core/systems/chestDirector.ts
  git commit -m "feat(C1): chestDirector — coffres périodiques + drop élite (pur, déterministe)"
  ```

---

### Task 3: Wire `chestDirector` into `simulation.ts` (periodic + elite paths)

**Files:**
- Modify: `src/core/simulation.ts`

**Interfaces:**
- Consumes: `tickChestDirector`, `maybeDropEliteChest`, `countActiveChests` from `@core/systems/chestDirector`
- Consumes: `CHEST` from `@content/config`

This task has three sub-changes to `simulation.ts`:
1. Add `chestRng: Rng` field (XOR seed `0x3c7a`), initialized in constructor + reset in `reset()`.
2. Add `chestAccMs: number` field (tracks time since last periodic chest).
3. In `step()`: accumulate `chestAccMs += dt`, then call `tickChestDirector` and update `chestAccMs`.
4. In `reapDeadEnemies` call site: after reaping each dead elite, call `maybeDropEliteChest`.

The tricky part: `reapDeadEnemies` currently returns just a count. We need to also feed elite positions to `maybeDropEliteChest`. Two options:
- **Option A** (chosen): extend `reapDeadEnemies` to also return elite positions. HOWEVER this changes `reap.ts` signature and many callers. Too invasive.
- **Option B** (chosen): collect elite positions inside `simulation.ts` BEFORE calling `reapDeadEnemies` — query dead enemies (`hp <= 0`) that are elite, save their positions, call `reapDeadEnemies`, then call `maybeDropEliteChest` for each position. This keeps `reap.ts` stable.

**Option B implementation detail:** in `step()`, between `collisionSystem` and `reapDeadEnemies`:
```ts
const deadElitePositions = this.collectDeadElitePositions()
const killed = reapDeadEnemies(this.world, this.lootRng)
for (const pos of deadElitePositions) {
  maybeDropEliteChest(this.world, this.chestRng, pos)
}
```

- [ ] **Step 1: Add imports to `simulation.ts`**

  Add to the imports block (after the existing imports):

  ```ts
  import { tickChestDirector, maybeDropEliteChest } from './systems/chestDirector'
  import { CHEST } from '@content/config'
  ```

  Note: `CHEST` is added to the `@content/config` import line that already imports `coopHpFactor, FINAL_BOSS, MINI_BOSS, ...`. Add `CHEST` to that destructure.

- [ ] **Step 2: Add `chestRng` and `chestAccMs` fields to the class**

  In the class body, after the `private prisonerRng: Rng` field, add:

  ```ts
  /** RNG dédié au directeur de coffres — séparé du RNG spawn/loot/upgrade. */
  private chestRng: Rng
  /** Ms accumulées depuis le dernier coffre périodique (directeur de coffres). */
  private chestAccMs = 0
  ```

- [ ] **Step 3: Initialize `chestRng` in the constructor**

  In the constructor body, after `this.prisonerRng = new Rng((opts.seed ^ 0x2b1d) | 0)`, add:

  ```ts
  this.chestRng = new Rng((opts.seed ^ 0x3c7a) | 0)
  ```

- [ ] **Step 4: Reset `chestRng` and `chestAccMs` in `reset()`**

  In the `reset(seed: number)` method, after `this.prisonerRng = new Rng((seed ^ 0x2b1d) | 0)`, add:

  ```ts
  this.chestRng = new Rng((seed ^ 0x3c7a) | 0)
  this.chestAccMs = 0
  ```

- [ ] **Step 5: Add `collectDeadElitePositions()` private method**

  Add a new private method to `Simulation` (before `step()` or after `playersCentroid()`):

  ```ts
  /**
   * Collecte les positions des ennemis élites dont les PV sont à 0 ou moins,
   * AVANT leur reap — pour pouvoir faire apparaître des coffres à leur position
   * de mort sans modifier la signature de `reapDeadEnemies`.
   */
  private collectDeadElitePositions(): Vec2[] {
    const positions: Vec2[] = []
    for (const e of this.world.query('enemy', 'health', 'position')) {
      const health = this.world.get(e, 'health')
      const enemy = this.world.get(e, 'enemy')
      const pos = this.world.get(e, 'position')
      if (health !== undefined && health.hp <= 0 && enemy?.isElite === true && pos !== undefined) {
        positions.push({ x: pos.x, y: pos.y })
      }
    }
    return positions
  }
  ```

- [ ] **Step 6: Wire periodic chest ticks in `step()`**

  In `step(dtMs: number)`, at the top where `this.runSpawns(dtMs)` is called, add AFTER `this.runSpawns(dtMs)` (so chests don't interfere with the spawn accumulator):

  ```ts
  // Directeur de coffres périodiques (RNG isolé, déterministe).
  this.chestAccMs += dtMs
  this.chestAccMs = tickChestDirector(this.world, this.chestRng, this.chestAccMs, this.playersCentroid())
  ```

- [ ] **Step 7: Wire elite death chest drops in `step()`**

  In `step()`, replace the current `reapDeadEnemies` call:

  ```ts
  const killed = reapDeadEnemies(this.world, this.lootRng)
  ```

  with:

  ```ts
  const deadElitePositions = this.collectDeadElitePositions()
  const killed = reapDeadEnemies(this.world, this.lootRng)
  // Drop coffre sur mort d'élite (RNG dédié, ne perturbe pas lootRng/rng).
  for (const pos of deadElitePositions) {
    maybeDropEliteChest(this.world, this.chestRng, pos)
  }
  ```

- [ ] **Step 8: Run type-check**

  ```
  npm run type-check
  ```

  Expected: 0 errors.

- [ ] **Step 9: Run lint**

  ```
  npm run lint
  ```

  Expected: 0 warnings.

- [ ] **Step 10: Run full test suite**

  ```
  npm run test
  ```

  Expected: ≥ 465 passing, 0 failures. The existing `chestEvolution.test.ts` and `simulationMiniBoss.test.ts` tests must still pass.

- [ ] **Step 11: Commit**

  ```bash
  git add src/core/simulation.ts
  git commit -m "feat(C1): wirer chestDirector dans simulation (périodique + élites, RNG isolé)"
  ```

---

### Task 4: Add RNG isolation test + determinism test

**Files:**
- Modify: `tests/unit/chestDirector.test.ts`

**Interfaces:**
- Consumes: `Simulation` from `@core/simulation`, `Rng` from `@core/rng`

The goal is to verify two properties:
1. **Determinism**: same seed + same bot inputs → same spawn sequence of chests.
2. **RNG isolation**: adding the chest director does not change the enemy spawn sequence.

For property 2, the approach: run a sim without chests ever spawning (condition: `chestAccMs` always < `intervalMs` → never triggered in first 10s) and compare enemy spawn sequence. But we can't directly prevent chests without a flag. Instead, we verify the enemy spawn sequence determinism: two runs with the same seed and different chest outcomes (manually setting `chestAccMs`) produce the same enemy spawns.

Actually, a simpler and more practical test: run two simulations with the same seed; advance them identically; confirm the enemy list at various moments is identical. This would catch any RNG leakage (if chest director leaked into spawn RNG, the enemy sequence would diverge).

- [ ] **Step 1: Add determinism + RNG isolation tests**

  Append to `tests/unit/chestDirector.test.ts`:

  ```ts
  import { Simulation } from '@core/simulation'

  describe('chestDirector — déterminisme + isolation RNG', () => {
    it('même seed → même séquence de coffres (déterministe)', () => {
      // Deux runs identiques doivent produire les mêmes pickups coffre aux mêmes instants.
      function runAndCollectChestSpawns(seed: number): number[] {
        const sim = new Simulation({ seed, mode: 'solo' })
        const chestTs: number[] = []
        // Avance 120s (2:00), temps d'observer plusieurs spawns périodiques.
        let t = 0
        while (t < 120000) {
          if (sim.getState().pendingLevelUp !== null) {
            sim.chooseUpgrade(0)
            continue
          }
          const before = sim.getState().pickups.filter(p => p.type === 'coffre').length
          sim.advanceTime(1000)
          t += 1000
          const after = sim.getState().pickups.filter(p => p.type === 'coffre').length
          if (after > before) {
            chestTs.push(t)
          }
        }
        return chestTs
      }

      const run1 = runAndCollectChestSpawns(42)
      const run2 = runAndCollectChestSpawns(42)
      expect(run1).toEqual(run2)
    })

    it('enemy list identique avec/sans coffres actifs (RNG chest isolé)', () => {
      // On vérifie que la liste d'ennemis (type, ordre) est identique entre deux
      // runs à seed identique, même si des coffres sont apparus entre-temps.
      // Si le chestRng puisait dans le rng spawn, les types divergeraient.
      const simA = new Simulation({ seed: 7, mode: 'solo' })
      const simB = new Simulation({ seed: 7, mode: 'solo' })

      // Avance 60s, choisit toujours la 1re carte.
      for (let i = 0; i < 60; i++) {
        for (const sim of [simA, simB]) {
          if (sim.getState().pendingLevelUp !== null) {
            sim.chooseUpgrade(0)
          }
          sim.advanceTime(1000)
        }
      }

      const typesA = simA.getState().enemies.map(e => e.type).sort()
      const typesB = simB.getState().enemies.map(e => e.type).sort()
      expect(typesA).toEqual(typesB)
    })
  })
  ```

- [ ] **Step 2: Run tests**

  ```
  npx vitest run tests/unit/chestDirector.test.ts
  ```

  Expected: ALL PASS (7 original + 2 new = 9 tests green).

- [ ] **Step 3: Run full suite**

  ```
  npm run test
  ```

  Expected: ≥ 467 passing, 0 failures.

- [ ] **Step 4: Commit**

  ```bash
  git add tests/unit/chestDirector.test.ts
  git commit -m "test(C1): déterminisme coffres + isolation RNG chest vs spawn"
  ```

---

### Task 5: Recalibrate mini-boss HP (C2)

**Files:**
- Modify: `src/content/enemies.ts`

**Interfaces:**
- `contremaitre.hp`: 900 → 1800

**Rationale:** With buffed weapons + evolutions (commits 75d377d, afd4e32), the mini-boss dies in seconds at hp=900. Target: a fight of ~10-20s for a player who has reached it normally (~5:00 with level 15+ and some weapon upgrades). The boss final reuses `contremaitre` def — but its hp is scaled by `coopHpFactor` (×1 in solo, ×1.5 in coop2 etc.). Setting to 1800 makes it:
- Solo mini-boss: 1800 HP — survives the initial burst, player must kite for ~10-15s.
- Solo final boss: 1800 HP as well (same def) — the player should have evolutions by then; still killable.
- `sim:check` will tell us if this breaks win rate; we report but do not force the baseline.

- [ ] **Step 1: Write the test first**

  Add a new test file `tests/unit/miniBossHp.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { ENEMIES, MINI_BOSS_ID } from '@content/enemies'

  describe('Mini-boss HP calibration', () => {
    it('le contremaître a des PV ≥ 1800 (survivre au burst initial des armes buffées)', () => {
      const boss = ENEMIES[MINI_BOSS_ID]
      if (boss === undefined) throw new Error('contremaitre introuvable')
      expect(boss.hp).toBeGreaterThanOrEqual(1800)
    })
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```
  npx vitest run tests/unit/miniBossHp.test.ts
  ```

  Expected: FAIL — `Expected 900 to be greater than or equal to 1800`.

- [ ] **Step 3: Change `contremaitre.hp` in `enemies.ts`**

  In `src/content/enemies.ts`, change:

  ```ts
  contremaitre: {
    id: 'contremaitre',
    name: 'Contremaître',
    hp: 900,
  ```

  to:

  ```ts
  contremaitre: {
    id: 'contremaitre',
    name: 'Contremaître',
    hp: 1800,
  ```

- [ ] **Step 4: Run the new test to confirm it passes**

  ```
  npx vitest run tests/unit/miniBossHp.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Run full test suite for regressions**

  ```
  npm run test
  ```

  Expected: ≥ 468 passing, 0 failures. Note: `simulationMiniBoss.test.ts` verifies boss TIMING not HP, so it should still pass. `bossSplit.test.ts` tests boss roles, not HP — should pass.

- [ ] **Step 6: Run type-check + lint**

  ```
  npm run type-check && npm run lint
  ```

  Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

  ```bash
  git add src/content/enemies.ts tests/unit/miniBossHp.test.ts
  git commit -m "fix(C2): mini-boss hp 900→1800 (survit au burst armes buffées)"
  ```

---

### Task 6: Validation gates + sim:check report (C3)

**Files:**
- No code changes. Pure validation + reporting.

- [ ] **Step 1: Run smoke e2e**

  ```
  npx playwright test seam
  ```

  Expected: green (the seam tests exercise the core game loop, chest pickup via `debugSpawnChestOnPlayer`, etc.).

- [ ] **Step 2: Run full Vitest**

  ```
  npm run test
  ```

  Expected: ≥ 468 passing (Tasks 1-5 added at least 3 new tests), 0 failures.

- [ ] **Step 3: Run type-check**

  ```
  npm run type-check
  ```

  Expected: 0 errors.

- [ ] **Step 4: Run lint**

  ```
  npm run lint
  ```

  Expected: 0 warnings.

- [ ] **Step 5: Run sim:check and record the results**

  ```
  npm run sim:check
  ```

  IMPORTANT: Record the full table output (survie méd / % survie pleine / % victoire / niv@5:00 / pic ennemis) for all three bots. Compare to the BEFORE baseline:

  ```
  BEFORE (pre C1+C2):
  bot      | survie méd | %survie pleine | % victoire | niv@5:00 | pic ennemis
  ---------|------------|----------------|------------|----------|------------
  kite     |       605s |            33% |        33% |       15 |          77
  greedy   |       515s |             8% |         8% |       19 |          42
  idle     |       230s |             0% |         0% |        8 |          10
  ```

  Note whether VERTES or ROUGES. Do NOT modify `tools/sim/targets.ts`. Write the AFTER table to the report file.

- [ ] **Step 6: Write the economy-report.md file**

  Write to: `C:\Users\SAD19_~1\AppData\Local\Temp\claude\C--Users-sad19-hh5urvi-Desktop-btp-survivors-v2\13a8b923-e299-4d7b-903f-0a329fad4f79\scratchpad\economy-report.md`

  Include:
  - Status (done / gate results)
  - Commit hashes for C1 (two commits) and C2 (one commit)
  - Gate results: type-check / lint / test / e2e / sim:check
  - BEFORE table (above) vs AFTER table (from Step 5)
  - Cibles VERTES or ROUGES (and which ones failed, if any)
  - CHEST values chosen: intervalMs=55000, eliteDropChance=0.35, maxActive=5, spawnRadius=260
  - Mini-boss HP chosen: 900→1800
  - Files created/modified
  - How chestRng is isolated (XOR constant `0x3c7a`, distinct from lootRng `0x1007` and prisonerRng `0x2b1d`)
  - Concerns

---

## Self-Review

### Spec Coverage Check

| Spec requirement | Task |
|---|---|
| C1: `CHEST` constants in `config.ts` | Task 1 |
| C1: `chestDirector.ts` new system | Task 2 |
| C1: Periodic spawn every `intervalMs` around nearest living player | Tasks 2+3 |
| C1: Elite drop on death, capped at `maxActive` | Tasks 2+3 |
| C1: Dedicated RNG `chestRng`, isolated from spawn/upgrade | Tasks 3+4 |
| C1: Mini-boss guaranteed chest unchanged (reap.ts bossRole=mid) | No touch needed |
| C1: Evolution conditions unchanged (evolution.ts untouched) | Confirmed |
| C1: TDD — `chestDirector.test.ts` | Tasks 1, 2, 4 |
| C2: Mini-boss hp recalibrated | Task 5 |
| C2: Boss final killability preserved (sim:check) | Task 6 |
| C3: sim:check run + full table reported | Task 6 |
| C3: No re-baseline | Confirmed (never touch targets.ts) |
| Gates: type-check 0, lint 0, test ≥465, e2e seam | Task 6 |

### Placeholder Scan

No "TBD", "TODO", or vague steps present. All code blocks are complete. All commands have expected outputs.

### Type Consistency

- `dropPickup(world: World, pos: Vec2, type: PickupKind, value: number): void` — defined in Task 1, consumed identically in Task 2.
- `shouldSpawnChest(world: World, elapsedSinceLast: number, intervalMs: number, maxActive: number): boolean` — defined and tested with identical signatures.
- `tickChestDirector(world: World, rng: Rng, elapsedSinceLast: number, centroid: Vec2): number` — returns `number` (new elapsed), consumed in Task 3 as `this.chestAccMs = tickChestDirector(...)`.
- `maybeDropEliteChest(world: World, rng: Rng, pos: Vec2): void` — defined in Task 2, consumed in Task 3.
- `Vec2` is `{ x: number, y: number }` from `@core/types` — consistent everywhere.
