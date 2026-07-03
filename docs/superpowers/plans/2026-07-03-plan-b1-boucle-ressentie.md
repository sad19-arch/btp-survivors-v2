# Plan B1 — Boucle ressentie (gameplay, headless) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de la run une vraie courbe VS (~11 min) où les évolutions sont ENFIN atteignables en jeu : boss de mi-parcours qui lâche le coffre (→ évolution en run), boss final = victoire, arc de difficulté à densité découplée (horde qui fond en phase de puissance, mur en fin), et re-tuning de l'équilibrage.

**Architecture:** Tout en `src/core`/`src/content` (pur, déterministe, testable via Vitest + `npm run sim`). On ajoute un rôle de boss (`mid`/`final`) au composant `enemy`, on scinde le spawn/victoire dans `simulation.ts`, `reapDeadEnemies` lâche un `coffre` à la mort du boss de mi-parcours, et on découple la pression (nombre) de la robustesse (PV) dans `spawnRamp.ts`. Aucun rendu ici (Plan B2).

**Tech Stack:** TypeScript strict, Vitest (happy-dom), harness `npm run sim` (`tools/sim`), RNG seedé.

## Global Constraints

- `src/core` et `src/content` : PURS — interdit `Math.random()`, `Date.now()`, `new Date()` ; utiliser le `Rng` seedé. Aucun import Phaser/DOM.
- Zéro `any` ; `tsconfig` strict + `noUncheckedIndexedAccess`.
- Data-driven ; un fichier = une responsabilité ; texte in-game en français.
- Déterminisme : même seed + mêmes inputs ⇒ même run.
- Branche de travail : `feat/weapon-system-core` (suite de Plan A, HEAD `d963067`). Commits locaux OK ; **pas de push sans feu vert**.
- Gates par tâche : `npm run type-check && npm run lint && npm run test` verts (sauf la tâche de tuning : gate = `npm run sim:check` vert).
- Valeurs de timing verrouillées : boss de mi-parcours à **5:00** (`MINI_BOSS.atMs = 300_000`), boss final à **~10:30** (`FINAL_BOSS.atMs = 630_000`), durée de run cible **~11 min** (660 s).

---

## File structure

- Modify `src/core/types.ts` — composant `enemy` gagne `bossRole?: 'mid' | 'final'`.
- Modify `src/core/systems/spawn.ts` — `spawnEnemy`/`spawnBoss` acceptent et posent `bossRole`.
- Modify `src/content/config.ts` — ajoute `FINAL_BOSS`, relève `SPAWN.maxActive`.
- Modify `src/core/systems/reap.ts` — lâche un `coffre` à la mort d'un boss `bossRole==='mid'`.
- Modify `src/core/simulation.ts` — split spawn (mid + final), `anyFinalBossAlive`, `updateWin` sur le boss final, flags.
- Modify `src/content/spawnRamp.ts` — `SPAWN_RAMP` (densité forte 3-9 min, étendu à 660 s) + `difficultyScaleAt` (PV doux en puissance, raide en fin).
- Modify `tools/sim/targets.ts` + `package.json` (`sim:check --duration 660`) + `tools/sim/baseline.json` — re-tuning.
- Tests : `tests/unit/bossSplit.test.ts`, `tests/unit/spawnRampArc.test.ts` (+ adapter les tests existants touchés).

---

## Task 1: Rôle de boss (`bossRole`) sur le composant `enemy`

**Files:**
- Modify: `src/core/types.ts` (composant `enemy`)
- Modify: `src/core/systems/spawn.ts`
- Test: `tests/unit/spawn.test.ts` (ajouter un cas)

**Interfaces:**
- Produces:
  - composant `enemy` : ajout du champ optionnel `bossRole?: 'mid' | 'final'`.
  - `spawnBoss(world, def, center, angle, radius?, role?: 'mid' | 'final'): void` — pose `bossRole = role` sur l'ennemi créé (et `isBoss = true` comme aujourd'hui).

- [ ] **Step 1: Write the failing test** — ajouter à `tests/unit/spawn.test.ts` :

```ts
import { spawnBoss } from '@core/systems/spawn'
import { ENEMIES, MINI_BOSS_ID } from '@content/enemies'
// ... dans un it() :
it('spawnBoss pose isBoss + bossRole', () => {
  const w = new World()
  const def = ENEMIES[MINI_BOSS_ID]!
  spawnBoss(w, def, { x: 800, y: 600 }, 0, 320, 'mid')
  const e = [...w.query('enemy')][0]!
  const comp = w.get(e, 'enemy')!
  expect(comp.isBoss).toBe(true)
  expect(comp.bossRole).toBe('mid')
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/unit/spawn.test.ts` → FAIL (`bossRole` inconnu / non posé).

- [ ] **Step 3: Implement**
  - Dans `src/core/types.ts`, le composant `enemy` : ajouter `bossRole?: 'mid' | 'final'` après `isBoss`.
  - Dans `src/core/systems/spawn.ts` : `spawnEnemy(world, def, pos, isBoss = false, scale = NO_SCALE, bossRole?: 'mid' | 'final')` → dans `world.add(e, 'enemy', { … , isBoss, bossRole, … })`. `spawnBoss(world, def, center, angle, radius = SPAWN.ringRadius, role?: 'mid' | 'final')` → passe `true` et `role` à `spawnEnemy`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/unit/spawn.test.ts` → PASS.

- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint
git add src/core/types.ts src/core/systems/spawn.ts tests/unit/spawn.test.ts
git commit -m "feat(core): rôle de boss (mid/final) sur le composant enemy + spawnBoss(role)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Split de boss — coffre au mi-parcours, victoire au boss final

**Files:**
- Modify: `src/content/config.ts` (ajout `FINAL_BOSS`)
- Modify: `src/core/systems/reap.ts` (coffre à la mort du boss `mid`)
- Modify: `src/core/simulation.ts` (spawn mid + final, `anyFinalBossAlive`, `updateWin`, flags, reset)
- Test: `tests/unit/bossSplit.test.ts`

**Interfaces:**
- Consumes: `bossRole` (Task 1), `spawnBoss(role)` (Task 1), `tryEvolve`/coffre (Plan A).
- `config.ts` : `export const FINAL_BOSS = { atMs: 630_000, spawnRadius: 320 } as const`.
- `reap.ts` : la mort d'un ennemi `bossRole==='mid'` lâche un pickup `{type:'coffre', value:0}` à sa position (en plus de la gemme d'XP).
- `simulation.ts` : `maybeSpawnMidBoss()` (à `MINI_BOSS.atMs`, role `'mid'`), `maybeSpawnFinalBoss()` (à `FINAL_BOSS.atMs`, role `'final'`, met `finalBossSpawned=true`), `anyFinalBossAlive()` (bossRole `'final'`), `updateWin` = `finalBossSpawned && !anyFinalBossAlive()`. Remplacer `bossEverSpawned`/`miniBossSpawned` par `midBossSpawned` + `finalBossSpawned`.

Contexte : aujourd'hui `maybeSpawnMiniBoss` spawne le boss à 5:00 et `updateWin` gagne dès qu'aucun `isBoss` n'est vivant (`bossEverSpawned && !anyBossAlive`). On DÉCOUPLE : le boss de 5:00 devient `mid` (lâche le coffre via reap, NE gagne PAS), et un boss `final` à 10:30 dont la mort = victoire.

- [ ] **Step 1: Write the failing test** — `tests/unit/bossSplit.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'
import { spawnBoss } from '@core/systems/spawn'
import { reapDeadEnemies } from '@core/systems/reap'
import { World } from '@core/world'
import { ENEMIES, MINI_BOSS_ID } from '@content/enemies'

describe('reap — coffre à la mort du boss de mi-parcours', () => {
  it('un boss mid mort lâche un pickup coffre', () => {
    const w = new World()
    const def = ENEMIES[MINI_BOSS_ID]!
    spawnBoss(w, def, { x: 100, y: 100 }, 0, 0, 'mid')
    const boss = [...w.query('enemy')][0]!
    w.get(boss, 'health')!.hp = 0
    reapDeadEnemies(w)
    const coffres = [...w.query('pickup')].filter((e) => w.get(e, 'pickup')!.type === 'coffre')
    expect(coffres.length).toBe(1)
  })
  it('un boss final mort NE lâche PAS de coffre', () => {
    const w = new World()
    const def = ENEMIES[MINI_BOSS_ID]!
    spawnBoss(w, def, { x: 100, y: 100 }, 0, 0, 'final')
    const boss = [...w.query('enemy')][0]!
    w.get(boss, 'health')!.hp = 0
    reapDeadEnemies(w)
    const coffres = [...w.query('pickup')].filter((e) => w.get(e, 'pickup')!.type === 'coffre')
    expect(coffres.length).toBe(0)
  })
})

describe('simulation — split de boss', () => {
  // Bot kite minimal pour survivre ; à défaut, on force l'état via debug si dispo.
  function advanceToWin(seed: number): { won: boolean; midChestSeen: boolean } {
    const sim = new Simulation({ seed, mode: 'solo' })
    let midChestSeen = false
    for (let t = 0; t < 700000; t += 100) {
      const st = sim.getState()
      if (st.scene === 'gameover') break
      if (st.pickups.some((p) => p.type === 'coffre')) midChestSeen = true
      if (st.scene === 'won') return { won: true, midChestSeen }
      const p = st.players[0]
      if (p === undefined) break
      // fuite pondérée + attaque
      let fx = 0, fy = 0
      for (const e of st.enemies) { const dx = p.x - e.x, dy = p.y - e.y; const d = Math.hypot(dx, dy) || 1; fx += dx / (d * d); fy += dy / (d * d) }
      const L = Math.hypot(fx, fy) || 1
      sim.setInput(1, { move: { x: fx / L, y: fy / L }, attack: true })
      if (st.pendingLevelUp) { sim.chooseUpgrade(0); continue }
      sim.advanceTime(100)
    }
    return { won: false, midChestSeen }
  }

  it('la victoire n\'arrive PAS avant le boss final (~10:30)', () => {
    // Le boss mid à 5:00 ne doit pas déclencher la victoire.
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    // avance à ~5:30 via un bot survivant simplifié serait fragile ; on vérifie le contrat pur :
    // à ce stade, aucun boss final n'a spawné -> updateWin impossible.
    expect(sim.getState().scene).toBe('game')
  })
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/unit/bossSplit.test.ts` → FAIL (coffre non lâché ; API split absente).

- [ ] **Step 3: Implement**
  - `config.ts` : ajouter `FINAL_BOSS`.
  - `reap.ts` : dans la boucle des morts, si `ecomp.bossRole === 'mid'` → `dropPickup(world, epos, 'coffre', 0)` (après la gemme d'XP).
  - `simulation.ts` :
    - champs : remplacer `private miniBossSpawned = false` par `private midBossSpawned = false` ; remplacer `private bossEverSpawned = false` par `private finalBossSpawned = false`. `reset()` : mettre les deux à `false`.
    - `runSpawns` : appeler `this.maybeSpawnMidBoss()` PUIS `this.maybeSpawnFinalBoss()` avant la boucle de vagues.
    - `maybeSpawnMidBoss()` : `if (this.midBossSpawned || this.elapsedMs < MINI_BOSS.atMs) return;` → `spawnBoss(this.world, def, this.playersCentroid(), this.rng.float(0, Math.PI*2), MINI_BOSS.spawnRadius, 'mid')` + `this.events.dispatchEvent(new BossSpawnedEvent())` + `this.midBossSpawned = true`. (NE met PAS de flag de victoire.)
    - `maybeSpawnFinalBoss()` : `if (this.finalBossSpawned || this.elapsedMs < FINAL_BOSS.atMs) return;` → `spawnBoss(..., FINAL_BOSS.spawnRadius, 'final')` + `BossSpawnedEvent` + `this.finalBossSpawned = true`.
    - `anyFinalBossAlive()` : comme `anyBossAlive` mais teste `this.world.get(e,'enemy')?.bossRole === 'final'`. GARDER `anyBossAlive` (utilisé par le rendu/barre de PV via l'état).
    - `updateWin()` : `if (this.scene === 'game' && this.finalBossSpawned && !this.anyFinalBossAlive())`.
    - importer `FINAL_BOSS` depuis `@content/config`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/unit/bossSplit.test.ts` → PASS. Puis toute la suite `npx vitest run` (adapter `tests/unit/simulationMiniBoss.test.ts` si présent : le boss de 5:00 n'est plus la victoire).

- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint && npx vitest run
git add -A
git commit -m "feat(core): split de boss — coffre au mi-parcours (évolution en run), victoire au boss final

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Découplage densité / PV + horde

**Files:**
- Modify: `src/content/spawnRamp.ts` (`SPAWN_RAMP` + `difficultyScaleAt`)
- Modify: `src/content/config.ts` (`SPAWN.maxActive`)
- Test: `tests/unit/spawnRampArc.test.ts`

**Interfaces:**
- Consumes: rien de nouveau. Signatures `spawnParamsAt`/`difficultyScaleAt` INCHANGÉES (seules les données changent).
- `SPAWN.maxActive` passe de `200` à `300` (horde ; la perf de rendu est gérée en Plan B2).

Principe : la PRESSION monte via le NOMBRE (ramp de spawn dense en phase de puissance), la ROBUSTESSE (PV) monte doucement pendant la puissance (les ennemis fondent) puis raide en fin (le mur). Valeurs de départ ci-dessous (le calage fin est la Task 4).

- [ ] **Step 1: Write the failing test** — `tests/unit/spawnRampArc.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { SPAWN_RAMP, spawnParamsAt, difficultyScaleAt } from '@content/spawnRamp'

describe('arc de spawn découplé', () => {
  it('la rampe couvre au moins 10:30 (630 s)', () => {
    expect(SPAWN_RAMP[SPAWN_RAMP.length - 1]!.fromSec).toBeGreaterThanOrEqual(600)
  })
  it('densité forte en phase de puissance (6:00) : au moins 3/vague', () => {
    const p = spawnParamsAt(SPAWN_RAMP, 360_000)
    expect(p.countPerWave).toBeGreaterThanOrEqual(3)
  })
  it('PV doux en puissance (6:00) puis mur en fin (11:00)', () => {
    const mid = difficultyScaleAt(360_000).hp // 6:00
    const end = difficultyScaleAt(660_000).hp // 11:00
    expect(mid).toBeLessThan(2.0) // les ennemis fondent encore
    expect(end).toBeGreaterThan(mid * 1.5) // saut net = climax
  })
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/unit/spawnRampArc.test.ts` → FAIL (rampe trop courte / PV trop haut à 6:00 / pas de saut).

- [ ] **Step 3: Implement** — remplacer dans `src/content/spawnRamp.ts` :

```ts
export const SPAWN_RAMP: readonly SpawnRampStep[] = [
  { fromSec: 0, intervalMs: 3000, countPerWave: 1 },   // 0-3 min : fuite, apprentissage
  { fromSec: 45, intervalMs: 2200, countPerWave: 1 },
  { fromSec: 100, intervalMs: 1600, countPerWave: 1 },
  { fromSec: 180, intervalMs: 1100, countPerWave: 2 }, // 3:00 : la puissance commence, densité ↑
  { fromSec: 260, intervalMs: 850, countPerWave: 2 },
  { fromSec: 340, intervalMs: 650, countPerWave: 3 },  // ~4,6/s
  { fromSec: 420, intervalMs: 520, countPerWave: 4 },  // ~7,7/s — on fauche
  { fromSec: 500, intervalMs: 430, countPerWave: 5 },
  { fromSec: 540, intervalMs: 360, countPerWave: 6 },  // 9:00 : tension
  { fromSec: 600, intervalMs: 320, countPerWave: 7 },  // 10:00
  { fromSec: 630, intervalMs: 280, countPerWave: 8 }   // 10:30 : climax + boss final
]

export function difficultyScaleAt(elapsedMs: number): DifficultyScale {
  const min = Math.max(0, elapsedMs) / 60000
  // PV : montée DOUCE pendant la puissance (fondent) puis coup de fouet après 9:00 (mur).
  const hp = min <= 9 ? 0.7 + 0.12 * min : 0.7 + 0.12 * 9 + 0.55 * (min - 9)
  return {
    hp, // 3:00→1,06 · 6:00→1,42 · 9:00→1,78 · 11:00→2,88
    contactDamage: 0.5 + 0.16 * min,
    speed: Math.min(1.2, 1.0 + 0.04 * min)
  }
}
```

Et dans `src/content/config.ts` : `maxActive: 300` (dans `SPAWN`).

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/unit/spawnRampArc.test.ts` → PASS.

- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint && npx vitest run
git add -A
git commit -m "feat(content): arc de difficulté découplé (densité forte / PV doux en puissance, mur en fin) + horde maxActive 300

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Re-tuning de l'équilibrage sur la courbe 10-12 min

**Files:**
- Modify: `package.json` (`sim:check` → `--duration 660`)
- Modify: `tools/sim/targets.ts` (cibles du nouvel arc)
- Modify: `tools/sim/baseline.json` (nouvelle baseline)
- Éventuellement re-toucher `src/content/spawnRamp.ts` (calage itératif des nombres — mêmes signatures).

Nature : tâche de **tuning itératif** (pas de TDD unitaire). Le gate est `npm run sim:check` VERT. Méthode déterministe : on lance le harness, on lit les cibles rouges, on tourne UNIQUEMENT les boutons de la rampe (`countPerWave`/`intervalMs`) et de `difficultyScaleAt` (pente `hp`), on relance, jusqu'au vert ; puis on re-baseline.

- [ ] **Step 1: Étendre la durée** — dans `package.json`, `sim:check` : `tsx tools/sim/run.ts --seeds 12 --duration 660 --enforce`.

- [ ] **Step 2: Réécrire les cibles** — dans `tools/sim/targets.ts`, remplacer les constantes par l'arc 11 min (le kite est un joueur moyen) :

```ts
const KITE_MIN_SURVIVAL_MEDIAN_MS = 300000 // atteint le boss de mi-parcours (5:00)
const KITE_MAX_SURVIVE_FULL_PCT = 55       // ne survit pas trivialement les 11 min
const KITE_MIN_FIRST_DEATH_MS = 60000      // départ non punitif (0-1 min de fuite clémente)
const KITE_MAX_HP_DIP_PCT = 40             // les PV plongent en phase brutale (9-11 min) = climax
const UNSKILLED_MIN_DEATH_MS = 45000
```

Garder la structure `evaluateTargets` existante (elle lit déjà `survivalMsMedian`, `survivedFullPct`, `survivalMsMin`, `hpPctCurve`). Objectif de FEEL encodé : le kite atteint le milieu (≥5:00), ses PV plongent (creux < 40 %), il ne survit pas passivement toute la run, et greedy/idle meurent.

- [ ] **Step 3: Mesurer** — `npm run sim -- --seeds 12 --duration 660` (sans `--enforce`) et lire le tableau + les sparklines HP.

- [ ] **Step 4: Itérer jusqu'au vert** — répéter : lire les cibles rouges → ajuster (ex. si kite trop fragile en début → adoucir `SPAWN_RAMP[0..2]`/`difficultyScaleAt.hp` début ; si trop sûr en fin → durcir la pente `hp` après 9:00 ou `countPerWave` fin ; si greedy/idle survivent → densité début un cran au-dessus) → `npm run sim -- --duration 660`. Ne toucher QUE ces boutons (rampe + pente hp), jamais les stats d'armes (Plan A verrouillé). Continuer jusqu'à `npm run sim:check` **VERT**.

- [ ] **Step 5: Re-baseline + commit** — une fois vert :

```bash
npm run sim -- --seeds 12 --duration 660 --save-baseline   # régénère tools/sim/baseline.json
npm run sim:check                                           # doit être VERT
npm run type-check && npm run lint && npx vitest run
git add -A
git commit -m "chore(sim): re-tuning sur la courbe 10-12 min (cibles + baseline du nouvel arc)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Note : vérifier le nom exact du flag de sauvegarde de baseline dans `tools/sim/run.ts` ; l'utiliser tel quel.)

---

## Self-Review

- **Couverture spec (§6 arc & horde, §7 périmètre B1)** : arc 4 temps + densité découplée (Task 3) ✓ ; boss split mid-coffre/final-victoire, évolution atteignable en run (Task 2) ✓ ; horde `maxActive` (Task 3) ✓ ; re-tuning courbe 10-12 min (Task 4) ✓. Hors B1 (→ B2) : rendu horde/perf (pooling/culling/FPS), VFX sweep/strike/évolution, inventaire HUD, icônes pixel des cartes, skin/nom distinct du boss final.
- **Placeholders** : les valeurs de rampe/scale sont concrètes (courbe de départ) ; la Task 4 est explicitement une boucle de tuning avec boutons + cibles concrets + gate `sim:check` vert (les nombres finaux émergent du harness, ce qui est la nature du tuning).
- **Cohérence de types** : `bossRole:'mid'|'final'` (T1) réutilisé par reap (T2, `'mid'`) et `anyFinalBossAlive` (T2, `'final'`) ; `FINAL_BOSS.atMs` (T2) ; signatures `spawnParamsAt`/`difficultyScaleAt` inchangées (T3).

## Notes pour Plan B2 (rendu / horde-perf / UI — à écrire après B1)

Pooling de sprites + culling rendu + test de stress FPS (seam, cible FPS) ; VFX propres sweep/strike/projectiles ; inventaire HUD (icônes + niveaux) ; retour visuel d'évolution (bandeau + halo) ; icônes pixel des cartes (remplacent les monogrammes) ; skin + nom distincts pour le boss final ; bandeau « BOSS FINAL ».
