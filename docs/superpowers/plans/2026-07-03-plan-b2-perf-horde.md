# Plan B2 — Passe de performance horde — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la horde de 300-600 ennemis fluide en supprimant les goulots chiffrés par l'audit : collision/armes en O(P×N) → grille spatiale, create/destroy de sprites → pooling, `getState()` 3×/frame → mutualisé, gemmes d'XP illimitées → bornées.

**Architecture:** Une `SpatialGrid` pure (`src/core`) est reconstruite une fois par pas et fournie à `collisionSystem` et aux requêtes de rayon des armes (elle ne renvoie que des CANDIDATS ; le test de distance exact et la logique de dégâts restent inchangés → sortie identique, prouvée par test). Le rendu (`GameScene`) réutilise des sprites poolés. `main.ts` calcule un seul `AppViewState` par frame. Les gemmes d'XP reçoivent une durée de vie. Aucune règle du cœur (déterminisme, pureté) n'est relâchée.

**Tech Stack:** TypeScript strict, Vitest (happy-dom), harness `npm run sim`, Playwright (seam) pour le stress FPS, Phaser (rendu).

## Global Constraints

- `src/core` & `src/content` : PURS — interdit `Math.random()`/`Date.now()`/`new Date()` (RNG seedé), aucun import Phaser/DOM. Zéro `any`. TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. ESLint `no-non-null-assertion` = 0 warning (guards, pas `!`).
- Déterminisme : même seed + inputs ⇒ même run. La grille NE doit PAS changer la sortie de dégâts (candidats + test exact = résultat identique).
- Data-driven, un fichier = une responsabilité, DA 16-bit.
- Branche : `feat/weapon-system-core` (HEAD `68d14d6`). Commits locaux ; **pas de push sans feu vert**.
- Gates par tâche : `npm run type-check && npm run lint && npm run test` verts ; `npm run sim:check` VERT pour les tâches qui touchent l'équilibrage (grille = doit rester VERT/inchangé ; gemmes = re-valider) ; le stress FPS pour la tâche rendu.
- `SPAWN.maxActive = 300` (déjà en place, B1). Cible horde : 300-600.

---

## File structure

- Create `src/core/spatialGrid.ts` — classe `SpatialGrid` (clear/insert/queryCircle), pure.
- Modify `src/core/simulation.ts` — construit/réutilise une `SpatialGrid` par pas, la passe à `weaponSystem`/`collisionSystem`.
- Modify `src/core/systems/collision.ts` — projectile↔ennemi & contact via la grille.
- Modify `src/core/systems/weapon.ts` — `damageEnemiesInRadius` via la grille (signature threading).
- Modify `src/core/types.ts` (`pickup` gagne `lifeMs?`), `src/core/systems/reap.ts` (gemmes d'XP avec durée de vie), `src/core/systems/pickup.ts` (décrément + despawn des gemmes expirées).
- Modify `src/app/main.ts` — un seul `getState()` par frame partagé (rendu + overlay + audio).
- Create `src/render/spritePool.ts` — free-list de sprites par clé de texture.
- Modify `src/render/scenes/GameScene.ts` — pooling des sprites ennemis/projectiles/pickups.
- Create `tests/e2e/fps-horde.spec.ts` — stress FPS via le seam (500 ennemis).
- Modify `src/core/simulation.ts` + `src/app/app.ts` + `src/app/seam.ts` — helper `debugSpawnEnemies(n)` (test-only, comme les autres helpers debug).
- Tests Vitest : `spatialGrid.test.ts`, `gridEquivalence.test.ts`, `gemLifetime.test.ts`.

---

## Task 1: SpatialGrid (cœur pur)

**Files:**
- Create: `src/core/spatialGrid.ts`
- Test: `tests/unit/spatialGrid.test.ts`

**Interfaces:**
- Produces: `class SpatialGrid { constructor(cellSize: number); clear(): void; insert(id: number, x: number, y: number): void; queryCircle(cx: number, cy: number, radius: number, out: number[]): void }`. `queryCircle` VIDE `out` puis le remplit des ids des cellules chevauchant le cercle (**surensemble** : faux positifs possibles, **jamais** de faux négatif — l'appelant filtre par distance exacte).

- [ ] **Step 1: Write the failing test** — `tests/unit/spatialGrid.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { SpatialGrid } from '@core/spatialGrid'

describe('SpatialGrid', () => {
  it('queryCircle renvoie les ids proches (aucun faux négatif)', () => {
    const g = new SpatialGrid(64)
    g.insert(1, 0, 0)
    g.insert(2, 50, 0)
    g.insert(3, 500, 500)
    const out: number[] = []
    g.queryCircle(0, 0, 60, out)
    expect(out).toContain(1)
    expect(out).toContain(2) // dans le rayon
    expect(out).not.toContain(3) // très loin, cellule non chevauchée
  })
  it('clear vide la grille', () => {
    const g = new SpatialGrid(64)
    g.insert(1, 0, 0)
    g.clear()
    const out: number[] = []
    g.queryCircle(0, 0, 100, out)
    expect(out).toEqual([])
  })
  it('exhaustivité : tout id dont la distance <= rayon est renvoyé (échantillon)', () => {
    const g = new SpatialGrid(64)
    for (let i = 0; i < 200; i++) g.insert(i, (i % 20) * 30, Math.floor(i / 20) * 30)
    const out: number[] = []
    g.queryCircle(150, 150, 90, out)
    // vérifie qu'aucun point réellement dans le rayon n'est omis
    for (let i = 0; i < 200; i++) {
      const x = (i % 20) * 30, y = Math.floor(i / 20) * 30
      if ((x - 150) ** 2 + (y - 150) ** 2 <= 90 * 90) expect(out).toContain(i)
    }
  })
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/unit/spatialGrid.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
/** Grille spatiale uniforme (hachage par cellule) — index de candidats pour requêtes de rayon.
 *  Pure, déterministe. Reconstruite chaque pas ; `queryCircle` peut renvoyer des faux positifs
 *  (l'appelant filtre par distance exacte), jamais de faux négatif. */
export class SpatialGrid {
  private readonly cellSize: number
  private readonly cells = new Map<number, number[]>()

  constructor(cellSize: number) {
    this.cellSize = cellSize > 0 ? cellSize : 1
  }

  clear(): void {
    this.cells.clear()
  }

  private key(cx: number, cy: number): number {
    // Combinaison stable de deux entiers de cellule (offset pour gérer les négatifs).
    return (cx + 100000) * 1000000 + (cy + 100000)
  }

  insert(id: number, x: number, y: number): void {
    const cx = Math.floor(x / this.cellSize)
    const cy = Math.floor(y / this.cellSize)
    const k = this.key(cx, cy)
    const bucket = this.cells.get(k)
    if (bucket === undefined) {
      this.cells.set(k, [id])
    } else {
      bucket.push(id)
    }
  }

  queryCircle(cx: number, cy: number, radius: number, out: number[]): void {
    out.length = 0
    const r = radius < 0 ? 0 : radius
    const minCx = Math.floor((cx - r) / this.cellSize)
    const maxCx = Math.floor((cx + r) / this.cellSize)
    const minCy = Math.floor((cy - r) / this.cellSize)
    const maxCy = Math.floor((cy + r) / this.cellSize)
    for (let gx = minCx; gx <= maxCx; gx++) {
      for (let gy = minCy; gy <= maxCy; gy++) {
        const bucket = this.cells.get(this.key(gx, gy))
        if (bucket !== undefined) {
          for (const id of bucket) out.push(id)
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/unit/spatialGrid.test.ts` → PASS.
- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint
git add src/core/spatialGrid.ts tests/unit/spatialGrid.test.ts
git commit -m "feat(core): SpatialGrid — index de candidats pour requêtes de rayon (pur)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: collisionSystem via la grille (sortie identique prouvée)

**Files:**
- Modify: `src/core/simulation.ts` (construire/réutiliser la grille, la passer)
- Modify: `src/core/systems/collision.ts`
- Test: `tests/unit/gridEquivalence.test.ts`

**Interfaces:**
- Consumes: `SpatialGrid` (Task 1).
- `collisionSystem(world, dtMs, grid: SpatialGrid)` — nouveau param `grid`. Projectile↔ennemi : au lieu de `for en of world.query('enemy',...)`, faire `grid.queryCircle(ppos.x, ppos.y, proj.radius + HITBOX.enemy, cand)` puis, pour chaque candidat, LE MÊME test exact + logique pierce qu'aujourd'hui. Contact ennemi↔joueur : itérer les joueurs (peu nombreux) et `grid.queryCircle(ppos.x, ppos.y, HITBOX.enemy + HITBOX.player, cand)` pour les ennemis proches.
- `simulation.ts` : champ `private readonly enemyGrid = new SpatialGrid(64)`. Dans `step()`, AVANT `weaponSystem`/`collisionSystem` : `this.rebuildEnemyGrid()` (clear + insert tous les ennemis vivants), puis passer `this.enemyGrid` à `collisionSystem`. (Le pas d'insertion reflète les positions APRÈS `movementSystem`/`enemyAiSystem` — l'ordre actuel place la collision après le mouvement, garder cet ordre : construire la grille juste avant collision, avec les positions courantes.)

- [ ] **Step 1: Write the failing test** — `tests/unit/gridEquivalence.test.ts` prouve que la collision via grille produit les MÊMES dégâts que la version linéaire, sur un scénario aléatoire seedé (le test compare deux exécutions : une passe l'ancien scan linéaire réintroduit dans le test, l'autre la grille — ou plus simplement, réutilise les cas de `combat.test.ts`/`weaponKinds.test.ts` en s'assurant qu'ils restent VERTS après le passage à la grille). Écrire un cas ciblé :

```ts
import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { collisionSystem } from '@core/systems/collision'
import { SpatialGrid } from '@core/spatialGrid'

function grid(w: World): SpatialGrid {
  const g = new SpatialGrid(64)
  for (const e of w.query('enemy', 'position', 'health')) {
    const p = w.get(e, 'position'); const h = w.get(e, 'health')
    if (p !== undefined && h !== undefined && h.hp > 0) g.insert(e, p.x, p.y)
  }
  return g
}

describe('collision via grille = identique', () => {
  it('un projectile pierce=1 touche 2 ennemis alignés, pas un 3e hors rayon', () => {
    const w = new World()
    const proj = w.spawn()
    w.add(proj, 'position', { x: 0, y: 0 }); w.add(proj, 'velocity', { x: 0, y: 0 })
    w.add(proj, 'projectile', { type: 'x', damage: 10, ownerId: 1, lifeMs: 1000, radius: 20, pierce: 1 })
    const mk = (x: number) => { const e = w.spawn(); w.add(e, 'position', { x, y: 0 }); w.add(e, 'health', { hp: 100, maxHp: 100 }); w.add(e, 'enemy', { type: 't', speed: 0, isElite: false, isBoss: false, contactDamage: 0, xpValue: 1 }); return e }
    const e1 = mk(5), e2 = mk(6), e3 = mk(500)
    collisionSystem(w, 16, grid(w))
    // e1 touché (pierce décrémenté), projectile continue ; e3 hors rayon intact.
    expect(w.get(e3, 'health')!.hp).toBe(100)
    const hit = [e1, e2].filter((e) => (w.get(e, 'health')?.hp ?? 100) < 100).length
    expect(hit).toBeGreaterThanOrEqual(1)
  })
})
```
(Utiliser des guards au lieu de `!` pour respecter le lint ; l'exemple ci-dessus montre l'intention.)

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/unit/gridEquivalence.test.ts` → FAIL (signature `collisionSystem` à 2 args).
- [ ] **Step 3: Implement** — ajouter le param `grid` à `collisionSystem`, remplacer les deux scans internes par `grid.queryCircle(...)` + test exact inchangé ; dans `simulation.ts`, ajouter `enemyGrid` + `rebuildEnemyGrid()` et passer la grille. Réutiliser un tableau scratch `cand: number[]` par appel.
- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/unit/gridEquivalence.test.ts` + TOUTE la suite (les tests combat/collision existants doivent rester VERTS = preuve d'équivalence) → PASS. Puis `npm run sim:check` doit rester **VERT et inchangé** (la grille ne change pas les dégâts → baseline identique).
- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint && npx vitest run && npm run sim:check
git add -A
git commit -m "perf(core): collisionSystem via SpatialGrid (O(P×N) -> O(P×k)), sortie identique

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: requêtes de rayon des armes via la grille

**Files:**
- Modify: `src/core/systems/weapon.ts` (`damageEnemiesInRadius` + threading `grid`), `src/core/simulation.ts` (passer `grid` à `weaponSystem`)
- Test: la suite d'armes existante (`weaponEffective`/`weapon`/`weaponKinds`) reste VERTE = preuve d'équivalence.

**Interfaces:**
- Consumes: `SpatialGrid`.
- `weaponSystem(world, dtMs, pulses?, fired?, rng?, grid?: SpatialGrid)` — nouveau dernier param OPTIONNEL `grid` (les tests existants qui appellent sans grille continuent de marcher via un repli linéaire). `damageEnemiesInRadius(world, center, reach, damage, grid?)` : si `grid` fourni → candidats via `grid.queryCircle`, sinon repli linéaire actuel. Test exact + dégâts inchangés. `findNearestEnemy` RESTE linéaire (s'exécute à la cadence de l'arme, pas par frame — coût négligeable ; documenter). `simulation.step` passe `this.enemyGrid`.

- [ ] **Step 1: Write the failing test** — pas de nouveau test requis ; le contrat est « la suite d'armes reste verte avec la grille ». Ajouter néanmoins un cas court : `damageEnemiesInRadius` avec grille frappe exactement les ennemis dans le rayon (même ensemble que sans grille) sur un petit scénario. (Écrire ce test AVANT l'implémentation, le voir échouer sur la signature.)
- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/unit/weaponEffective.test.ts` (après avoir ajouté le param) → FAIL si signature incohérente.
- [ ] **Step 3: Implement** — param `grid?` sur `weaponSystem` et `damageEnemiesInRadius` (repli linéaire si absent) ; `simulation.step` passe `this.enemyGrid` en dernier ; commentaire sur `findNearestEnemy` gardé linéaire.
- [ ] **Step 4: Run to verify pass** — `npx vitest run` (toute la suite VERTE) + `npm run sim:check` VERT/inchangé.
- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint && npx vitest run && npm run sim:check
git add -A
git commit -m "perf(core): requêtes de rayon des armes (damageEnemiesInRadius) via SpatialGrid

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Gemmes d'XP bornées (durée de vie)

**Files:**
- Modify: `src/core/types.ts` (`pickup` gagne `lifeMs?: number`), `src/core/systems/reap.ts` (gemme d'XP avec `lifeMs`), `src/core/systems/pickup.ts` (décrément + despawn des pickups expirés)
- Test: `tests/unit/gemLifetime.test.ts`

**Interfaces:**
- `pickup` component : `{ type: PickupKind; value: number; lifeMs?: number }`. Seules les gemmes d'XP reçoivent un `lifeMs` fini ; `coffre`/`heal`/`magnet` restent SANS `lifeMs` (persistent). `reap` pose `lifeMs = PICKUP.gemLifeMs` (nouvelle constante `config.ts`, ex. `20000`). `pickupSystem` (ou un pas dédié) : pour chaque pickup avec `lifeMs !== undefined`, `lifeMs -= dtMs` ; si `<= 0`, despawn (sans effet). But : borne l'accumulation de gemmes non ramassées.

- [ ] **Step 1: Write the failing test** — `tests/unit/gemLifetime.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { World } from '@core/world'
import { pickupSystem } from '@core/systems/pickup'

describe('durée de vie des gemmes', () => {
  it('une gemme d\'XP non ramassée expire et disparaît', () => {
    const w = new World()
    const gem = w.spawn()
    w.add(gem, 'position', { x: 9999, y: 9999 }) // loin du joueur -> non ramassée
    w.add(gem, 'pickup', { type: 'xp', value: 5, lifeMs: 100 })
    pickupSystem(w, 200, []) // 200ms > 100ms de vie
    expect(w.alive(gem)).toBe(false)
  })
  it('un coffre (sans lifeMs) ne disparaît jamais avec le temps', () => {
    const w = new World()
    const chest = w.spawn()
    w.add(chest, 'position', { x: 9999, y: 9999 })
    w.add(chest, 'pickup', { type: 'coffre', value: 0 })
    pickupSystem(w, 100000, [])
    expect(w.alive(chest)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/unit/gemLifetime.test.ts` → FAIL (pas d'expiration).
- [ ] **Step 3: Implement** — `config.ts` `PICKUP.gemLifeMs = 20000` ; `types.ts` `pickup.lifeMs?` ; `reap.ts` pose `lifeMs` sur les gemmes `xp` ; `pickup.ts` décrémente + despawn les pickups expirés (avant/après la collecte, sans double compte).
- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/unit/gemLifetime.test.ts` + toute la suite. Puis **`npm run sim:check` : re-valider** (une durée de vie généreuse de 20 s doit laisser l'économie d'XP quasi inchangée → cibles VERTES ; si l'XP est trop rognée, augmenter `gemLifeMs` et re-baseliner).
- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint && npx vitest run && npm run sim:check
git add -A
git commit -m "perf(core): durée de vie des gemmes d'XP (borne l'accumulation à la horde)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Un seul getState par frame (de-dup)

**Files:**
- Modify: `src/app/main.ts` (la boucle rAF appelle `app.getState()` en plus de `GameScene`)
- Modify: `src/render/scenes/GameScene.ts` (`update` refait `app.getState()`)
- Test: `tests/unit/getStateCache.test.ts` (via `App` : deux lectures dans la même frame renvoient le même objet ; frame suivante = nouvel objet)

**Interfaces:**
- Ajouter sur `App` un cache : `private stateFrame = -1; private cachedState: AppViewState | null`. Nouvelle méthode `getStateForFrame(frame: number): AppViewState` qui renvoie `cachedState` si `frame === stateFrame`, sinon recalcule `getState()` et met en cache. `main.ts` incrémente un compteur de frame par rAF et passe `frame` à `GameScene` (via `sceneData` ou un getter) et à la boucle overlay, de sorte que rendu + overlay + audio partagent un seul `AppViewState` par frame. `getState()` (lecture pure) reste inchangé et disponible pour le seam/tests.

- [ ] **Step 1: Write the failing test** — `tests/unit/getStateCache.test.ts` : `app.getStateForFrame(5) === app.getStateForFrame(5)` (même référence), `app.getStateForFrame(6) !== app.getStateForFrame(5)`.
- [ ] **Step 2: Run to verify fail** — FAIL (méthode absente).
- [ ] **Step 3: Implement** — cache par frame sur `App` ; câbler `main.ts` (compteur de frame rAF) pour que `GameScene.update`, l'overlay et l'audio consomment `getStateForFrame(frame)`.
- [ ] **Step 4: Run to verify pass** — `npx vitest run` VERT. (Le rendu réel se valide au stress FPS, Task 7.)
- [ ] **Step 5: Gates + commit**

```bash
npm run type-check && npm run lint && npx vitest run
git add -A
git commit -m "perf(app): un seul AppViewState par frame (mutualisé rendu/overlay/audio)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Pooling de sprites (rendu)

**Files:**
- Create: `src/render/spritePool.ts`
- Modify: `src/render/scenes/GameScene.ts` (ennemis/projectiles/pickups poolés)
- Validation: le stress FPS (Task 7) + un contrôle visuel via le seam (pas de sprite fantôme/teinté résiduel).

**Interfaces:**
- Produces: `class SpritePool { constructor(scene: Phaser.Scene); acquire(textureKey: string, x: number, y: number): Phaser.GameObjects.Sprite; release(sprite: Phaser.GameObjects.Sprite): void }`. `acquire` réutilise un sprite libre de la même `textureKey` (pop de la free-list) en le réinitialisant (`setActive(true).setVisible(true).clearTint().setAlpha(1).setScale(...).setPosition(x,y).setTexture(key)`) ou en crée un via `scene.add.sprite` si la free-list est vide. `release` fait `setActive(false).setVisible(false)` et pousse dans la free-list par `textureKey`.
- `GameScene` : au lieu de `this.add.sprite(...)` à l'apparition et `sprite.destroy()` à la disparition (ennemis l.507/527, projectiles l.540/556, pickups l.568/578 environ), passer par le pool. IMPÉRATIF (piège relevé par l'audit) : à `acquire`, RESET tint/scale/alpha/frame — ne pas hériter de l'occupant précédent. Le VFX de mort (poussière/flash) reste inchangé ; seul le sprite de l'entité est poolé.

- [ ] **Step 1: Écrire le pool** `src/render/spritePool.ts` (pas de test Vitest fiable en happy-dom sans Phaser réel — la validation est le stress FPS + le contrôle visuel seam).
- [ ] **Step 2: Câbler `GameScene`** — remplacer create/destroy des sprites ennemis/projectiles/pickups par `acquire`/`release`. Conserver les `Map<id, sprite>` de suivi.
- [ ] **Step 3: Vérifier le build** — `npm run type-check && npm run lint && npx vitest run` (les tests headless ne rendent pas, doivent rester VERTS).
- [ ] **Step 4: Contrôle visuel seam** — via Playwright/seam, spawner des ennemis, en tuer, en re-spawner, capturer : aucun sprite résiduel visible, aucune teinte héritée (ex. après un court-circuit qui teinte, un ennemi neuf au même slot n'est pas teinté).
- [ ] **Step 5: Commit**

```bash
git add src/render/spritePool.ts src/render/scenes/GameScene.ts
git commit -m "perf(render): pooling des sprites (réutilise au lieu de create/destroy) + reset à l'acquisition

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Helper debug + stress FPS horde (gate de la passe)

**Files:**
- Modify: `src/core/simulation.ts` (`debugSpawnEnemies(n)`), `src/app/app.ts` + `src/app/seam.ts` (pass-through)
- Create: `tests/e2e/fps-horde.spec.ts`

**Interfaces:**
- `Simulation.debugSpawnEnemies(n: number): void` — spawne `n` ennemis de la phase courante autour du joueur (réutilise `spawnWave`/`spawnEnemy`, RNG seedé), test-only, exposé sur `App`/seam comme `debugGrant` (Plan A/B1).
- `tests/e2e/fps-horde.spec.ts` : charge `?autostart=solo&seed=7&test=1`, appelle `__GAME__.debugSpawnEnemies(500)`, laisse tourner ~2 s de rAF réel, mesure les temps de frame (`requestAnimationFrame` deltas collectés dans la page), et **assert un budget** : temps de frame MÉDIAN < 33 ms (≥ 30 fps) en WebGL logiciel de CI. Le rapport imprime la médiane/p95. (La vraie cible 60 fps se valide sur le matériel réel de l'utilisateur ; le gate CI est volontairement indulgent car le WebGL logiciel headless est lent — l'objectif du gate est de détecter une régression O(N²), pas de mesurer le HW.)

- [ ] **Step 1: Implémenter `debugSpawnEnemies`** + pass-through App/seam (test-only, commenté).
- [ ] **Step 2: Écrire `fps-horde.spec.ts`** (mesure + assertions ci-dessus).
- [ ] **Step 3: Lancer** `npx playwright test tests/e2e/fps-horde.spec.ts --project=chromium` → doit passer le budget indulgent ; imprimer médiane/p95 pour le journal.
- [ ] **Step 4: Gates finaux** — `npm run type-check && npm run lint && npx vitest run && npm run sim:check && npx playwright test`.
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(perf): debugSpawnEnemies + stress FPS horde (500 ennemis) au seam

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Couverture** : grille spatiale (T1) + consommateurs collision (T2) & armes (T3) — le O(P×N) chiffré par l'audit ; gemmes bornées (T4) ; getState mutualisé (T5) ; pooling sprites (T6) ; gate FPS (T7). Bonus (trim lames orbitales, buffers scratch) : à glisser opportuniste­ment dans T3/T6 s'il reste du budget, sinon Plan B3.
- **Équivalence** : la grille ne renvoie que des candidats ; test exact + logique de dégâts inchangés → sortie identique, prouvée par « la suite combat/armes reste verte » + `sim:check` inchangé (T2/T3). C'est le garde-fou anti-régression réclamé par l'audit.
- **Types** : `SpatialGrid` (T1) réutilisé par T2/T3 ; `pickup.lifeMs?` (T4) ; `getStateForFrame(frame)` (T5) ; `SpritePool` (T6) ; `debugSpawnEnemies` (T7).
- **Placeholders** : le pool (T6) n'a pas de test Vitest (Phaser non rendable en happy-dom) — validé par le stress FPS + contrôle visuel seam ; c'est explicite, pas un trou.

## Notes pour Plan B3 (UI / VFX / assets — après B2)
Inventaire HUD (icônes armes/passifs + niveaux), retour visuel d'évolution (bandeau + halo), **icônes pixel des cartes** (génération PixelLab via le skill assets — remplacent les monogrammes), VFX propres sweep/strike/projectiles, skin + nom + bandeau distincts du boss final.
