# Système d'armes VS — Plan A (cœur déterministe) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le système d'armes plat par le cœur d'un modèle Vampire Survivors — armes qui montent en niveau (tables de stats), passifs = stats globales agrégées, cartes de level-up 1-parmi-4, et évolutions (arme au max + passif catalyseur via coffre) — le tout pur/déterministe dans `src/core`+`src/content`, testable sans navigateur.

**Architecture:** Data-driven. Le contenu (`src/content`) déclare les tables de niveaux d'armes, les passifs (contributions aux `PlayerStats`) et la table d'évolutions. Le cœur (`src/core`) porte l'état (slot d'arme avec `level`, composant `passives`, `PlayerStats` dérivé) et des systèmes purs (cartes, évolution, dégâts effectifs). Aucun Phaser/DOM dans le cœur. Le rendu et l'UI riche sont hors de ce plan (Plan B) ; on garde juste la build verte (les cartes exposent `name`/`description` pour l'overlay existant).

**Tech Stack:** TypeScript strict, Vitest (happy-dom), harness `npm run sim`, RNG seedé (`src/core/rng.ts`).

## Global Constraints

- `src/core` et `src/content` : **interdit** `Math.random()`, `Date.now()`, `new Date()` — utiliser le `Rng` seedé passé en paramètre. (ESLint le vérifie.)
- `src/core` n'importe **jamais** Phaser ni le DOM.
- Zéro `any` dans `src/core` ; `tsconfig` strict + `noUncheckedIndexedAccess`.
- Data-driven : armes/passifs/évolutions = données typées dans `src/content`, validées à l'usage.
- Un fichier = une responsabilité.
- Déterminisme : même seed + mêmes inputs ⇒ même partie.
- Texte in-game en français.
- Périmètre slice : armes `cloueur, scie, marteau, pied_de_biche, court_circuit` + évoluées `mitrailleuse_clous, haute_tension` ; passifs `air_comprime, groupe_electrogene, outillage_renforce, cadence_chantier, casque_homologue, chaussures_securite` ; évolutions `cloueur+air_comprime→mitrailleuse_clous`, `court_circuit+groupe_electrogene→haute_tension`.
- Gates à la fin de chaque tâche : `npm run type-check && npm run lint && npm run test` verts.
- Pas de push (le plan committe en local ; push sur demande explicite).

---

## File structure

- Create `src/content/passives.ts` — `PlayerStats`, `StatKey`, `PassiveDef`, `PASSIVES`, `BASE_STATS`, `aggregatePassives()`.
- Rewrite `src/content/weapons.ts` — `WeaponKind`, `WeaponLevel`, `WeaponDef`, `buildLevels()`, `WEAPONS` (5 base + 2 évoluées), `weaponStatsAtLevel()`.
- Create `src/content/effectiveStats.ts` — `effectiveWeaponStats(level, stats)` (combine table de niveau ⊗ `PlayerStats`).
- Create `src/content/evolutions.ts` — `EvolutionDef`, `EVOLUTIONS`, `findEvolution()`.
- Create `src/core/systems/cards.ts` — `Card`, `rollCards()`, `applyCard()`, `eligibleCards()`.
- Create `src/core/systems/evolution.ts` — `tryEvolve()`.
- Create `src/core/systems/playerStats.ts` — `recomputePlayerStats()` (applique `PlayerStats` au joueur : speed/maxHp/pickup).
- Modify `src/core/types.ts` — slot `{id, level, cooldownLeftMs}` ; composant `passives` ; `PickupKind += 'coffre'` ; `PlayerState` gagne `weaponLevels`, `passives`.
- Modify `src/content/config.ts` — `INVENTORY = { weapons: 6, passives: 6 }` ; garder `STARTING_WEAPONS = ['cloueur']`.
- Modify `src/core/systems/weapon.ts` — lit `effectiveWeaponStats` ; ajoute les comportements `sweep` (pied-de-biche) et `strike` (court-circuit).
- Modify `src/core/simulation.ts` — init `passives`, `recomputePlayerStats` ; level-up via cartes ; collecte coffre → `tryEvolve` ; `getState` expose niveaux/passifs.
- Modify `src/content/upgrades.ts` — **supprimé** ; `rollUpgradeChoices` remplacé par `rollCards`. Adapter `src/app/app.ts` + `src/ui/overlay.ts` pour consommer les cartes (affichage minimal : `name`/`hint`).
- Tests : un fichier Vitest par système pur sous `tests/unit/`.

---

## Task 1: Passifs & PlayerStats (contenu pur)

**Files:**
- Create: `src/content/passives.ts`
- Test: `tests/unit/passives.test.ts`

**Interfaces:**
- Produces:
  - `type StatKey = 'might'|'area'|'amount'|'cooldown'|'duration'|'projectileSpeed'|'moveSpeed'|'maxHp'|'recovery'|'magnet'|'growth'`
  - `interface PlayerStats { might:number; area:number; amount:number; cooldown:number; duration:number; projectileSpeed:number; moveSpeed:number; maxHp:number; recovery:number; magnet:number; growth:number }`
  - `interface PassiveDef { id:string; name:string; description:string; maxLevel:number; perLevel: Partial<Record<StatKey, number>> }`
  - `const BASE_STATS: PlayerStats` — multiplicateurs à 1 (`might,area,cooldown,duration,projectileSpeed,moveSpeed,maxHp,magnet,growth`), additifs à 0 (`amount,recovery`).
  - `const PASSIVES: Record<string, PassiveDef>`
  - `function aggregatePassives(owned: ReadonlyArray<{id:string; level:number}>): PlayerStats`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { aggregatePassives, BASE_STATS, PASSIVES } from '@content/passives'

describe('passifs — agrégation en PlayerStats (pur)', () => {
  it('inventaire vide → stats de base', () => {
    expect(aggregatePassives([])).toEqual(BASE_STATS)
  })
  it('Outillage renforcé niv.3 → might 1 + 3×0.10 = 1.30', () => {
    const s = aggregatePassives([{ id: 'outillage_renforce', level: 3 }])
    expect(s.might).toBeCloseTo(1.3)
  })
  it('Groupe électrogène (additif) niv.2 → amount 0 + 2 = 2', () => {
    expect(aggregatePassives([{ id: 'groupe_electrogene', level: 2 }]).amount).toBe(2)
  })
  it('Cadence niv.5 → cooldown 1 − 5×0.08 = 0.60', () => {
    expect(aggregatePassives([{ id: 'cadence_chantier', level: 5 }]).cooldown).toBeCloseTo(0.6)
  })
  it('chaque passif du slice existe avec un maxLevel > 0', () => {
    for (const id of ['air_comprime','groupe_electrogene','outillage_renforce','cadence_chantier','casque_homologue','chaussures_securite']) {
      expect(PASSIVES[id]?.maxLevel, id).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/passives.test.ts`
Expected: FAIL (module `@content/passives` introuvable).

- [ ] **Step 3: Write the implementation**

```ts
export type StatKey =
  | 'might' | 'area' | 'amount' | 'cooldown' | 'duration'
  | 'projectileSpeed' | 'moveSpeed' | 'maxHp' | 'recovery' | 'magnet' | 'growth'

export interface PlayerStats {
  might: number; area: number; amount: number; cooldown: number; duration: number
  projectileSpeed: number; moveSpeed: number; maxHp: number; recovery: number; magnet: number; growth: number
}

export interface PassiveDef {
  id: string; name: string; description: string; maxLevel: number
  perLevel: Partial<Record<StatKey, number>>
}

export const BASE_STATS: PlayerStats = {
  might: 1, area: 1, amount: 0, cooldown: 1, duration: 1,
  projectileSpeed: 1, moveSpeed: 1, maxHp: 1, recovery: 0, magnet: 1, growth: 1
}

export const PASSIVES: Record<string, PassiveDef> = {
  air_comprime:        { id: 'air_comprime', name: 'Air comprimé', description: '+10 % de vitesse de projectile.', maxLevel: 5, perLevel: { projectileSpeed: 0.1 } },
  groupe_electrogene:  { id: 'groupe_electrogene', name: 'Groupe électrogène', description: '+1 projectile.', maxLevel: 2, perLevel: { amount: 1 } },
  outillage_renforce:  { id: 'outillage_renforce', name: 'Outillage renforcé', description: '+10 % de dégâts.', maxLevel: 5, perLevel: { might: 0.1 } },
  cadence_chantier:    { id: 'cadence_chantier', name: 'Cadence de chantier', description: '−8 % de temps de recharge.', maxLevel: 5, perLevel: { cooldown: -0.08 } },
  casque_homologue:    { id: 'casque_homologue', name: 'Casque homologué', description: '+10 % de PV max.', maxLevel: 5, perLevel: { maxHp: 0.1 } },
  chaussures_securite: { id: 'chaussures_securite', name: 'Chaussures de sécurité', description: '+10 % de vitesse.', maxLevel: 5, perLevel: { moveSpeed: 0.1 } }
}

export function aggregatePassives(owned: ReadonlyArray<{ id: string; level: number }>): PlayerStats {
  const s: PlayerStats = { ...BASE_STATS }
  for (const { id, level } of owned) {
    const def = PASSIVES[id]
    if (def === undefined) continue
    const lvl = Math.max(0, Math.min(level, def.maxLevel))
    for (const [key, per] of Object.entries(def.perLevel)) {
      s[key as StatKey] += (per ?? 0) * lvl
    }
  }
  return s
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/passives.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Gates + commit**

Run: `npm run type-check && npm run lint`
```bash
git add src/content/passives.ts tests/unit/passives.test.ts
git commit -m "feat(content): passifs data-driven + aggregatePassives (PlayerStats pur)"
```

---

## Task 2: Tables de niveaux d'armes (contenu pur)

**Files:**
- Modify (rewrite): `src/content/weapons.ts`
- Test: `tests/unit/weaponLevels.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type WeaponKind = 'projectile'|'orbital'|'aura'|'sweep'|'strike'`
  - `interface WeaponLevel { damage:number; cooldownMs:number; count:number; area:number; pierce:number; projectileSpeed?:number; projectileLifeMs?:number; orbitRadius?:number; orbitSpeed?:number; orbitHitRadius?:number }`
  - `interface WeaponDef { id:string; name:string; kind:WeaponKind; maxLevel:number; levels: WeaponLevel[] }`
  - `function buildLevels(base: WeaponLevel, grow: Partial<WeaponLevel>, maxLevel: number, overrides?: Record<number, Partial<WeaponLevel>>): WeaponLevel[]`
  - `const WEAPONS: Record<string, WeaponDef>` — clés : `cloueur, scie, marteau, pied_de_biche, court_circuit, mitrailleuse_clous, haute_tension`.
  - `function weaponStatsAtLevel(def: WeaponDef, level: number): WeaponLevel`
  - `const STARTING_WEAPON_ID = 'cloueur'`

Notes de conception : `buildLevels` produit un tableau EXPLICITE (niveaux 1..maxLevel) à partir d'une base + un incrément par niveau `grow` (ajouté à chaque palier au-delà du 1er) + des `overrides` ponctuels (ex. +1 `count` au niveau 4). Résultat = vraies lignes de stats, tunables ensuite. `count` = nb de projectiles/lames/frappes. Valeurs de départ conservatrices (le tuning fin est en Plan B).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { WEAPONS, weaponStatsAtLevel, buildLevels } from '@content/weapons'

describe('armes — tables de niveaux (pur)', () => {
  it('les 5 armes de base + 2 évoluées existent avec maxLevel niveaux', () => {
    for (const id of ['cloueur','scie','marteau','pied_de_biche','court_circuit','mitrailleuse_clous','haute_tension']) {
      const def = WEAPONS[id]
      expect(def, id).toBeDefined()
      expect(def!.levels.length, id).toBe(def!.maxLevel)
    }
  })
  it('les dégâts croissent avec le niveau', () => {
    const d = WEAPONS['cloueur']!
    expect(weaponStatsAtLevel(d, 8).damage).toBeGreaterThan(weaponStatsAtLevel(d, 1).damage)
  })
  it('weaponStatsAtLevel borne aux extrêmes (0 → niv.1, >max → max)', () => {
    const d = WEAPONS['cloueur']!
    expect(weaponStatsAtLevel(d, 0)).toEqual(weaponStatsAtLevel(d, 1))
    expect(weaponStatsAtLevel(d, 99)).toEqual(weaponStatsAtLevel(d, d.maxLevel))
  })
  it('buildLevels applique grow + overrides', () => {
    const base = { damage: 10, cooldownMs: 500, count: 1, area: 0, pierce: 0 }
    const lv = buildLevels(base, { damage: 2 }, 3, { 3: { count: 2 } })
    expect(lv[0]!.damage).toBe(10)
    expect(lv[2]!.damage).toBe(14) // 10 + 2*2
    expect(lv[2]!.count).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/weaponLevels.test.ts`
Expected: FAIL (exports manquants).

- [ ] **Step 3: Write the implementation**

```ts
export type WeaponKind = 'projectile' | 'orbital' | 'aura' | 'sweep' | 'strike'

export interface WeaponLevel {
  damage: number; cooldownMs: number; count: number; area: number; pierce: number
  projectileSpeed?: number; projectileLifeMs?: number
  orbitRadius?: number; orbitSpeed?: number; orbitHitRadius?: number
}
export interface WeaponDef { id: string; name: string; kind: WeaponKind; maxLevel: number; levels: WeaponLevel[] }

export function buildLevels(
  base: WeaponLevel, grow: Partial<WeaponLevel>, maxLevel: number, overrides: Record<number, Partial<WeaponLevel>> = {}
): WeaponLevel[] {
  const out: WeaponLevel[] = []
  for (let n = 1; n <= maxLevel; n++) {
    const row: WeaponLevel = { ...base }
    for (const [k, v] of Object.entries(grow)) {
      if (typeof v === 'number') (row as Record<string, number>)[k] = ((base as Record<string, number>)[k] ?? 0) + v * (n - 1)
    }
    const ov = overrides[n]
    if (ov !== undefined) Object.assign(row, ov)
    out.push(row)
  }
  return out
}

export const STARTING_WEAPON_ID = 'cloueur'

export const WEAPONS: Record<string, WeaponDef> = {
  cloueur: { id: 'cloueur', name: 'Cloueur', kind: 'projectile', maxLevel: 8,
    levels: buildLevels(
      { damage: 8, cooldownMs: 500, count: 1, area: 0, pierce: 0, projectileSpeed: 520, projectileLifeMs: 1500 },
      { damage: 2 }, 8, { 3: { count: 2 }, 6: { count: 3 } }) },
  scie: { id: 'scie', name: 'Scie orbitale', kind: 'orbital', maxLevel: 8,
    levels: buildLevels(
      { damage: 6, cooldownMs: 250, count: 2, area: 0, pierce: 99, orbitRadius: 104, orbitSpeed: 3.6, orbitHitRadius: 22 },
      { damage: 1.5 }, 8, { 4: { count: 3 }, 7: { count: 4 } }) },
  marteau: { id: 'marteau', name: 'Marteau-piqueur', kind: 'aura', maxLevel: 8,
    levels: buildLevels(
      { damage: 10, cooldownMs: 900, count: 1, area: 175, pierce: 99 },
      { damage: 3, area: 8 }, 8) },
  pied_de_biche: { id: 'pied_de_biche', name: 'Pied-de-biche', kind: 'sweep', maxLevel: 8,
    levels: buildLevels(
      { damage: 14, cooldownMs: 700, count: 1, area: 120, pierce: 99 },
      { damage: 4, area: 6 }, 8, { 5: { count: 2 } }) },
  court_circuit: { id: 'court_circuit', name: 'Court-circuit', kind: 'strike', maxLevel: 8,
    levels: buildLevels(
      { damage: 12, cooldownMs: 950, count: 1, area: 60, pierce: 0 },
      { damage: 3 }, 8, { 3: { count: 2 }, 6: { count: 3 } }) },
  // Évoluées (niveau unique puissant ; montent via les passifs globaux)
  mitrailleuse_clous: { id: 'mitrailleuse_clous', name: 'Mitrailleuse à clous', kind: 'projectile', maxLevel: 1,
    levels: [{ damage: 30, cooldownMs: 140, count: 4, area: 0, pierce: 2, projectileSpeed: 640, projectileLifeMs: 1600 }] },
  haute_tension: { id: 'haute_tension', name: 'Haute tension', kind: 'strike', maxLevel: 1,
    levels: [{ damage: 45, cooldownMs: 380, count: 6, area: 80, pierce: 0 }] }
}

export function weaponStatsAtLevel(def: WeaponDef, level: number): WeaponLevel {
  const i = Math.max(0, Math.min(level, def.maxLevel) - 1)
  return def.levels[i] ?? def.levels[0]!
}
```

- [ ] **Step 4: Run tests + gates**

Run: `npx vitest run tests/unit/weaponLevels.test.ts`
Expected: PASS. Puis : le build casse ailleurs (l'ancien `WeaponDef` a disparu) — c'est attendu, réparé en Task 5. Ne pas lancer `type-check` global ici.

- [ ] **Step 5: Commit**

```bash
git add src/content/weapons.ts tests/unit/weaponLevels.test.ts
git commit -m "feat(content): tables de niveaux d'armes (buildLevels) + 5 base + 2 évoluées"
```

---

## Task 3: Stats effectives (arme × passifs)

**Files:**
- Create: `src/content/effectiveStats.ts`
- Test: `tests/unit/effectiveStats.test.ts`

**Interfaces:**
- Consumes: `WeaponLevel` (Task 2), `PlayerStats` (Task 1).
- Produces: `interface EffectiveStats { damage:number; cooldownMs:number; count:number; area:number; pierce:number; projectileSpeed:number; projectileLifeMs:number; orbitRadius:number; orbitSpeed:number; orbitHitRadius:number }`
  et `function effectiveWeaponStats(lvl: WeaponLevel, stats: PlayerStats): EffectiveStats`.

Règles de combinaison : `damage = lvl.damage × might` ; `cooldownMs = lvl.cooldownMs × cooldown` (borné ≥ 60) ; `count = lvl.count + amount` ; `area = lvl.area × area` ; `projectileSpeed = (lvl.projectileSpeed ?? 0) × projectileSpeed` ; `projectileLifeMs = (lvl.projectileLifeMs ?? 0) × duration` ; `orbitRadius/orbitSpeed` inchangés × area/duration respectifs ; `orbitHitRadius = (lvl.orbitHitRadius ?? 0) × area` ; `pierce = lvl.pierce`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { effectiveWeaponStats } from '@content/effectiveStats'
import { BASE_STATS } from '@content/passives'
import { WEAPONS, weaponStatsAtLevel } from '@content/weapons'

describe('stats effectives (arme × passifs)', () => {
  const lvl = weaponStatsAtLevel(WEAPONS['cloueur']!, 1)
  it('stats de base → dégâts inchangés', () => {
    expect(effectiveWeaponStats(lvl, BASE_STATS).damage).toBe(lvl.damage)
  })
  it('might 1.5 → +50 % dégâts', () => {
    expect(effectiveWeaponStats(lvl, { ...BASE_STATS, might: 1.5 }).damage).toBeCloseTo(lvl.damage * 1.5)
  })
  it('amount +2 → count += 2', () => {
    expect(effectiveWeaponStats(lvl, { ...BASE_STATS, amount: 2 }).count).toBe(lvl.count + 2)
  })
  it('cooldown borné à 60 ms minimum', () => {
    expect(effectiveWeaponStats(lvl, { ...BASE_STATS, cooldown: 0.001 }).cooldownMs).toBe(60)
  })
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/unit/effectiveStats.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
import type { WeaponLevel } from './weapons'
import type { PlayerStats } from './passives'

export interface EffectiveStats {
  damage: number; cooldownMs: number; count: number; area: number; pierce: number
  projectileSpeed: number; projectileLifeMs: number; orbitRadius: number; orbitSpeed: number; orbitHitRadius: number
}

const MIN_COOLDOWN_MS = 60

export function effectiveWeaponStats(lvl: WeaponLevel, s: PlayerStats): EffectiveStats {
  return {
    damage: lvl.damage * s.might,
    cooldownMs: Math.max(MIN_COOLDOWN_MS, lvl.cooldownMs * s.cooldown),
    count: lvl.count + s.amount,
    area: lvl.area * s.area,
    pierce: lvl.pierce,
    projectileSpeed: (lvl.projectileSpeed ?? 0) * s.projectileSpeed,
    projectileLifeMs: (lvl.projectileLifeMs ?? 0) * s.duration,
    orbitRadius: (lvl.orbitRadius ?? 0) * s.area,
    orbitSpeed: (lvl.orbitSpeed ?? 0),
    orbitHitRadius: (lvl.orbitHitRadius ?? 0) * s.area
  }
}
```

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/content/effectiveStats.ts tests/unit/effectiveStats.test.ts
git commit -m "feat(content): effectiveWeaponStats (table de niveau ⊗ PlayerStats)"
```

---

## Task 4: Types cœur + composant passifs + PlayerStats appliqué

**Files:**
- Modify: `src/core/types.ts` (composants + `PlayerState`), `src/content/config.ts` (INVENTORY)
- Create: `src/core/systems/playerStats.ts`
- Test: `tests/unit/playerStats.test.ts`

**Interfaces:**
- Modify `types.ts` :
  - composant `weapons` : `slots: { id: string; level: number; cooldownLeftMs: number }[]`
  - nouveau composant `passives` : `{ list: { id: string; level: number }[] }`
  - `PickupKind` : ajouter `'coffre'`
  - `PlayerState` : ajouter `weapons: string[]` (déjà là), `weaponLevels: number[]`, `passives: { id: string; level: number }[]`
- `config.ts` : `export const INVENTORY = { weapons: 6, passives: 6 } as const`
- Produces : `function recomputePlayerStats(world: World, entity: EntityId): void` — lit le composant `passives`, dérive `PlayerStats`, et écrit : `player.speed = PLAYER_BASE.speed × moveSpeed` ; `player.pickupRadius = PLAYER_BASE.pickupRadius × magnet` ; `health.maxHp = PLAYER_BASE.hp × maxHp` (en conservant le ratio hp/maxHp) ; stocke le `PlayerStats` dérivé dans un composant `stats` pour lecture par le weaponSystem. Ajouter composant `stats: PlayerStats` dans `types.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { recomputePlayerStats } from '@core/systems/playerStats'
import { PLAYER_BASE } from '@content/config'

function makePlayer(w: World) {
  const e = w.spawn()
  w.add(e, 'health', { hp: PLAYER_BASE.hp, maxHp: PLAYER_BASE.hp })
  w.add(e, 'player', { playerId: 1, speed: PLAYER_BASE.speed, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: PLAYER_BASE.pickupRadius })
  w.add(e, 'passives', { list: [] })
  return e
}

describe('recomputePlayerStats', () => {
  it('sans passif → stats de base', () => {
    const w = new World(); const e = makePlayer(w)
    recomputePlayerStats(w, e)
    expect(w.get(e, 'player')!.speed).toBe(PLAYER_BASE.speed)
    expect(w.get(e, 'health')!.maxHp).toBe(PLAYER_BASE.hp)
  })
  it('Casque niv.5 → +50 % PV max, ratio conservé', () => {
    const w = new World(); const e = makePlayer(w)
    w.get(e, 'health')!.hp = PLAYER_BASE.hp / 2
    w.get(e, 'passives')!.list = [{ id: 'casque_homologue', level: 5 }]
    recomputePlayerStats(w, e)
    expect(w.get(e, 'health')!.maxHp).toBeCloseTo(PLAYER_BASE.hp * 1.5)
    expect(w.get(e, 'health')!.hp).toBeCloseTo(PLAYER_BASE.hp * 1.5 / 2)
  })
})
```

- [ ] **Step 2: Run to verify fail** — FAIL (module + composant `passives`/`stats` absents).

- [ ] **Step 3: Implement types + config + playerStats.ts**

Dans `types.ts` : élargir `Components` — `weapons.slots[].level:number`, ajouter `passives: { list: {id:string;level:number}[] }` et `stats: PlayerStats` (importer le type depuis `@content/passives`), et `PickupKind = ... | 'coffre'`. Dans `PlayerState` ajouter `weaponLevels: number[]` et `passives: {id:string;level:number}[]`. Dans `config.ts` ajouter `INVENTORY`.

```ts
// src/core/systems/playerStats.ts
import type { World } from '../world'
import type { EntityId } from '../types'
import { aggregatePassives } from '@content/passives'
import { PLAYER_BASE } from '@content/config'

export function recomputePlayerStats(world: World, entity: EntityId): void {
  const passives = world.get(entity, 'passives')
  const player = world.get(entity, 'player')
  const health = world.get(entity, 'health')
  if (passives === undefined || player === undefined) return
  const s = aggregatePassives(passives.list)
  world.add(entity, 'stats', s)
  player.speed = PLAYER_BASE.speed * s.moveSpeed
  player.pickupRadius = PLAYER_BASE.pickupRadius * s.magnet
  if (health !== undefined) {
    const ratio = health.maxHp > 0 ? health.hp / health.maxHp : 1
    health.maxHp = PLAYER_BASE.hp * s.maxHp
    health.hp = Math.min(health.maxHp, health.maxHp * ratio)
  }
}
```

- [ ] **Step 4: Run tests** — PASS. (Le build global reste rouge tant que Task 5-7 ne sont pas faits.)
- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/content/config.ts src/core/systems/playerStats.ts tests/unit/playerStats.test.ts
git commit -m "feat(core): composants passives/stats + recomputePlayerStats + INVENTORY"
```

---

## Task 5: weaponSystem lit les stats effectives + comportements sweep/strike

**Files:**
- Modify: `src/core/systems/weapon.ts`
- Test: `tests/unit/weaponEffective.test.ts` (+ garder `tests/unit/weapon.test.ts`, `weaponKinds.test.ts` verts en adaptant les slots à `{id,level,cooldownLeftMs}`)

**Interfaces:**
- Consumes: `effectiveWeaponStats` (Task 3), composant `stats` (Task 4), slot `{id,level,cooldownLeftMs}`.
- La signature `weaponSystem(world, dtMs, pulses?, fired?)` est inchangée.

Détails : dans la boucle par slot, résoudre `def = WEAPONS[slot.id]`, `lvl = weaponStatsAtLevel(def, slot.level)`, `stats = world.get(e,'stats') ?? BASE_STATS`, `eff = effectiveWeaponStats(lvl, stats)`. Chaque `tick*` lit `eff` (plus de `player.damageMult`/`cooldownMult`). Nouveaux kinds :
- `sweep` (pied-de-biche) : à la cadence, inflige `eff.damage` dans un rectangle horizontal devant/derrière le joueur — implémenté simplement comme `damageEnemiesInRadius` centré sur le joueur avec `reach = eff.area` (balayage circulaire lisible ; la forme rect exacte est du polish Plan B). `count` > 1 → plusieurs impulsions rapprochées (réutiliser la même passe).
- `strike` (court-circuit) : à la cadence, choisit `eff.count` ennemis (via `rng` seedé passé au système — ajouter param `rng?: Rng`) et inflige `eff.damage` en zone `eff.area` autour de chacun. Fournir `findRandomEnemies(world, rng, n)` pur.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { Rng } from '@core/rng'
import { weaponSystem } from '@core/systems/weapon'

function player(w: World, weaponId: string, level: number, stats?: Partial<import('@content/passives').PlayerStats>) {
  const e = w.spawn()
  w.add(e, 'position', { x: 0, y: 0 }); w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp: 100, maxHp: 100 })
  w.add(e, 'player', { playerId: 1, speed: 200, vigilance: 100, damageMult: 1, cooldownMult: 1, pickupRadius: 90 })
  w.add(e, 'weapons', { slots: [{ id: weaponId, level, cooldownLeftMs: 0 }] })
  w.add(e, 'stats', { might:1, area:1, amount:0, cooldown:1, duration:1, projectileSpeed:1, moveSpeed:1, maxHp:1, recovery:0, magnet:1, growth:1, ...stats })
  return e
}
function enemy(w: World, x: number, y: number, hp = 50) {
  const e = w.spawn(); w.add(e, 'position', { x, y }); w.add(e, 'velocity', { x: 0, y: 0 })
  w.add(e, 'health', { hp, maxHp: hp })
  w.add(e, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 1 })
  return e
}

describe('weaponSystem — stats effectives + kinds', () => {
  it('marteau (aura) : might 2 double les dégâts sur un ennemi proche', () => {
    const w = new World(); player(w, 'marteau', 1, { might: 2 }); const en = enemy(w, 20, 0, 100)
    weaponSystem(w, 1000)
    expect(w.get(en, 'health')!.hp).toBeLessThan(100 - 10) // > dégâts de base
  })
  it('court_circuit (strike) frappe un ennemi au hasard (déterministe par seed)', () => {
    const w = new World(); player(w, 'court_circuit', 1); const en = enemy(w, 300, 0, 100)
    weaponSystem(w, 2000, undefined, undefined, new Rng(1))
    expect(w.get(en, 'health')!.hp).toBeLessThan(100)
  })
})
```

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement** — réécrire `weapon.ts` : lecture `eff`, brancher `sweep`/`strike`, ajouter `rng?: Rng` en dernier param et `findRandomEnemies`. Adapter `simulation.step()` pour passer `this.rng` (ou un rng dédié) au `weaponSystem`. Mettre à jour les tests existants `weapon.test.ts`/`weaponKinds.test.ts` : slots `{id, level:1, cooldownLeftMs:0}` + ajouter composant `stats` de base.

- [ ] **Step 4: Run** `npx vitest run tests/unit/weaponEffective.test.ts tests/unit/weapon.test.ts tests/unit/weaponKinds.test.ts` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/core/systems/weapon.ts src/core/simulation.ts tests/unit/weaponEffective.test.ts tests/unit/weapon.test.ts tests/unit/weaponKinds.test.ts
git commit -m "feat(core): weaponSystem lit les stats effectives + kinds sweep/strike"
```

---

## Task 6: Cartes de level-up (tirage pur)

**Files:**
- Create: `src/core/systems/cards.ts`
- Test: `tests/unit/cards.test.ts`

**Interfaces:**
- Consumes: `WEAPONS` (maxLevel), `PASSIVES` (maxLevel), `INVENTORY` (Task 4), `Rng`.
- Produces:
  - `type CardKind = 'weapon-new'|'passive-new'|'weapon-up'|'passive-up'`
  - `interface Card { kind: CardKind; id: string; name: string; hint: string }`
  - `interface Inventory { weapons: { id:string; level:number }[]; passives: { id:string; level:number }[] }`
  - `function eligibleCards(inv: Inventory): Card[]`
  - `function rollCards(rng: Rng, inv: Inventory, count: number): Card[]` — jusqu'à `count` cartes distinctes tirées sans remise depuis `eligibleCards` (mélange Fisher-Yates seedé).

`hint` = `Nouveau` pour les `-new`, `Niv. X → Y` pour les `-up`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { Rng } from '@core/rng'
import { rollCards, eligibleCards } from '@core/systems/cards'

const inv = (w: {id:string;level:number}[], p: {id:string;level:number}[]) => ({ weapons: w, passives: p })

describe('cartes de level-up (pur)', () => {
  it('inventaire d\'armes plein (6) → aucune carte weapon-new', () => {
    const full = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, level: 1 }))
    // ids bidon ignorés par eligibleCards pour le level-up ; on teste juste l\'absence de new
    const cards = eligibleCards(inv(full, []))
    expect(cards.some(c => c.kind === 'weapon-new')).toBe(false)
  })
  it('arme au max exclue des cartes weapon-up', () => {
    const cards = eligibleCards(inv([{ id: 'cloueur', level: 8 }], []))
    expect(cards.some(c => c.kind === 'weapon-up' && c.id === 'cloueur')).toBe(false)
  })
  it('rollCards renvoie ≤ count cartes distinctes et déterministes', () => {
    const a = rollCards(new Rng(7), inv([{ id: 'cloueur', level: 1 }], []), 4)
    const b = rollCards(new Rng(7), inv([{ id: 'cloueur', level: 1 }], []), 4)
    expect(a).toEqual(b)
    expect(new Set(a.map(c => c.kind + c.id)).size).toBe(a.length)
    expect(a.length).toBeLessThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement** — `eligibleCards` : pour chaque arme possédée `level < maxLevel` → `weapon-up` ; si `inv.weapons.length < INVENTORY.weapons` → un `weapon-new` par arme de `WEAPONS` non possédée **et non évoluée** (exclure les `maxLevel===1` évoluées : filtre `id ∈ {cloueur,scie,marteau,pied_de_biche,court_circuit}` via une liste `BASE_WEAPON_IDS`) ; idem passifs. `rollCards` = Fisher-Yates seedé sur `eligibleCards`, prendre `count`.

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Gates + commit**

```bash
git add src/core/systems/cards.ts tests/unit/cards.test.ts
git commit -m "feat(core): tirage de cartes de level-up (new/up, seedé, inventaire limité)"
```

---

## Task 7: Level-up par cartes dans la simulation

**Files:**
- Modify: `src/core/simulation.ts`, `src/core/types.ts` (`PendingLevelUp.choices: Card[]`)
- Modify: `src/app/app.ts`, `src/ui/overlay.ts` (consommer `Card` : afficher `name` + `hint`)
- Delete: `src/content/upgrades.ts` ; retirer ses imports/tests (`upgrades`-spécifiques)
- Test: `tests/unit/levelupCards.test.ts`

**Interfaces:**
- Consumes: `rollCards`, `Inventory` (Task 6), `recomputePlayerStats` (Task 4).
- `Simulation.chooseUpgrade(index)` reste le point d'entrée du seam (compat) et applique la carte : `weapon-new` → ajoute slot `{id, level:1}` ; `weapon-up` → `slot.level++` ; `passive-new` → ajoute `{id, level:1}` à `passives.list` puis `recomputePlayerStats` ; `passive-up` → `level++` puis `recomputePlayerStats`.
- `getState()` : `pendingLevelUp.choices` = `Card[]` (l'overlay lit `name`/`hint`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'

describe('level-up par cartes (sim)', () => {
  it('monter de niveau propose des cartes et le choix les applique', () => {
    const sim = new Simulation({ seed: 5, mode: 'solo' })
    let sawChoices = false
    for (let t = 0; t < 120000; t += 100) {
      sim.advanceTime(100)
      const st = sim.getState()
      if (st.pendingLevelUp) {
        expect(st.pendingLevelUp.choices.length).toBeGreaterThan(0)
        expect(typeof st.pendingLevelUp.choices[0]!.name).toBe('string')
        sawChoices = true
        sim.chooseUpgrade(0)
        break
      }
    }
    expect(sawChoices).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify fail** — FAIL (choices n'ont pas `name`/`hint` / upgrades supprimé).

- [ ] **Step 3: Implement** — dans `simulation.ts` : construire `Inventory` depuis les composants `weapons`/`passives` du joueur ; `checkLevelUp` → `rollCards(this.rng, inv, PROGRESSION.choices)` ; `chooseUpgrade` applique la carte (voir interfaces) ; spawn initial : ajouter composant `passives:{list:[]}`, `recomputePlayerStats`. Adapter `app.ts`/`overlay.ts` : `MenuItemView`/carte lit `name` + `hint` (déjà proche). Supprimer `upgrades.ts` + refs.

- [ ] **Step 4: Run** `npx vitest run tests/unit/levelupCards.test.ts` + toute la suite `npx vitest run` — PASS (adapter les tests cassés par la suppression d'upgrades).
- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint
git add -A
git commit -m "feat(core): level-up par cartes new/+niveau (remplace les upgrades globaux)"
```

---

## Task 8: Évolutions (contenu + tryEvolve)

**Files:**
- Create: `src/content/evolutions.ts`, `src/core/systems/evolution.ts`
- Test: `tests/unit/evolution.test.ts`

**Interfaces:**
- Produces:
  - `interface EvolutionDef { base: string; passive: string; evolved: string; reqBaseLevel: number; reqPassiveLevel: number }`
  - `const EVOLUTIONS: EvolutionDef[]` = `[{ base:'cloueur', passive:'air_comprime', evolved:'mitrailleuse_clous', reqBaseLevel:8, reqPassiveLevel:1 }, { base:'court_circuit', passive:'groupe_electrogene', evolved:'haute_tension', reqBaseLevel:8, reqPassiveLevel:1 }]`
  - `function findEvolution(inv: Inventory): EvolutionDef | null` — 1ère évolution éligible (ordre des slots d'armes).
  - `function tryEvolve(world, playerEntity): string | null` — applique l'évolution (remplace le slot d'arme par `evolved`, level 1), renvoie l'id évolué, ou `null` si aucune.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { tryEvolve } from '@core/systems/evolution'

function setup(weapons: {id:string;level:number}[], passives: {id:string;level:number}[]) {
  const w = new World(); const e = w.spawn()
  w.add(e, 'weapons', { slots: weapons.map(x => ({ ...x, cooldownLeftMs: 0 })) })
  w.add(e, 'passives', { list: passives })
  return { w, e }
}

describe('tryEvolve', () => {
  it('cloueur max + air comprimé → mitrailleuse_clous', () => {
    const { w, e } = setup([{ id: 'cloueur', level: 8 }], [{ id: 'air_comprime', level: 2 }])
    expect(tryEvolve(w, e)).toBe('mitrailleuse_clous')
    expect(w.get(e, 'weapons')!.slots[0]!.id).toBe('mitrailleuse_clous')
  })
  it('cloueur pas au max → pas d\'évolution', () => {
    const { w, e } = setup([{ id: 'cloueur', level: 7 }], [{ id: 'air_comprime', level: 1 }])
    expect(tryEvolve(w, e)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fail** — FAIL.
- [ ] **Step 3: Implement** `evolutions.ts` + `evolution.ts` (utilise `WEAPONS` pour `reqBaseLevel = maxLevel`, `findEvolution`, mutation du slot).
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/content/evolutions.ts src/core/systems/evolution.ts tests/unit/evolution.test.ts
git commit -m "feat(content+core): table d'évolutions + tryEvolve"
```

---

## Task 9: Coffre → évolution dans la simulation

**Files:**
- Modify: `src/core/simulation.ts`, `src/core/systems/pickup.ts` (gérer le type `coffre`), `src/core/events.ts` (`EvolvedEvent`)
- Test: `tests/unit/chestEvolution.test.ts`

**Interfaces:**
- Consumes: `tryEvolve` (Task 8).
- Un pickup `{ type:'coffre' }` collecté → appelle `tryEvolve(world, player)` ; si `!= null` → `events.dispatchEvent(new EvolvedEvent(id))` ; sinon bonus (soin = 30 PV borné à maxHp). Ajouter une méthode test-only `spawnChestAt(x,y)` sur `Simulation` (ou exposer via un pickup spawn dans un helper) pour tester sans attendre le boss.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'

describe('coffre → évolution', () => {
  it('cloueur max + air comprimé + coffre ramassé → mitrailleuse_clous', () => {
    const sim = new Simulation({ seed: 1, mode: 'solo' })
    sim.debugGrant?.({ weapons: [{ id: 'cloueur', level: 8 }], passives: [{ id: 'air_comprime', level: 1 }] })
    let evolved = ''
    sim.events.addEventListener('evolved', (e) => { evolved = (e as import('@core/events').EvolvedEvent).weaponId })
    sim.debugSpawnChestOnPlayer?.()
    sim.advanceTime(200)
    expect(evolved).toBe('mitrailleuse_clous')
    expect(sim.getState().players[0]!.weapons).toContain('mitrailleuse_clous')
  })
})
```

- [ ] **Step 2: Run to verify fail** — FAIL.
- [ ] **Step 3: Implement** — `pickupSystem` : sur `coffre`, ne pas donner d'XP mais marquer une sortie `chestCollected` (out-param) que `simulation.step` consomme pour `tryEvolve` (garder le core pur, l'événement est dispatché par la sim comme les autres). Ajouter `EvolvedEvent` dans `events.ts`. Ajouter les helpers debug `debugGrant`/`debugSpawnChestOnPlayer` (gardés au build, utiles au seam/tests). 
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint
git add -A
git commit -m "feat(core): pickup coffre déclenche tryEvolve + EvolvedEvent"
```

---

## Task 10: getState expose armes/niveaux/passifs + validation harness

**Files:**
- Modify: `src/core/simulation.ts` (`collectPlayers` → `weaponLevels`, `passives`)
- Test: `tests/unit/statePlayerInventory.test.ts`
- Validation: `npm run sim` (inchangé au niveau des invariants) + suite complète.

**Interfaces:**
- `PlayerState.weaponLevels: number[]` (aligné sur `weapons`), `PlayerState.passives: {id:string;level:number}[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { Simulation } from '@core/simulation'

describe('getState — inventaire joueur exposé', () => {
  it('le joueur démarre avec cloueur niv.1 et 0 passif', () => {
    const p = new Simulation({ seed: 2, mode: 'solo' }).getState().players[0]!
    expect(p.weapons).toEqual(['cloueur'])
    expect(p.weaponLevels).toEqual([1])
    expect(p.passives).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify fail** — FAIL.
- [ ] **Step 3: Implement** — enrichir `collectPlayers`.
- [ ] **Step 4: Run** `npx vitest run` (toute la suite) + `npm run sim -- --seed 42 --duration 300 --bot greedy` (invariants verts : pas de NaN, HP jamais négatif silencieux). 
- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint && npm run test
git add -A
git commit -m "feat(core): getState expose weaponLevels + passives (seam)"
```

---

## Self-review (à faire après rédaction, corriger inline)

- **Couverture spec** : modèle tables-par-niveau (T2) ✓ · passifs globaux (T1) ✓ · stats effectives (T3) ✓ · slot `level` + PlayerStats appliqué (T4) ✓ · weaponSystem + kinds sweep/strike (T5) ✓ · cartes 1-parmi-4 + inventaire plein (T6-7) ✓ · évolutions + coffre (T8-9) ✓ · seam expose l'inventaire (T10) ✓. Hors Plan A (→ Plan B) : rendu horde/perf, inventaire HUD, UI carte riche, split boss, arc/difficulté, re-tuning.
- **Placeholders** : aucun « TODO/handle edge cases » ; valeurs de niveaux concrètes (tuning fin = Plan B, documenté).
- **Cohérence de types** : `Card`, `Inventory`, `PlayerStats`, `EffectiveStats`, `WeaponLevel`, `EvolutionDef` définis une fois et réutilisés ; `chooseUpgrade` conservé comme entrée seam.

## Notes pour Plan B (à écrire après exécution de Plan A)

Rendu : inventaire HUD (icônes + niveaux), écran de carte enrichi (actuel→suivant, icônes), VFX/bandeau d'évolution, sprites `sweep`/`strike`. Run : split boss (mi-parcours coffre + final victoire), découplage `difficultyScaleAt` (nombre↑ fort / PV↑ doux en puissance), densité `SPAWN.maxActive` 400-600, **pooling** + **culling** + **test de stress FPS** via le seam. Équilibrage : re-dériver cibles + baseline `npm run sim` sur la courbe 10-12 min.
